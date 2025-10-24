import * as THREE from "three";

function buildCurbStrip(len, {
  depth = 0.34, baseH = 0.08, stoneH = 0.16, tileLen = 0.9, gap = 0.02,
  colors = { base: 0x8a8f98, light: 0xe8edef, dark: 0x7e848c }
} = {}) {
  const g = new THREE.Group();
  const baseMat  = new THREE.MeshLambertMaterial({ color: colors.base });
  const lightMat = new THREE.MeshLambertMaterial({ color: colors.light });
  const darkMat  = new THREE.MeshLambertMaterial({ color: colors.dark });

  const base = new THREE.Mesh(new THREE.BoxGeometry(len, depth, baseH), baseMat);
  base.position.set(len/2, 0, baseH/2);
  base.castShadow = true; base.receiveShadow = true;
  g.add(base);

  const n = Math.max(1, Math.floor((len + 1e-6) / tileLen));
  const stoneW = tileLen - gap;
  const stoneD = Math.max(0.04, depth - gap * 2);
  for (let i = 0; i < n; i++) {
    const w = (i === n - 1) ? Math.min(stoneW, len - i * tileLen - gap * 0.5) : stoneW;
    const mat = (i % 2 === 0) ? lightMat : darkMat;
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, stoneD, stoneH), mat);
    s.position.set(i * tileLen + w/2 + gap * 0.5, 0, baseH + stoneH/2);
    s.castShadow = true;
    g.add(s);
  }
  return g;
}


export function makeRoadCurbs({
  center = new THREE.Vector3(0,0,0),
  angle = 0,
  span = 12,
  offset = 6,
  shift = 0,
  z = 0.0,
  strip = {}
} = {}) {
  const g = new THREE.Group();

  const len = Math.max(0.1, 2 * span);
  const left  = buildCurbStrip(len, strip);
  const right = buildCurbStrip(len, strip);

  const cos = Math.cos(angle), sin = Math.sin(angle);
  const t = new THREE.Vector2(cos, sin);
  const n = new THREE.Vector2(-sin, cos);

  const cx = center.x + t.x * shift, cy = center.y + t.y * shift;
  const midL = new THREE.Vector3(cx + n.x * offset, cy + n.y * offset, z);
  const midR = new THREE.Vector3(cx - n.x * offset, cy - n.y * offset, z);

  const yaw = Math.atan2(t.y, t.x);
  left.rotation.z = yaw;  right.rotation.z = yaw;

  const startL = new THREE.Vector3(midL.x - t.x * (len/2), midL.y - t.y * (len/2), z);
  const startR = new THREE.Vector3(midR.x - t.x * (len/2), midR.y - t.y * (len/2), z);
  left.position.copy(startL);
  right.position.copy(startR);

  g.add(left, right);
  g.userData = { left, right, angle, span, offset, shift };
  return g;
}


export function makeCrossCurbs(opts = {}) {
  const g = new THREE.Group();
  const angle = opts.angle ?? 0;
  const shift = opts.shift ?? 0;

  if (Math.abs(shift) > 1e-6) {
    g.add(makeRoadCurbs({ ...opts, shift: +shift }));
    g.add(makeRoadCurbs({ ...opts, shift: -shift }));
  } else {
    g.add(makeRoadCurbs({ ...opts, shift: 0 }));
  }

  const optsB = { ...opts, angle: angle + Math.PI/2 };
  if (Math.abs(shift) > 1e-6) {
    g.add(makeRoadCurbs({ ...optsB, shift: +shift }));
    g.add(makeRoadCurbs({ ...optsB, shift: -shift }));
  } else {
    g.add(makeRoadCurbs({ ...optsB, shift: 0 }));
  }

  return g;
}