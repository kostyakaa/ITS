import * as THREE from "three";
import {WORLD, TEXTURE} from "./config.js";
import {VoxelCar as Car} from "./voxelCar.js";
import {makeCrossCurbs} from "./curb.js";
import {makeCrossSidewalks} from "./sidewalk.js";
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
    if (!Number.isFinite(radOrDeg)) return 0;
    const v = Math.abs(radOrDeg);
    return v > (Math.PI * 2 + 1e-3) ? (radOrDeg * Math.PI) / 180 : radOrDeg;
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

function loadImage(url) {
    return new Promise((resolve) => {
        if (!url) return resolve(null);
        loadingManager.itemStart(url);
        const img = new Image();
        img.crossOrigin = "anonymous"; // безопасно для same-origin; не мешает и при локальной подаче
        img.onload = () => {
            loadingManager.itemEnd(url);
            resolve(img);
        }
        img.onerror = () => {
            loadingManager.itemError(url);
            resolve(null);
        }
        img.src = url;
    });
}

function makeCanvas(w, h) {
    const C = document.createElement("canvas");
    C.width = w;
    C.height = h;
    return C;
}

async function textureFromSVGorImage(url, targetSizePx, renderer) {
    // Универсальная отрисовка в Canvas → CanvasTexture (надёжнее, чем прямой TextureLoader для SVG)
    const img = await loadImage(url);
    if (!img) return null;

    // const size = Math.max(256, Math.min(16384, targetSizePx | 0 || 8192));
    const size = Math.max(256, Math.min(4096, targetSizePx | 0 || 2048));

    const C = makeCanvas(size, size);
    const ctx = C.getContext("2d");

    // заполняем фон (на случай прозрачного SVG)
    ctx.fillStyle = "#2f3545";
    ctx.fillRect(0, 0, size, size);

    // "cover" — равномерно растянуть, сохраняя пропорции, чтобы закрыть квадрат
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw && ih) {
        const s = Math.max(size / iw, size / ih);
        const dw = iw * s;
        const dh = ih * s;
        const dx = (size - dw) * 0.5;
        const dy = (size - dh) * 0.5;
        ctx.drawImage(img, dx, dy, dw, dh);
    } else {
        // fallback — просто нарисовать как есть
        ctx.drawImage(img, 0, 0, size, size);
    }

    const tex = new THREE.CanvasTexture(C);
    return setupTexture(renderer, tex);
}

async function textureFromLayers(layers, targetSizePx, renderer) {
    const order = ["base", "edges", "markings", "crosswalks"]; // порядок композиции
    const size = Math.max(256, Math.min(16384, targetSizePx | 0 || 8192));
    const C = makeCanvas(size, size);
    const ctx = C.getContext("2d");
    ctx.imageSmoothingEnabled = true;

    // фон
    ctx.fillStyle = "#2f3545";
    ctx.fillRect(0, 0, size, size);

    for (const key of order) {
        const url = layers?.[key];
        if (!url) continue;
        const img = await loadImage(url);
        if (!img) continue;
        ctx.drawImage(img, 0, 0, size, size);
    }

    const tex = new THREE.CanvasTexture(C);
    return setupTexture(renderer, tex);
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

export function makeTree({
                             height = 30,           // базовая высота кроны (в твоих единицах)
                             s = 0.06,              // 👉 scaleFactor: 0.45 по умолчанию — больше НЕ огромные
                             trunkColor = 0x4d2926,
                             crownColor = 0x7aa21d,
                             steps = 4,             // сколько "ступеней" у кроны (все — кубы)
                             shrink = 0,         // насколько сжимать каждую следующую ступень по X/Y
                         } = {}) {
    const tree = new THREE.Group();

    // ствол (квадратный), высоты/ширины отмасштабированы
    const trunkW = 15 * s, trunkD = 15 * s, trunkH = 20 * s;
    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(trunkW, trunkD, trunkH),
        new THREE.MeshLambertMaterial({color: trunkColor, flatShading: true})
    );
    trunk.position.z = trunkH / 2;             // стоит вертикально (никакого инверта)
    trunk.castShadow = trunk.receiveShadow = true;
    tree.add(trunk);

    // крона (ступеньки из квадратов)
    const crownH = height * s;
    const crownBaseW = height * s, crownBaseD = height * s;
    const gap = 2 * s; // небольшой зазор, чтобы точно не было наложений
    const crownGroup = new THREE.Group();

    let zCursor = 0;
    for (let i = 0; i < steps; i++) {
        const hPart = crownH * (i === steps - 1 ? 0.34 : 0.33); // суммарно ≈ 1
        const w = crownBaseW * (1 - shrink * i);
        const d = crownBaseD * (1 - shrink * i);

        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(w, d, hPart),
            new THREE.MeshLambertMaterial({color: crownColor, flatShading: true})
        );
        seg.position.z = zCursor + hPart / 2;
        seg.castShadow = seg.receiveShadow = true;

        crownGroup.add(seg);
        zCursor += hPart;
    }

    crownGroup.position.z = trunkH + gap;
    tree.add(crownGroup);

    return tree;
}


// 👉 высадка деревьев «за тротуаром» рядами вокруг перекрёстка
function buildTrees() {
    const g = new THREE.Group();

    const rowsAt = 12.8;     // чуть дальше внешней кромки тротуара (~11)
    const step = 5.5;
    const min = -WORLD.half + 5;
    const max = WORLD.half - 5;

    // горизонтальные ряды (вдоль X) по y = ±rowsAt
    for (let x = min; x <= max; x += step) {
        const t1 = makeTree();
        t1.position.set(x, +rowsAt, 0);
        g.add(t1);
        const t2 = makeTree();
        t2.position.set(x, -rowsAt, 0);
        g.add(t2);
    }
    // вертикальные ряды (вдоль Y) по x = ±rowsAt
    for (let y = min; y <= max; y += step) {
        const t3 = makeTree();
        t3.position.set(+rowsAt, y, 0);
        g.add(t3);
        const t4 = makeTree();
        t4.position.set(-rowsAt, y, 0);
        g.add(t4);
    }
    return g;
}


export function makeSymmetricForest(list, {s = 0.45, mirror = true} = {}) {
    const group = new THREE.Group();

    const place = (x, y, opts) => {
        const t = makeTree({s, ...opts});
        t.position.set(x, y, 0);
        group.add(t);
    };

    for (const item of list) {
        const {x, y, ...opts} = item;
        if (mirror) {
            place(+x, +y, opts);
            place(-x, +y, opts);
            place(+x, -y, opts);
            place(-x, -y, opts);
        } else {
            place(+x, +y, opts);
        }
    }
    return group;
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
        // если текстура дороги уже есть — подтянем анизотропию/цветовое пространство
        const tex = this._road?.material?.map;
        if (tex) setupTexture(this.renderer, tex);
    }

    // -------- static parts (бордюры/тротуары) --------
    _buildStatic() {
        const inner = makeCrossCurbs({
            span: 25, offset: 11, shift: 35.5, z: 0.0,
            strip: {depth: 0.34, baseH: 0.08, stoneH: 0.32, tileLen: 0.9, gap: 0.02},
        });
        const outer = makeCrossCurbs({
            span: 25, offset: 7, shift: 32, z: 0.0,
            strip: {depth: 0.34, baseH: 0.08, stoneH: 0.16, tileLen: 0.9, gap: 0.02},
        });
        const sidewalks = makeCrossSidewalks({
            angle: 0, span: 25, offsetA: 7, offsetB: 11, shift: 35.5, z: 0.0,
            curbDepth: 0.34, h: 0.32,
        });

        this.group.add(outer);
        this._curbsOuter = outer;
        this.group.add(inner);
        this._curbsInner = inner;
        this.group.add(sidewalks);
        this._sidewalks = sidewalks;

        const trees = buildTrees();

        const forest = makeSymmetricForest(
            [
                {x: 15, y: 16, h: 26},
                {x: 20, y: 25, h: 22},
                {x: 24, y: 21, h: 22},
                {x: 17, y: 21, h: 22},
                {x: 26, y: 42, h: 26},
                {x: 23, y: 17, h: 22},
                {x: 20, y: 19, h: 22},
                {x: 17, y: 21, h: 22},
            ],
            {s: 0.07}
        );

        this.group.add(forest);
        this._trees = trees;


    }

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
        const yaw = normAngle(rot);
        tl.position.set(x, y, z);
        tl.rotation.z = yaw;

        // фиксируем цвет (без автосмены)
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
    _createCar(id, {x = 5000, y = 0, z = 0, rot = 0} = {}) {
        let obj = this.cars.get(id);
        if (!obj) {
            obj = new CarObject().addTo(this.group);
            this.cars.set(id, obj);
        }
        const yaw = normAngle(rot) ?? 0;
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
        if (obj.parent) obj.parent.remove(obj);
        this.cars.delete(id);
        return true;
    }

    update() {
        // пока только тик — пригодится для анимаций, если добавишь
        this.clock.getDelta();
    }
}