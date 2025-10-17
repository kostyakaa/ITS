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
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.05;  // чуть освещённее

  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0xb8e86a, 1); // чуть светлее зелёный фон

  // мягкие тени
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
  cam.position.set(60, -60, 74);  // чуть выше и ближе
  cam.lookAt(0, 0, 0);
  return cam;
}

export function addLights(scene) {
  if (!scene) throw new Error("addLights(scene): scene is undefined");

  // «дневной» сетап: яркое небо + тёплое солнце + лёгкая заливка
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const hemi = new THREE.HemisphereLight(0xe9f6ff, 0xb7e483, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe6bf, 0.82); // тёплый оттенок
  sun.position.set(-90, -120, 200);
  sun.target.position.set(0, 0, 0);

  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;

  scene.add(sun);
  scene.add(sun.target);
}

// алиасы под твою сборку
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