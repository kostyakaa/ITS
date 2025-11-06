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
const world = new World();
world.attachRenderer?.(renderer);
scene.add(world.group);

const socket = new SimSocket(world);

socket.connect();

window.API = world.server;
window.WORLD = world;

API.init({
    lights: [
        {id: "tl-1", x: -7.5, y: 10.5, z: 0.25, rot: Math.PI / 2, color: "red"},
        {id: "tl-2", x: 7.5, y: -10.5, z: 0.25, rot: Math.PI / 2 + Math.PI, color: "green"},
        {id: "tl-3", x: 10.5, y: 7.5, z: 0.25, rot: 0, color: "yellow"},
        {id: "tl-4", x: -10.5, y: -7.5, z: 0.25, rot: Math.PI, color: "yellow"},
    ],
    cars: []
});

API.setTrafficLightColor('tl-1', 'red');


attachResize(renderer, camera);

function loop() {
    if (typeof world.update === 'function') world.update();
    renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop)

// ===== HUD UI SYNC (добавь в конец main.js) =================================

// ссылки на элементы HUD
const UI = {
    speed: document.getElementById('speed'),
    speedOut: document.getElementById('speedOut'),
    density: document.getElementById('density'),
    densityOut: document.getElementById('densityOut'),
    pauseBtn: document.getElementById('pauseBtn'),
    tlRadios: Array.from(document.querySelectorAll('input[name="tlMode"]')),
};

// локальное состояние (источник правды)
const SIM = {
    paused: false,
    timeScale: Number(UI.speed?.value || 1),
    density: Number(UI.density?.value || 50),
    tlMode: UI.tlRadios.find(r => r.checked)?.value || 'mode1',
};

// форматеры
const fmt = {
    speed: v => '×' + Number(v).toFixed(2),
    density: v => Math.round(Number(v)) + '%',
};

// ——— отрисовка (обновляет ЛЕЙБЛЫ, СЛАЙДЕРЫ, РАДИО, КНОПКУ) ———
function paintSpeed() {
    if (UI.speed) UI.speed.value = SIM.timeScale;
    if (UI.speedOut) UI.speedOut.textContent = fmt.speed(SIM.timeScale);
}

function paintDensity() {
    if (UI.density) UI.density.value = SIM.density;
    if (UI.densityOut) UI.densityOut.textContent = fmt.density(SIM.density);
}

function paintMode() {
    UI.tlRadios.forEach(r => r.checked = (r.value === SIM.tlMode));
}

function paintPaused() {
    if (!UI.pauseBtn) return;
    UI.pauseBtn.classList.toggle('is-paused', SIM.paused);
    UI.pauseBtn.setAttribute('aria-pressed', String(SIM.paused));
    UI.pauseBtn.title = SIM.paused ? 'Продолжить (Space)' : 'Пауза (Space)';
}

function syncUI() {
    paintSpeed();
    paintDensity();
    paintMode();
    paintPaused();
}

// ——— отправка на сервер/в мир (замени на свои протоколы при необходимости) ———
function sendControl(cmd, value) {
    // пример через сокет; подменишь под свой API
    socket.send({type: 'control', cmd: cmd, value: value});
}

// ——— публичные сеттеры (меняют состояние + перерисовывают + шлют команду) ———
function setPaused(p) {
    SIM.paused = !!p;
    paintPaused();
    // стоп/старт рендера
    sendControl(SIM.paused ? 'pause' : 'resume', '');
}

function setSpeed(mult) {
    SIM.timeScale = Number(mult);
    paintSpeed();
    world.setTimeScale?.(SIM.timeScale);
    sendControl('speed', SIM.timeScale);
}

function setDensity(val) {
    SIM.density = Number(val);
    paintDensity();
    world.setDensity?.(SIM.density);
    sendControl('density', SIM.density);
}

function setTrafficMode(mode) {
    SIM.tlMode = String(mode);
    paintMode();
    world.setTrafficMode?.(SIM.tlMode);
    sendControl('trafficMode', SIM.tlMode);
}

// ——— связь с HUD-событиями из разметки ———
window.addEventListener('sim:setPaused', e => setPaused(!!e.detail));
window.addEventListener('sim:setSpeed', e => setSpeed(+e.detail));
window.addEventListener('sim:setDensity', e => setDensity(+e.detail));
window.addEventListener('sim:setTrafficMode', e => setTrafficMode(String(e.detail)));

// ——— прямые биндинги UI → состояние (если хочешь без кастомных событий) ———
UI.speed?.addEventListener('input', e => setSpeed(e.target.value));
UI.density?.addEventListener('input', e => setDensity(e.target.value));
UI.tlRadios.forEach(r => r.addEventListener('change', e => {
    if (e.target.checked) setTrafficMode(e.target.value);
}));
UI.pauseBtn?.addEventListener('click', () => setPaused(!SIM.paused));
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        setPaused(!SIM.paused);
    }


});

// ——— инициализация: прорисовать текущие значения ———
syncUI();

// ===== (опционально) если сервер шлёт состояние — применяем и перерисовываем ===
// пример: в SimSocket.handleMessage(data) поймал {type:'state', patch:{speed:1.2, ...}}
function applyServerState(patch) {
    if ('paused' in patch) SIM.paused = !!patch.paused;
    if ('speed' in patch) SIM.timeScale = Number(patch.speed);
    if ('density' in patch) SIM.density = Number(patch.density);
    if ('trafficMode' in patch) SIM.tlMode = String(patch.trafficMode);
    syncUI();
    // и дернуть локальные методы мира, если надо:
    world.setTimeScale?.(SIM.timeScale);
    world.setDensity?.(SIM.density);
    world.setTrafficMode?.(SIM.tlMode);
}

// ==== HUD counters wiring (добавь в main.js рядом с блоком HUD UI SYNC) ====

const StatsUI = {
  carsInEl: document.getElementById('carsIn'),
  carsOutEl: document.getElementById('carsOut'),
  // если позже захочешь — sec/avgLife тоже можно обновлять тут
};

const Stats = {
  carsIn: Number(StatsUI.carsInEl?.textContent || 0),
  carsOut: Number(StatsUI.carsOutEl?.textContent || 0),
};

function paintStats() {
  if (StatsUI.carsInEl)  StatsUI.carsInEl.textContent  = String(Stats.carsIn);
  if (StatsUI.carsOutEl) StatsUI.carsOutEl.textContent = String(Stats.carsOut);
}

// подписки на события World
world.addEventListener('car:created', () => {
  Stats.carsIn += 1;
  paintStats();
});

world.addEventListener('car:deleted', (e) => {
  Stats.carsOut += 1;
  paintStats();

  // если когда-нибудь понадобится средняя «жизнь»:
  // const { lifeMs } = e.detail || {};
  // ... накапливай и обновляй #avgLife ...
});

paintStats();
