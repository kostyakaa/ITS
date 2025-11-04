// world.js
import * as THREE from "three";
import { WORLD, TEXTURE } from "./config.js";
import { VoxelCar as Car } from "./voxelCar.js";
import { makeCrossCurbs } from "./curb.js";
import { makeCrossSidewalks } from "./sidewalk.js";
import {
  makeTrafficLight,
  setTrafficLightState,
  setDiscState,
} from "./trafficLight.js";


const loadingManager = new THREE.LoadingManager();

loadingManager.onProgress = function (url, itemsLoaded, itemsTotal) {
    const loaderText = document.querySelector("#loader p");
    if (loaderText) loaderText.textContent = `Загрузка ресурсов... (${itemsLoaded} из ${itemsTotal})`;
};

loadingManager.onLoad = function () {
    const loader = document.getElementById("loader");
    const canvas = document.querySelector("canvas.game");
    if (loader) {
        loader.remove()
    }
    if (canvas) canvas.style.display = "block";
};


function normAngle(radOrDeg) {
    if (!Number.isFinite(radOrDeg)) return null;
    const v = Math.abs(radOrDeg);
    const asRad = v > (Math.PI * 2 + 1e-3) ? (radOrDeg * Math.PI / 180) : radOrDeg;
    return asRad;
}

function setupTexture(renderer, tex) {
  if (!tex) return null;
  if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
  else if ("sRGBEncoding" in THREE) tex.encoding = THREE.sRGBEncoding;

  const aniso =
    renderer?.capabilities?.getMaxAnisotropy?.() != null
      ? renderer.capabilities.getMaxAnisotropy()
      : 8;
  tex.anisotropy = Math.max(8, aniso || 8);

  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

class SceneObject {
    constructor(mesh = new THREE.Group()) {
        this.node = mesh;
        this.node.matrixAutoUpdate = true;
    }

    addTo(parent) {
        parent.add(this.node);
        return this;
    }

    setPosition(x, y, z = 0) {
        this.node.position.set(x, y, z);
        return this;
    }

    setRotationZ(rad) {
        this.node.rotation.z = rad || 0;
        return this;
    }
}

class CarObject extends SceneObject {
    constructor() {
        super(new Car());
    }
}

export class World {
    constructor() {
        this.group = new THREE.Group();
        this.clock = new THREE.Clock();
        this.renderer = null;

        this.cars = new Map();
        this.lights = new Map();

        this._road = null;
        this._curbsOuter = null;
        this._curbsInner = null;
        this._sidewalks = null;

        this.server = {
            init: (payload = {}) => this._apiInit(payload),
            update: (changes = {}) => this._apiUpdate(changes),

            createTrafficLight: (id, opts = {}) => this._createTrafficLight(id, opts),
            createCar: (id, opts = {}) => this._createCar(id, opts),
            setTrafficLightColor: (id, color) => this._setTrafficLightColor(id, color),
            moveCar: (id, pose = {}) => this._moveCar(id, pose),
            deleteCar: (id) => this._deleteCar(id),
        };

    // строим синхронно то, что можем сразу, а дорогу грузим асинхронно
    this._buildStatic();
    this._buildRoad().catch((e) => {
      console.error("[World] road build failed:", e);
    });
  }

    attachRenderer(renderer) {
        this.renderer = renderer;
    }

    async _build() {
        await this._buildRoad();
        this._buildCurbsAndSidewalks();
    }

  // -------- static parts (бордюры/тротуары) --------
  _buildStatic() {
    const inner = makeCrossCurbs({
      span: 25, offset: 11, shift: 35.5, z: 0.0,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.32, tileLen: 0.9, gap: 0.02 },
    });
    const outer = makeCrossCurbs({
      span: 25, offset: 7, shift: 32, z: 0.0,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.16, tileLen: 0.9, gap: 0.02 },
    });
    const sidewalks = makeCrossSidewalks({
      angle: 0, span: 25, offsetA: 7, offsetB: 11, shift: 35.5, z: 0.0,
      curbDepth: 0.34, h: 0.32,
    });

  // -------- dynamic road (SVG / IMG / layers) --------
  async _buildRoad() {
    const sizeMeters = TEXTURE?.meters ?? WORLD.size ?? 100;
    const seg = Math.max(1, Math.floor((sizeMeters ?? 100) * 2));
    const geom = new THREE.PlaneGeometry(sizeMeters, sizeMeters, seg, seg);

    const sizePx = TEXTURE?.pixels ?? 8192;
    let texture = null;

    // 1) Пытаемся прогнать через канвас любую картинку (SVG/PNG/JPG)
    if (TEXTURE?.url) {
      texture = await textureFromSVGorImage(TEXTURE.url, sizePx, this.renderer);
    }

    // 2) Если нет общего url — пробуем собрать из слоёв
    if (!texture && TEXTURE?.layers && Object.values(TEXTURE.layers).some(Boolean)) {
      texture = await textureFromLayers(TEXTURE.layers, sizePx, this.renderer);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: texture ? 0xffffff : 0x2f3545,
      map: texture || null,
      metalness: 0.0,
      roughness: 0.9,
      displacementMap: null,
      displacementScale: 0,
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.z = -0.01; // немного ниже всего
    mesh.receiveShadow = true;

    this.group.add(mesh);
    this._road = mesh;
  }

  // -------------- API from server / main ----------------
  _apiInit(payload = {}) {
    if (Array.isArray(payload.lights)) {
      for (const L of payload.lights) {
        if (!L || L.id == null) continue;
        this._createTrafficLight(L.id, L);
        if (L.color) this._setTrafficLightColor(L.id, L.color);
      }
    }
    if (Array.isArray(payload.cars)) {
      for (const C of payload.cars) {
        if (!C || C.id == null) continue;
        this._createCar(C.id, C);
      }
    }
  }

    _apiUpdate(changes = {}) {
        if (Array.isArray(changes.setLight)) {
            for (const it of changes.setLight) {
                if (!it || it.id == null || !it.color) continue;
                this._setTrafficLightColor(it.id, it.color);
            }
        }
        if (Array.isArray(changes.moveCar)) {
            for (const it of changes.moveCar) {
                if (!it || it.id == null) continue;
                this._moveCar(it.id, it);
            }
        }
    }

    /** Создать/обновить светофор по id. */
    _createTrafficLight(id, {x = 0, y = 0, z = 0, rot = 0, color = "red"} = {}) {
        let tl = this.lights.get(id);
        if (!tl) {
            tl = makeTrafficLight({up: "z"});
            this.group.add(tl);
            this.lights.set(id, tl);
        }
        const yaw = normAngle(rot) ?? 0;
        tl.position.set(x, y, z);
        // ВАЖНО: поворот по yaw → ось Z
        tl.rotation.z = yaw;

        // никакой автосмены — фиксируем цвет
        tl.userData._discCycle = null;
        setTrafficLightState(tl, color);
        setDiscState(tl, color);
        return tl;
    }

    /** Поставить фиксированный цвет светофора. */
    _setTrafficLightColor(id, color /* 'red'|'yellow'|'green' */) {
        const tl = this.lights.get(id);
        if (!tl) return false;
        tl.userData._discCycle = null;
        setTrafficLightState(tl, color);
        setDiscState(tl, color);
        return true;
    }

  /** Создать/обновить машинку по id. */
  _createCar(id, { x = 0, y = 0, z = 0, rot = 0 } = {}) {
    let obj = this.cars.get(id);
    if (!obj) {
      obj = new CarObject().addTo(this.group);
      this.cars.set(id, obj);
    }
    const yaw = normAngle(rot);
    obj.setPosition(x, y, z).setRotationZ(yaw);
    return obj;
  }

    _moveCar(id, {x, y, z = 0, rot = null} = {}) {
        const obj = this.cars.get(id);
        if (!obj) return false;
        if (Number.isFinite(x) && Number.isFinite(y)) obj.setPosition(x, y, z);
        if (Number.isFinite(rot)) obj.setRotationZ(normAngle(rot));
        return true;
    }

    _deleteCar(id) {
        const obj = this.cars.get(id);
        if (!obj) return false;

        if (obj.parent) {
            obj.parent.remove(obj);
        }

        this.cars.delete(id);

        return true;
    }


    update() {
        this.clock.getDelta();
    }
}