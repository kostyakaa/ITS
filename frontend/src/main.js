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

renderer.setAnimationLoop(loop);