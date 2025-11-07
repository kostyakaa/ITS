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

    const aniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    tex.anisotropy = Math.min(aniso, 8);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

async function loadImage(url) {
    return new Promise(async (resolve) => {
        if (!url) return resolve(null);
        const origUrl = url;
        loadingManager.itemStart(origUrl);
        let objUrl = null;
        try {
            const isSVG = /\.svg($|\?)/i.test(url) || url.startsWith("data:image/svg");
            if (isSVG) {
                let svgText = "";
                if (url.startsWith("data:image/svg")) {
                    // Safari iOS не умеет fetch(data:...), разбираем сами
                    const comma = url.indexOf(",");
                    const payload = url.slice(comma + 1);
                    svgText = url.includes(";base64")
                        ? decodeURIComponent(escape(atob(payload)))
                        : decodeURIComponent(payload);
                } else {
                    const res = await fetch(url, {mode: "cors"});
                    svgText = await res.text();
                }
                svgText = svgText.replace(/\swidth="[^"]*"/, "")
                    .replace(/\sheight="[^"]*"/, "");
                if (!/preserveAspectRatio=/.test(svgText)) {
                    svgText = svgText.replace(/<svg\b([^>]*?)>/, '<svg$1 preserveAspectRatio="xMidYMid slice">');
                }
                const blob = new Blob([svgText], {type: "image/svg+xml"});
                objUrl = URL.createObjectURL(blob);
            }
            const img = new Image();
            img.decoding = "async";
            img.crossOrigin = "anonymous";
            img.onload = () => {
                loadingManager.itemEnd(origUrl);
                if (objUrl) URL.revokeObjectURL(objUrl);
                resolve(img);
            };
            img.onerror = () => {
                loadingManager.itemError(origUrl);
                if (objUrl) URL.revokeObjectURL(objUrl);
                resolve(null);
            };
            img.src = objUrl || url;
        } catch (e) {
            console.error("loadImage error:", e);
            loadingManager.itemError(origUrl);
            if (objUrl) URL.revokeObjectURL(objUrl);
            resolve(null);
        }
    });
}


function makeCanvas(w, h) {
    const C = document.createElement("canvas");
    C.width = w;
    C.height = h;
    return C;
}

function disposeObject3D(root) {
    if (!root) return;
    root.traverse?.((child) => {
        if (child.isMesh) {
            child.geometry?.dispose?.();
            const m = child.material;
            if (Array.isArray(m)) m.forEach((mm) => {
                mm?.map?.dispose?.();
                mm?.dispose?.();
            });
            else {
                m?.map?.dispose?.();
                m?.dispose?.();
            }
        }
    });
}


async function textureFromSVGorImage(url, targetSizePx, renderer) {
    // Универсальная отрисовка в Canvas → CanvasTexture (надёжнее, чем прямой TextureLoader для SVG)
    const img = await loadImage(url);
    if (!img) return null;

    // const size = Math.max(256, Math.min(16384, targetSizePx | 0 || 8192));
    const size = Math.max(256, Math.min(4096, targetSizePx | 0 || 2048));

    const C = makeCanvas(size, size);
    const ctx = C.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

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

const __matCache = new Map();
const getLambert = (color) => {
    const k = (color >>> 0); // int key
    if (__matCache.has(k)) return __matCache.get(k);
    const m = new THREE.MeshLambertMaterial({color: k, flatShading: true});
    __matCache.set(k, m);
    return m;
};


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
        getLambert(trunkColor)
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
    steps = steps + Math.floor(Math.random() * steps / 2);
    for (let i = 0; i < steps; i++) {
        const hPart = crownH * (i === steps - 1 ? 0.34 : 0.33); // суммарно ≈ 1
        const w = crownBaseW * (1 - shrink * i);
        const d = crownBaseD * (1 - shrink * i);

        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(w, d, hPart),
            getLambert(crownColor)
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

export class World extends EventTarget {
    constructor() {
        super();
        this.group = new THREE.Group();
        this.clock = new THREE.Clock();
        this.renderer = null;

        this.cars = new Map();
        this.lights = new Map();

        this._road = null;
        this._curbsOuter = null;
        this._curbsInner = null;
        this._sidewalks = null;

        this.simTime = 0;
        this._carBirth = new Map();
        this._lifeStats = {total: 0, count: 0, avg: 0};

        this.server = {
            init: (payload = {}) => this._apiInit(payload),
            update: (changes = {}) => this._apiUpdate(changes),

            createTrafficLight: (id, opts = {}) => this._createTrafficLight(id, opts),
            createCar: (id, opts = {}) => this._createCar(id, opts),
            setTrafficLightColor: (id, color) => this._setTrafficLightColor(id, color),
            moveCar: (id, pose = {}) => this._moveCar(id, pose),
            deleteCar: (id) => this._deleteCar(id),
            resetCars: () => {
                this._resetCars()
            },
            setTime: (t) => this._setSimTime(t),
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

    _emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, {detail}));
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
                {x: 14, y: 15},
                {x: 14.5, y: 19},
                {x: 13.5, y: 23},
                {x: 14, y: 27, h: 20},
                {x: 15, y: 31, h: 30},
                {x: 14, y: 35, h: 26},
                {x: 19, y: 14.5, h: 34},
                {x: 23, y: 13.5, h: 1000000},
                {x: 27, y: 14, h: 22},
                {x: 31, y: 15, h: 22},
                {x: 35, y: 14, h: 26},

                {x: 39, y: 14.5, h: 22},
                {x: 40, y: 19, h: 26},
                {x: 39, y: 23, h: 22},
                {x: 38.5, y: 27, h: 22},
                {x: 39, y: 31, h: 22},
                {x: 40, y: 35, h: 26},

                {x: 35, y: 39, h: 22},
                {x: 31, y: 40, h: 22},
                {x: 27, y: 39, h: 22},
                {x: 23, y: 38.5, h: 22},
                {x: 19, y: 39, h: 26},
                {x: 14.5, y: 40, h: 22},

                {x: 17, y: 17, h: 23},
                {x: 21, y: 18.5, h: 22},
                {x: 25, y: 19, h: 26},
                {x: 29, y: 18, h: 22},
                {x: 33, y: 17.5, h: 23},

                {x: 18, y: 22.5, h: 22},
                {x: 22, y: 23, h: 24},
                {x: 26, y: 24, h: 22},
                {x: 30, y: 23, h: 23},
                {x: 34, y: 22.5, h: 22},

                {x: 17.5, y: 27.5, h: 22},
                {x: 21.5, y: 28, h: 26},
                {x: 25.5, y: 27, h: 22},
                {x: 29.5, y: 28.5, h: 22},
                {x: 33.5, y: 27.5, h: 24},

                {x: 18, y: 32, h: 22},
                {x: 22, y: 33, h: 24},
                {x: 26, y: 34, h: 22},
                {x: 30, y: 33.5, h: 26},
                {x: 34, y: 32, h: 22},

            ],
            {s: 0.07}
        );

        this.group.add(forest);
        this._trees = trees;

        // freeze transforms для статических групп
        [outer, inner, sidewalks, forest, trees].forEach(o => {
            if (!o) return;
            o.matrixAutoUpdate = false;
            o.updateMatrixWorld(true);
        });

    }

    // -------- dynamic road (SVG / IMG / layers) --------
    async _buildRoad() {
        const sizeMeters = TEXTURE?.meters ?? WORLD.size ?? 100;
        const seg = 1;
        const geom = new THREE.PlaneGeometry(sizeMeters, sizeMeters, seg, seg);

        const sizePx = TEXTURE?.pixels ?? 4096;
        let texture = null;

        // 1) Пытаемся прогнать через канвас любую картинку (SVG/PNG/JPG)
        if (TEXTURE?.url) {
            texture = await textureFromSVGorImage(TEXTURE.url, sizePx, this.renderer);
        }

        const mat = new THREE.MeshLambertMaterial({
            color: texture ? 0xffffff : 0x2f3545,
            map: texture || null
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
        const isNew = !this.cars.has(id);
        let obj = this.cars.get(id);
        if (!obj) {
            obj = new CarObject().addTo(this.group);
            this.cars.set(id, obj);
        }
        const yaw = normAngle(rot) ?? 0;
        obj.setPosition(x, y, z).setRotationZ(yaw);
        if (isNew) {
            this._carBirth.set(id, this.simTime);
            this._emit('car:created', {id, time: this.simTime});
        }

        return obj;
    }

    _moveCar(id, {x, y, z = 0, rot = null} = {}) {
        const obj = this.cars.get(id);
        if (!obj) return false;
        if (Number.isFinite(x) && Number.isFinite(y)) obj.setPosition(x, y, z);
        if (Number.isFinite(rot)) obj.setRotationZ(normAngle(rot));
        return true;
    }

    _setSimTime(t) {
        if (!Number.isFinite(t) || t < 0) return false;
        this.simTime = t;
        this._emit('time:update', {time: t});
        return true;
    }

    _deleteCar(id) {
        const obj = this.cars.get(id);
        if (!obj) return false;
        const born = this._carBirth.get(id);
        if (born != null) {
            const life = Math.max(0, this.simTime - born);
            this._lifeStats.total += life;
            this._lifeStats.count++;
            this._lifeStats.avg = this._lifeStats.total / this._lifeStats.count;

            this._emit('stats:avgLifetime', {
                avgLifetime: this._lifeStats.avg,
                samples: this._lifeStats.count,
                last: life,
                time: this.simTime,
            });
        }
        if (obj.node?.parent) obj.node.parent.remove(obj.node);
        disposeObject3D(obj.node);
        this.cars.delete(id);
        this._emit('car:deleted', {id, carsTotal: this.cars.size});

        return true;
    }

    _resetCars() {
        for (const [id, obj] of this.cars) {
            if (obj.node?.parent) obj.node.parent.remove(obj.node);
            disposeObject3D(obj.node);
        }

        this.cars.clear();
        this._carBirth.clear();
        this._lifeStats = {total: 0, count: 0, avg: 0};

        this._emit('car:reset', {carsTotal: this.cars.size});
    }


    update() {
        // пока только тик — пригодится для анимаций, если добавишь
        this.clock.getDelta();
    }
}