// world.js
import * as THREE from 'three';
import { WORLD, TEXTURE } from './config.js';
import { VoxelCar as Car } from './voxelCar.js';
import { makeCrossCurbs } from './curb.js';
import { makeCrossSidewalks } from './sidewalk.js';
import { makeTrafficLight, setTrafficLightState, setDiscState } from './trafficLight.js';

// ——————————————————————————————————————————
// utils
// ——————————————————————————————————————————
function toRad(angle) {
  if (angle == null) return null;
  const n = (typeof angle === 'string') ? parseFloat(angle) : angle;
  if (!isFinite(n)) return null;
  return Math.abs(n) > (Math.PI * 2 + 1e-3) ? (n * Math.PI / 180) : n;
}

function setupTexture(renderer, tex) {
  if (!tex) return null;
  if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) tex.encoding = THREE.sRGBEncoding;
  const aniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
  tex.anisotropy = Math.max(8, aniso);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ——————————————————————————————————————————
// basic scene object wrappers
// ——————————————————————————————————————————
class SceneObject {
  constructor(mesh = new THREE.Group()) {
    this.node = mesh;
    this.node.matrixAutoUpdate = true;
  }
  addTo(parent){ parent.add(this.node); return this; }
  setPosition(x,y,z=0){ this.node.position.set(x,y,z); return this; }
  setRotationZ(rad){ this.node.rotation.z = rad || 0; return this; }
}

class CarObject extends SceneObject {
  constructor() {
    const pivot = new THREE.Group();       // внешний пивот для yaw
    const mesh = new Car();                // внутренняя модель
    pivot.add(mesh);
    super(pivot);
    this.mesh = mesh;
  }
}

// ——————————————————————————————————————————
// world
// ——————————————————————————————————————————
export class World {
  constructor() {
    this.group = new THREE.Group();
    this.clock = new THREE.Clock();
    this.renderer = null;

    // entities by id
    this.cars = new Map();   // id -> CarObject
    this.lights = new Map(); // id -> THREE.Group (traffic light)

    // env meshes
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
    };

    this._build();
  }

  attachRenderer(renderer){ this.renderer = renderer; }

  async _build(){
    await this._buildRoad();
    this._buildCurbsAndSidewalks();
  }

  async _buildRoad(){
    const load = (url) => new Promise((res) => {
      if (!url) return res(null);
      new THREE.TextureLoader().load(url, (t) => res(setupTexture(this.renderer, t)), undefined, () => res(null));
    });

    const [base,markings,crosswalks,edges] = await Promise.all([
      load(TEXTURE.layers?.base || TEXTURE.url),
      load(TEXTURE.layers?.markings),
      load(TEXTURE.layers?.crosswalks),
      load(TEXTURE.layers?.edges),
    ]);

    const seed = base || markings || crosswalks || edges;
    const sizeMeters = TEXTURE.meters ?? WORLD.size;

    let colorMap=null, dispMap=null;
    if (seed?.image) {
      const w = seed.image.width, h = seed.image.height;
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      const ctx = c.getContext('2d');
      if (base?.image) ctx.drawImage(base.image,0,0,w,h);
      if (markings?.image) ctx.drawImage(markings.image,0,0,w,h);
      if (crosswalks?.image){ ctx.globalAlpha=0.9; ctx.drawImage(crosswalks.image,0,0,w,h); ctx.globalAlpha=1; }
      if (edges?.image) ctx.drawImage(edges.image,0,0,w,h);
      colorMap = setupTexture(this.renderer, new THREE.CanvasTexture(c));

      if (markings?.image || crosswalks?.image){
        const d = document.createElement('canvas'); d.width=w; d.height=h;
        const dctx = d.getContext('2d');
        dctx.fillStyle = 'rgb(0,0,0)';
        dctx.fillRect(0,0,w,h);
        if (markings?.image) dctx.drawImage(markings.image,0,0,w,h);
        if (crosswalks?.image) dctx.drawImage(crosswalks.image,0,0,w,h);
        dispMap = setupTexture(this.renderer, new THREE.CanvasTexture(d));
      }
    }

    const seg = Math.max(1, Math.floor((TEXTURE.meters ?? 100) * 2));
    const geom = new THREE.PlaneGeometry(sizeMeters, sizeMeters, seg, seg);
    const mat = new THREE.MeshStandardMaterial({
      color: colorMap ? 0xffffff : 0x2f3545,
      metalness: 0, roughness: 0.9,
      map: colorMap || null,
      displacementMap: dispMap || null,
      displacementScale: dispMap ? ((TEXTURE.meters/(TEXTURE.pixels||5000))*2.0) : 0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.z = -0.01;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this._road = mesh;
  }

  _buildCurbsAndSidewalks(){
    const inner = makeCrossCurbs({
      span: 25, offset: 11, shift: 35.5, z: 0.00,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.32, tileLen: 0.90, gap: 0.02 },
    });
    const outer = makeCrossCurbs({
      span: 25, offset: 7, shift: 32, z: 0.00,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.16, tileLen: 0.90, gap: 0.02 },
    });
    const sidewalks = makeCrossSidewalks({
      angle: 0, span: 25, offsetA: 7, offsetB: 11, shift: 35.5, z: 0.00,
      curbDepth: 0.34, h: 0.32,
    });

    this.group.add(outer); this._curbsOuter = outer;
    this.group.add(inner); this._curbsInner = inner;
    this.group.add(sidewalks); this._sidewalks = sidewalks;
  }

  // ——————————————————————————————————————————
  // server API impl
  // ——————————————————————————————————————————
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

  _createTrafficLight(id, { x = 0, y = 0, z = 0, rot = 0, color = 'red' } = {}) {
    let tl = this.lights.get(id);
    if (!tl) {
      tl = makeTrafficLight({ up: 'z' });
      this.group.add(tl);
      this.lights.set(id, tl);
    }
    const yaw = toRad(rot) ?? 0;
    tl.position.set(Number(x)||0, Number(y)||0, Number(z)||0);
    tl.rotation.z = yaw; // yaw around Z
    tl.userData._discCycle = null; // freeze any cycle
    setTrafficLightState(tl, color);
    setDiscState(tl, color);
    return tl;
  }

  _setTrafficLightColor(id, color) {
    const tl = this.lights.get(id);
    if (!tl) return false;
    tl.userData._discCycle = null;
    setTrafficLightState(tl, color);
    setDiscState(tl, color);
    return true;
  }

  _createCar(id, { x = 0, y = 0, z = 0, rot = 0 } = {}) {
    let obj = this.cars.get(id);
    if (!obj) {
      obj = new CarObject().addTo(this.group);
      this.cars.set(id, obj);
    }
    const yaw = toRad(rot) ?? 0;
    obj.setPosition(Number(x)||0, Number(y)||0, Number(z)||0).setRotationZ(yaw);
    obj.node.updateMatrixWorld(true);
    return obj;
  }

  _moveCar(id, { x, y, z = 0, rot = null } = {}) {
    const obj = this.cars.get(id);
    if (!obj) return false;
    if (x != null && y != null) obj.setPosition(Number(x), Number(y), Number(z ?? 0));
    if (rot != null) {
      const yaw = toRad(rot);
      if (yaw != null) obj.setRotationZ(yaw);
    }
    obj.node.updateMatrixWorld(true);
    return true;
  }

  update(){
    this.clock.getDelta(); // reserved for future animations
  }
}