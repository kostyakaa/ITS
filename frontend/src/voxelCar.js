import * as THREE from "three";


function makeToonGradient() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 4, 0);
  grd.addColorStop(0.00, "#000000");
  grd.addColorStop(0.50, "#666666");
  grd.addColorStop(1.00, "#ffffff");
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
const TOON = makeToonGradient();

function box(w, d, h, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}


export class VoxelCar extends THREE.Group {
  constructor(colorHex = 0x25c7da) {
    super();

    const C = {
      body: colorHex,                // бирюзовый кузов
      bodyDark: 0x19aabe,            // низ кузова
      roof: 0xffffff,                // крыша
      glass: 0x111111,               // стёкла
      bumper: 0xcfd3dd,              // бамперы
      fender: 0x8c88a4,              // «юбка»
      tire: 0x0d0d0d,                // шина
      hub: 0xffffff,                 // колпак
      accent: 0x1bb6c8,              // нос/хвост
    };

    const M = {
      body:   new THREE.MeshToonMaterial({ color: C.body,    gradientMap: TOON }),
      bodyD:  new THREE.MeshToonMaterial({ color: C.bodyDark,gradientMap: TOON }),
      roof:   new THREE.MeshToonMaterial({ color: C.roof,    gradientMap: TOON }),
      glass:  new THREE.MeshLambertMaterial({ color: C.glass }),
      bumper: new THREE.MeshToonMaterial({ color: C.bumper,  gradientMap: TOON }),
      fender: new THREE.MeshToonMaterial({ color: C.fender,  gradientMap: TOON }),
      tire:   new THREE.MeshLambertMaterial({ color: C.tire }),
      hub:    new THREE.MeshLambertMaterial({ color: C.hub  }),
      accent: new THREE.MeshToonMaterial({ color: C.accent,  gradientMap: TOON }),
      shadow: new THREE.MeshLambertMaterial({ color: 0x0a0a0a }),
    };

    // размеры (чуть «чиби» — широкая, короткая, высокая)
    const L = 2.6;   // длина
    const W = 1.8;   // ширина
    const H = 1.0;   // высота борта без крыши
    const roofH = 0.7;

    // базовая тень-платформа
    this.add(box(L * 0.98, W * 0.98, 0.06, M.shadow, 0, 0, 0.03));

    // нижний ярус кузова
    this.add(box(L * 0.96, W, 0.52, M.bodyD, 0, 0, 0.26));

    // верхний ярус кузова
    this.add(box(L * 0.84, W * 0.94, 0.44, M.body, 0, 0, 0.26 + 0.22));

    // нос/хвост как отдельные «кубы» для рельефа
    this.add(box(0.46, W * 0.94, 0.44, M.accent,  L * 0.5 - 0.23, 0, 0.26 + 0.22));
    this.add(box(0.42, W * 0.94, 0.44, M.accent, -L * 0.5 + 0.21, 0, 0.26 + 0.22));

    // бамперы
    this.add(box(0.12, W * 0.92, 0.22, M.bumper,  L * 0.5 - 0.06, 0, 0.15));
    this.add(box(0.12, W * 0.92, 0.22, M.bumper, -L * 0.5 + 0.06, 0, 0.15));

    // «юбка» по бокам
    this.add(box(L * 0.98, 0.08, 0.18, M.fender, 0,  W * 0.5 - 0.04, 0.18));
    this.add(box(L * 0.98, 0.08, 0.18, M.fender, 0, -W * 0.5 + 0.04, 0.18));

    // крыша — большой белый куб
    this.add(box(L * 0.76, W * 0.76, roofH, M.roof, 0, 0, H + roofH / 2));

    // большие окна (перед, зад, бока)
    this.add(box(0.02, W * 0.55, 0.52, M.glass,  L * 0.28, 0, H + 0.26)); // лобовое
    this.add(box(0.02, W * 0.55, 0.52, M.glass, -L * 0.28, 0, H + 0.26)); // заднее
    this.add(box(L * 0.40, 0.02, 0.56, M.glass, 0.00,  W * 0.48, H + 0.28)); // левое
    this.add(box(L * 0.40, 0.02, 0.56, M.glass, 0.00, -W * 0.48, H + 0.28)); // правое

    // колёса — более «реальные» прямоугольники, слегка утоплены
    const tireW = 0.32;            // толщина по оси Y (из салона наружу)
    const tireL = 0.46;            // длина вдоль X
    const tireD = 0.84;            // диаметр (по Z)
    const ax    = L * 0.34;        // смещение по X
    const ay    = W * 0.56 - tireW / 2; // по Y (слегка торчат)
    const az    = tireD / 2;

    // колёса (ориентация: шире вдоль X, тонкие по Y — выглядят «правильнее»)
    const wheel = (sx, sy) => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(tireL, tireW, tireD), M.tire);
      t.position.set(sx * ax, sy * ay, az);
      t.castShadow = true;
      this.add(t);

      // белый «колпак» на внешней стороне (по Y)
      const hub = new THREE.Mesh(new THREE.BoxGeometry(tireL * 0.36, tireW * 0.6, tireD * 0.36), M.hub);
      hub.position.set(sx * ax, sy * (ay + tireW * 0.02), az);
      hub.castShadow = false;
      this.add(hub);
    };

    wheel(+1, +1); wheel(+1, -1); wheel(-1, +1); wheel(-1, -1);
  }
}