// 1 юнит = 1 метр
export const WORLD = { size: 100, half: 50 };

export const TEXTURE = {
  meters: 100,
  pixels: 5000,
  url: "/ллл.png",
  layers: {
    base: "src/road/base.png",
    markings: "src/road/markings.png",
    crosswalks: "src/road/crosswalks.png",
    edges: "src/road/ao.png",
  },
};

export const LANES = {
  perSide: 2,
  width: 1.4,
  median: 0.8,
  shoulder: 0.5,
};

export const COLORS = {
  grassMid: 0xbaf455,
  grassSide: 0x99c846,
};

export const CAMERA = {
  near: 0.1,
  far: 2000,
  orthoBase: 90,
};

export const TRAFFIC = {
  speeds: [6, 8, 10],
  perLane: 3,
};