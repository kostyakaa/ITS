import * as THREE from "three";
import {SimSocket} from "./socket.js";
import {
    createRenderer,
    createCamera,
    createLights,
    attachResize,
} from "./graphics.js";
import {World} from "./world.js";

const canvas = document.querySelector("canvas.game") || undefined;
const renderer = createRenderer(canvas);

const scene = new THREE.Scene();
createLights(scene);
const camera = createCamera();

// стартовая позиция камеры (как было, чуть сдвинута)
camera.position.x = 60;
const cameraStart = camera.position.clone();
const cameraLookAt = new THREE.Vector3(0, 0, 0);
const CAMERA_RADIUS = 60;

const world = new World();
world.attachRenderer?.(renderer);
scene.add(world.group);

const socket = new SimSocket(world);
socket.connect();

window.API = world.server;
window.WORLD = world;

API.init({
    lights: [
        {id: "tl-1", x: -7.5, y: 10.5, z: 0.25, rot: Math.PI / 2, color: "yellow"},
        {id: "tl-2", x: 7.5, y: -10.5, z: 0.25, rot: Math.PI / 2 + Math.PI, color: "yellow"},
        {id: "tl-3", x: 10.5, y: 7.5, z: 0.25, rot: 0, color: "yellow"},
        {id: "tl-4", x: -10.5, y: -7.5, z: 0.25, rot: Math.PI, color: "yellow"},
    ],
    cars: []
});

attachResize(renderer, camera);

// =============================================================
//               CAMERA TRAJECTORIES + LOOP
// =============================================================

const clock = new THREE.Clock();

// состояние камеры
const CameraCtrl = {
    pathId: "none",     // 'none' | 'xyOrbit' | 'xyzOrbit'
    continuous: false,  // true = постоянное движение
    t: 0,               // текущий параметр [0..1]
    targetT: 0,         // целевая точка для ручного режима
    speed: 0.05         // скорость для continuous (условные обороты/сек)
};

// позиция камеры по траектории
function evalCameraPath(pathId, tNorm) {
    const t = ((tNorm % 1) + 1) % 1; // [0,1)
    const angle = t * Math.PI * 2;

    if (pathId === "xyOrbit") {
        const x = Math.cos(angle) * CAMERA_RADIUS;
        const y = Math.sin(angle) * CAMERA_RADIUS;
        const z = cameraStart.z;
        return new THREE.Vector3(x, y, z);
    }

    if (pathId === "xyzOrbit") {
        const x = Math.cos(angle) * CAMERA_RADIUS;
        const y = Math.sin(angle) * CAMERA_RADIUS;
        const z = Math.abs(Math.cos(angle) * CAMERA_RADIUS + CAMERA_RADIUS) + 30;
        return new THREE.Vector3(x, y, z);
    }

    // без траектории — статика
    return cameraStart.clone();
}

function updateCamera(dt) {
    const id = CameraCtrl.pathId;

    if (id === "none") {
        // нет траектории — просто стоим
        camera.position.copy(cameraStart);
    } else if (CameraCtrl.continuous) {
        // постоянное движение
        CameraCtrl.t = (CameraCtrl.t + CameraCtrl.speed * dt) % 1;
        camera.position.copy(evalCameraPath(id, CameraCtrl.t));
    } else {
        // ручное: плавно едем к targetT и останавливаемся
        const diff = CameraCtrl.targetT - CameraCtrl.t;
        if (Math.abs(diff) > 1e-4) {
            const moveSpeed = 0.8;
            const step = Math.sign(diff) * moveSpeed * dt;
            if (Math.abs(step) >= Math.abs(diff)) {
                CameraCtrl.t = CameraCtrl.targetT;
            } else {
                CameraCtrl.t += step;
            }
        }
        camera.position.copy(evalCameraPath(id, CameraCtrl.t));
    }

    camera.lookAt(cameraLookAt);
}

// главный цикл
function loop() {
    const delta = clock.getDelta();

    updateCamera(delta);

    if (typeof world.update === "function") {
        world.update();
    }

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop);

// =============================================================
//                        HUD UI SYNC
// =============================================================

const UI = {
    speed: document.getElementById("speed"),
    speedOut: document.getElementById("speedOut"),
    density: document.getElementById("density"),
    densityOut: document.getElementById("densityOut"),
    pauseBtn: document.getElementById("pauseBtn"),
    restartBtn: document.getElementById("restartBtn"),
    tlRadios: Array.from(document.querySelectorAll('input[name="tlMode"]')),
};

const SIM = {
    paused: false,
    timeScale: Number(UI.speed?.value || 1),
    density: Number(UI.density?.value || 1.5),
    tlMode: UI.tlRadios.find(r => r.checked)?.value || "mode1",
};

const fmt = {
    speed: v => "×" + Number(v).toFixed(2),
    density: v => Number(v).toFixed(1) + "s",
};

function paintSpeed() {
    if (UI.speed) UI.speed.value = SIM.timeScale;
    if (UI.speedOut) UI.speedOut.textContent = fmt.speed(SIM.timeScale);
}

function paintDensity() {
    if (UI.density) UI.density.value = SIM.density;
    if (UI.densityOut) UI.densityOut.textContent = fmt.density(SIM.density);
}

function paintMode() {
    UI.tlRadios.forEach(r => {
        r.checked = (r.value === SIM.tlMode);
    });
}

function paintPaused() {
    if (!UI.pauseBtn) return;
    UI.pauseBtn.classList.toggle("is-paused", SIM.paused);
    UI.pauseBtn.setAttribute("aria-pressed", String(SIM.paused));
    UI.pauseBtn.title = SIM.paused ? "Продолжить (Space)" : "Пауза (Space)";
}

function syncUI() {
    paintSpeed();
    paintDensity();
    paintMode();
    paintPaused();
}

function sendControl(cmd, value) {
    socket.send({type: "control", cmd, value});
}

function setPaused(p) {
    SIM.paused = !!p;
    paintPaused();
    sendControl(SIM.paused ? "pause" : "resume", "");
}

function setSpeed(mult) {
    SIM.timeScale = Number(mult);
    paintSpeed();
    sendControl("speed", SIM.timeScale);
}

function setDensity(val) {
    SIM.density = Number(val);
    paintDensity();
    sendControl("density", SIM.density);
}

function setTrafficMode(mode) {
    SIM.tlMode = String(mode);
    paintMode();
    sendControl("trafficMode", SIM.tlMode);
}

// мягкий рестарт симуляции
function restartSim() {
    sendControl("reset", "");
    world.server.resetCars();
}

window.addEventListener("sim:setPaused", e => setPaused(!!e.detail));
window.addEventListener("sim:setSpeed", e => setSpeed(+e.detail));
window.addEventListener("sim:setDensity", e => setDensity(+e.detail));
window.addEventListener("sim:setTrafficMode", e => setTrafficMode(String(e.detail)));

UI.speed?.addEventListener("input", e => setSpeed(e.target.value));
UI.density?.addEventListener("input", e => setDensity(e.target.value));
UI.tlRadios.forEach(r => r.addEventListener("change", e => {
    if (e.target.checked) setTrafficMode(e.target.value);
}));
UI.pauseBtn?.addEventListener("click", () => setPaused(!SIM.paused));
UI.restartBtn?.addEventListener("click", () => restartSim());

window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        setPaused(!SIM.paused);
    }
});

syncUI();

// =============================================================
//                    HUD COUNTERS (статистика)
// =============================================================

const StatsUI = {
    carsInEl: document.getElementById("carsIn"),
    carsOutEl: document.getElementById("carsOut"),
};

const Stats = {
    carsIn: Number(StatsUI.carsInEl?.textContent || 0),
    carsOut: Number(StatsUI.carsOutEl?.textContent || 0),
};

function paintStats() {
    if (StatsUI.carsInEl) StatsUI.carsInEl.textContent = String(Stats.carsIn);
    if (StatsUI.carsOutEl) StatsUI.carsOutEl.textContent = String(Stats.carsOut);
}

world.addEventListener("car:created", () => {
    Stats.carsIn += 1;
    paintStats();
});

world.addEventListener("car:deleted", () => {
    Stats.carsOut += 1;
    paintStats();
});

world.addEventListener("car:reset", () => {
    Stats.carsOut = 0;
    Stats.carsIn = 0;
    paintStats();
});

// =============================================================
//                     CAMERA PANEL UI BINDINGS
// =============================================================

const CamUI = {
    path: document.getElementById("camPath"),
    continuous: document.getElementById("camContinuous"),
    continuousRow: document.getElementById("camContinuousRow"),
    manualRow: document.getElementById("camManualRow"),
    manual: document.getElementById("camManual"),
    manualOut: document.getElementById("camManualOut"),
    speedRow: document.getElementById("camSpeedRow"),
    speed: document.getElementById("camSpeed"),
    speedOut: document.getElementById("camSpeedOut"),
};

function paintCamUI() {
    const hasPath = CameraCtrl.pathId !== "none";

    if (CamUI.path) CamUI.path.value = CameraCtrl.pathId;
    if (CamUI.continuous) CamUI.continuous.checked = CameraCtrl.continuous;

    if (!hasPath) {
        // нет траектории — прячем всё, кроме селекта
        if (CamUI.continuousRow) CamUI.continuousRow.style.display = "none";
        if (CamUI.manualRow) CamUI.manualRow.style.display = "none";
        if (CamUI.speedRow) CamUI.speedRow.style.display = "none";
        return;
    }

    // есть траектория: показываем чекбокс
    if (CamUI.continuousRow) CamUI.continuousRow.style.display = "grid";

    if (CameraCtrl.continuous) {
        // авто режим — только скорость
        if (CamUI.manualRow) CamUI.manualRow.style.display = "none";
        if (CamUI.speedRow) {
            CamUI.speedRow.style.display = "grid";
            if (CamUI.speed) CamUI.speed.value = CameraCtrl.speed;
            if (CamUI.speedOut) {
                CamUI.speedOut.textContent = "×" + CameraCtrl.speed.toFixed(2);
            }
        }
    } else {
        // ручной режим — только позиция
        if (CamUI.speedRow) CamUI.speedRow.style.display = "none";
        if (CamUI.manualRow) {
            CamUI.manualRow.style.display = "grid";
            if (CamUI.manual) CamUI.manual.value = CameraCtrl.targetT.toFixed(2);
            if (CamUI.manualOut) {
                CamUI.manualOut.textContent = Math.round(CameraCtrl.targetT * 100) + "%";
            }
        }
    }
}

function setCamPath(id) {
    CameraCtrl.pathId = id;

    if (id === "none") {
        // полный сброс камеры
        CameraCtrl.continuous = false;
        CameraCtrl.t = 0;
        CameraCtrl.targetT = 0;
    } else {
        // при смене траектории не дёргаем, нормализуем t,
        // чтобы ручной/авторежим продолжили с текущей позиции
        CameraCtrl.t = ((CameraCtrl.t % 1) + 1) % 1;
        CameraCtrl.targetT = CameraCtrl.t;
    }

    paintCamUI();
}

function setCamContinuous(on) {
    if (on) {
        // включаем авто — продолжаем с текущего t
        CameraCtrl.continuous = true;
    } else {
        // выключаем авто — фиксируем текущую точку как targetT
        CameraCtrl.continuous = false;
        CameraCtrl.targetT = ((CameraCtrl.t % 1) + 1) % 1;
    }
    paintCamUI();
}

function setCamManual(val) {
    const v = Math.min(1, Math.max(0, Number(val) || 0));
    CameraCtrl.targetT = v;
    if (CamUI.manualOut) {
        CamUI.manualOut.textContent = Math.round(v * 100) + "%";
    }
}

function setCamSpeed(v) {
    const num = Number(v);
    CameraCtrl.speed = (isFinite(num) && num > 0) ? num : 0.05;
    if (CamUI.speedOut) {
        CamUI.speedOut.textContent = "×" + CameraCtrl.speed.toFixed(2);
    }
}

CamUI.path?.addEventListener("change", (e) => {
    setCamPath(e.target.value);
});

CamUI.continuous?.addEventListener("change", (e) => {
    setCamContinuous(e.target.checked);
});

CamUI.manual?.addEventListener("input", (e) => {
    setCamManual(e.target.value);
});

CamUI.speed?.addEventListener("input", (e) => {
    setCamSpeed(e.target.value);
});

// старт
paintStats();
paintCamUI();

// =============================================================
//             applyServerState (если нужно серверу)
// =============================================================

function applyServerState(patch) {
    if ("paused" in patch) SIM.paused = !!patch.paused;
    if ("speed" in patch) SIM.timeScale = Number(patch.speed);
    if ("density" in patch) SIM.density = Number(patch.density);
    if ("trafficMode" in patch) SIM.tlMode = String(patch.trafficMode);
    syncUI();
}


// ==== Tilt-Shift Overlay ====================
(function installTiltShiftOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'tiltShiftOverlay';
    overlay.dataset.mode = 'corners'; // 'corners' или 'band'
    document.body.appendChild(overlay);

    function set(opts = {}) {
        const setVar = (k, v) => v != null && overlay.style.setProperty(k, String(v));
        if (opts.mode) overlay.dataset.mode = opts.mode;

        setVar('--ts-opacity', opts.opacity);
        setVar('--ts-blur', opts.blurPx != null ? `${opts.blurPx}px` : null);
        setVar('--ts-angle', opts.angleDeg != null ? `${opts.angleDeg}deg` : null);

        if (overlay.dataset.mode === 'corners') {
            setVar('--ts-cx', opts.cx != null ? `${opts.cx}%` : null);
            setVar('--ts-cy', opts.cy != null ? `${opts.cy}%` : null);
            setVar('--ts-band', opts.bandPct != null ? `${opts.bandPct}%` : null);
            setVar('--ts-falloff', opts.falloffPct != null ? `${opts.falloffPct}%` : null);
        } else { // band
            setVar('--ts-bandStart', opts.bandStartPct != null ? `${opts.bandStartPct}%` : null);
            setVar('--ts-bandEnd', opts.bandEndPct != null ? `${opts.bandEndPct}%` : null);
        }
    }

    set({
        mode: 'corners',
        //   lurPx: 7,
        // bandPct: 15,
        blurPx: 3,        // сила размытия
        bandPct: 30,      // радиус «резкого» центра
        falloffPct: 30,   // ширина перехода к блюру
        cx: 50, cy: 50,   // смещение центра эллипса
        opacity: 0
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyT') {
            const cur = parseFloat(getComputedStyle(overlay).getPropertyValue('--ts-opacity') || '1');
            set({opacity: cur > 0 ? 0 : 1});
        }
        if (e.code === 'KeyY') {
            overlay.dataset.mode = overlay.dataset.mode === 'corners' ? 'band' : 'corners';
        }
    });

    window.TiltShift = {set, overlay};
})();
