import * as THREE from "three";
import { CAMERA } from "./config.js";

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    canvas: canvas || undefined,
    powerPreference: "high-performance",
  });
  if (!canvas) document.body.appendChild(renderer.domElement);

  if ("outputColorSpace" in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else if ("outputEncoding" in renderer) {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }

  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.3;

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xb7e779, 1);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return renderer;
}

export function createCamera() {
  const base = CAMERA.orthoBase || 90;
  const aspect = window.innerWidth / window.innerHeight;
  const width = base * aspect;
  const height = base;

  const cam = new THREE.OrthographicCamera(
    -width / 2, width / 2, height / 2, -height / 2,
    CAMERA.near || 0.1, CAMERA.far || 2000
  );
  cam.up.set(0, 0, 1);
  cam.position.set(60, -60, 70);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function addLights(scene) {
  if (!scene) throw new Error("addLights(scene): scene is undefined");

  // Естественный дневной свет: небольшая окружающая подсветка, небо и мягкий солнечный свет.
  // AmbientLight: увеличиваем яркость, чтобы вытянуть детали в тенях.
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));

  // HemisphereLight: голубое небо и мягкое зелёное отражение от травы.
  const hemi = new THREE.HemisphereLight(0xcfefff, 0xa4d474, 0.4);
  scene.add(hemi);

  // Directional light (солнце) с нейтральным оттенком и статичной позицией.
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(-80, -60, 1000);
  sun.target.position.set(0, 0, 0);

  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.01;

  scene.add(sun);
  scene.add(sun.target);
}

export const createLights = addLights;

export function attachResize(renderer, camera) {
  window.addEventListener("resize", () => {
    const aspect = window.innerWidth / window.innerHeight;
    const base = CAMERA.orthoBase || 90;
    const width = base * aspect;
    const height = base;

    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
export { createCamera as OrthoCamera };