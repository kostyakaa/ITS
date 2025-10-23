// trafficLight.js
// Красивый модульный светофор для three.js с козырьками и утопленными линзами
import * as THREE from 'three';

function roundedRectShape(w, h, r) {
  const hw = w / 2, hh = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function makeModule({ bodyW, bodyH, bodyD, radius, lensR, lensD, visorD }) {
  const g = new THREE.Group();

  // Корпус секции
  const bodyShape = roundedRectShape(bodyW, bodyH, radius);
  const bodyGeom = new THREE.ExtrudeGeometry(bodyShape, { depth: bodyD, bevelEnabled: false, curveSegments: 8 });
  bodyGeom.center(); bodyGeom.rotateY(Math.PI / 2);
  const body = new THREE.Mesh(
    bodyGeom,
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0.05 })
  );
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  // Обод
  const bezel = new THREE.Mesh(
    new THREE.RingGeometry(lensR * 0.98, lensR * 1.1, 36),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9, metalness: 0.05 })
  );
  bezel.rotation.y = -Math.PI / 2;
  bezel.position.x = (bodyD / 2) - 0.001;
  bezel.castShadow = true; bezel.receiveShadow = true;
  g.add(bezel);

  // Линза (утопленная)
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(lensR, lensR, lensD, 36, 1, false),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      roughness: 0.4,
      metalness: 0.0
    })
  );
  lens.rotation.z = Math.PI / 2;
  lens.position.x = (bodyD / 2) - (lensD / 2) - 0.01;
  lens.castShadow = false; lens.receiveShadow = false;
  g.add(lens);

  // Козырёк
  const visorR = lensR * 1.12;
  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(visorR, visorR, visorD, 24, 1, true, Math.PI, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.9, metalness: 0.05 })
  );
  visor.rotation.z = Math.PI / 2;
  visor.rotation.x = Math.PI / 2;
  visor.position.x = (bodyD / 2) + (visorD / 2) - 0.002;
  visor.castShadow = true; visor.receiveShadow = true;
  g.add(visor);

  // Доступ к линзе
  g.userData.lensMesh = lens;
  g.userData.bodyD = bodyD;
  g.userData.bodyH = bodyH;

  return g;
}

// Публичное создание светофора (совместимо с твоим миром)
// Публичное создание светофора (совместимо с твоим миром)
export function makeTrafficLight({ up = 'z' } = {}) {
  // ВНЕШНИЙ корень — для yaw (rotation.z)
  const root = new THREE.Group();
  root.castShadow = true; root.receiveShadow = true;

  // ВНУТРЕННИЙ узел — всё «железо» светофора, его ориентируем по up
  const core = new THREE.Group();
  root.add(core);

  // -------- размеры --------
  const baseSize = 0.45;
  const baseH = 0.15;
  const poleH = 4.2;
  const poleR = 0.055;

  const bodyW = 0.5, bodyH = 0.58, bodyD = 0.18;
  const radius = 0.06;
  const lensR = 0.22, lensD = 0.12, visorD = 0.26;
  const spacing = 0.10;

  // База
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(baseSize * 0.9, baseSize, baseH, 36),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 })
  );
  base.position.y = baseH / 2;
  base.castShadow = true; base.receiveShadow = true;
  core.add(base);

  // Столб
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(poleR, poleR, poleH, 24),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 1.0 })
  );
  pole.position.y = baseH + poleH / 2;
  pole.castShadow = true; pole.receiveShadow = true;
  core.add(pole);

  // Кронштейн
  const armLen = 0.55;
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, armLen, 12),
    new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 1.0 })
  );
  arm.rotation.z = Math.PI / 2;
  arm.position.set(armLen / 2, baseH + 3.0, 0);
  arm.castShadow = true; arm.receiveShadow = true;
  core.add(arm);

  const clamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.18, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1.0 })
  );
  clamp.position.set(0.05, arm.position.y, 0);
  clamp.castShadow = true; clamp.receiveShadow = true;
  core.add(clamp);

  // Задняя плита
  const modulesH = bodyH * 3 + spacing * 2;
  const backW = bodyW + 0.16;
  const backH = modulesH + 0.18;
  const backD = 0.04;
  const backShape = roundedRectShape(backW, backH, 0.08);
  const backGeom = new THREE.ExtrudeGeometry(backShape, { depth: backD, bevelEnabled: false, curveSegments: 8 });
  backGeom.center(); backGeom.rotateY(Math.PI / 2);
  const back = new THREE.Mesh(backGeom, new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.95 }));
  const boardX = armLen + backD / 2;
  const boardY = arm.position.y;
  back.position.set(boardX, boardY, 0);
  back.castShadow = true; back.receiveShadow = true;
  core.add(back);

  // Секции
  const colors = [0xd94444, 0xe5b80b, 0x43a047]; // R,Y,G
  const sections = [];
  for (let i = 0; i < 3; i++) {
    const mod = makeModule({ bodyW, bodyH, bodyD, radius, lensR, lensD, visorD });
    const y = boardY + (modulesH / 2 - bodyH / 2) - i * (bodyH + spacing);
    mod.position.set(boardX, y, 0);

    const lensMesh = mod.userData.lensMesh;
    const col = colors[i];
    lensMesh.material.color.setHex(0x222222);
    lensMesh.material.emissive.setHex(col);
    lensMesh.material.emissiveIntensity = 0.0;

    // пары «вкл/выкл» для совместимости с setTrafficLightState
    const on = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 32),
      new THREE.MeshBasicMaterial({ color: col })
    );
    on.rotation.y = -Math.PI/2;
    on.position.set((bodyD/2) + 0.002, 0, 0);
    on.visible = false;

    const off = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 32),
      new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 1.0 })
    );
    off.rotation.y = -Math.PI/2;
    off.position.set((bodyD/2) + 0.001, 0, 0);
    off.visible = true;

    mod.add(off); mod.add(on);
    mod.castShadow = true; mod.receiveShadow = true;

    sections.push(mod);
    core.add(mod);
  }

  // ——— ориентация «вверх» переносим на ВНУТРЕННИЙ core ———
  if (up === 'z') core.rotation.x = Math.PI / 2;
  else if (up === 'x') core.rotation.z = -Math.PI / 2;

  // служебные ссылки — оставляем на ВНЕШНЕМ root (чтобы внешний код не менять)
  root.userData.sections = sections;
  root.userData._discMesh = null;
  root.userData._discRadiusScale = 0.75;

  return root; // ВАЖНО: yaw теперь делаем через root.rotation.z
}

// ======== «кружок»-индикатор (совместимо с твоим world.js) ========
function ensureDisc(group, radiusScale = 0.75, color = 0xff5050) {
  if (group.userData._discMesh && group.userData._discMesh.isMesh) {
    const disc = group.userData._discMesh;
    disc.material.color.setHex(color);
    group.userData._discRadiusScale = radiusScale;
    return disc;
  }
  const geo = new THREE.CircleGeometry(0.13, 48);
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(geo, mat);
  disc.rotation.y = -Math.PI/2;
  group.userData._discMesh = disc;
  group.userData._discRadiusScale = radiusScale;
  return disc;
}

function attachDiscToSection(group, idx) {
  const secs = group?.userData?.sections || [];
  const sec = secs[idx]; if (!sec) return;
  const disc = group.userData._discMesh; if (!disc) return;
  if (disc.parent) disc.parent.remove(disc);
  // чуть впереди панели
  disc.position.set(0.20, 0, 0);
  sec.add(disc);
  group.userData._discIndex = idx;
}

export function setDiscState(group, state = 'red', { radiusScale, color } = {}) {
  const map = { red:0, yellow:1, green:2 };
  const idx = map[state]; if (idx == null) return;
  const discColor = (color != null) ? color :
    (state === 'red' ? 0xff5050 : state === 'yellow' ? 0xffd24d : 0x4ddf64);
  ensureDisc(group, radiusScale ?? group.userData._discRadiusScale ?? 0.75, discColor);
  attachDiscToSection(group, idx);
  group.userData._discState = state;
  if (group.userData._discMesh) group.userData._discMesh.material.color.setHex(discColor);
}

export function startDiscCycle(group, {
  sequence = ['red','yellow','green'],
  durations = { red: 1.0, yellow: 0.6, green: 1.2 },
  radiusScale = 0.75
} = {}) {
  setDiscState(group, sequence[0], { radiusScale });
  group.userData._discCycle = { seq: [...sequence], dur: { ...durations }, i: 0, t: 0 };
}

export function updateDiscCycle(group, dt) {
  const S = group?.userData?._discCycle; if (!S) return;
  S.t += dt;
  const cur = S.seq[S.i];
  const end = S.dur[cur] ?? 1.0;
  if (S.t >= end) {
    S.t = 0; S.i = (S.i + 1) % S.seq.length;
    setDiscState(group, S.seq[S.i]);
  }
}

// ======== Состояния R/Y/G для API (совместимо с твоим world.js) ========
export function setTrafficLightState(group, state) {
  // переключаем пары on/off
  const lenses = group?.userData?.lenses || [];
  const onIdx = state === 'red' ? 0 : state === 'yellow' ? 1 : state === 'green' ? 2 : -1;
  for (let i = 0; i < 3; i++) {
    const pair = lenses[i]; if (!pair) continue;
    const isOn = i === onIdx;
    pair.on.visible = isOn;
    pair.off.visible = !isOn;
  }
  group.userData.state = state;

  if (onIdx >= 0) {
    setDiscState(group, state);
  }
}