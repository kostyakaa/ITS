import * as THREE from "three";
import {
  createRenderer,
  createCamera,      // можешь заменить на OrthoCamera — это алиас
  createLights,      // алиас для addLights(scene)
  attachResize,
} from "./graphics.js";
import { World } from "./world.js";

// 1) Рендерер (если <canvas class="game"> нет — сам добавит canvas в body)
const canvas = document.querySelector("canvas.game") || undefined;
const renderer = createRenderer(canvas);

// 2) Сцена и камера
const scene = new THREE.Scene();
const camera = createCamera();

// 3) Свет
createLights(scene);

// 4) Мир (дорога как картинка + машины)
const world = new World();
// передадим renderer, чтобы world выставил max anisotropy на текстуре
world.attachRenderer(renderer);
scene.add(world.group);

// 5) Ресайз и цикл
attachResize(renderer, camera);

function loop() {
  world.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);