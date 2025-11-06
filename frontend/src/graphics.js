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

  renderer.toneMapping = THREE.CineonToneMapping;
  renderer.toneMappingExposure = 1.4;

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
    -width / 5, width / 5, height / 5, -height / 5,
    CAMERA.near || 0.1, CAMERA.far || 2000
  );
  cam.up.set(0, 0, 1);
  cam.position.set(60, -60, 70);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function addLights(scene) {
  if (!scene) throw new Error("addLights(scene): scene is undefined");

  const amb = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(amb);

  const sun = new THREE.DirectionalLight(0xffffff, 0.9);

  sun.position.set(100, 100, 100);

  sun.target.position.set(0, 0, 0);

  sun.castShadow = true;

  sun.shadow.mapSize.set(2048, 2048);


  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;

  sun.shadow.camera.left   = -120;
  sun.shadow.camera.right  =  120;
  sun.shadow.camera.top    =  120;
  sun.shadow.camera.bottom = -120;

  sun.shadow.camera.updateProjectionMatrix();

  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;

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