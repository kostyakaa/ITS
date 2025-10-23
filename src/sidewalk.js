import * as THREE from "three";


function makeSlabPaverSet({
  size = 512,
  slab = 0.60,
  grout = 0.012,
  bevel = 0.010,
  palette = [
    [206, 210, 214],
    [198, 202, 206],
    [191, 195, 199]
  ],
  groutCol = [102,108,118]
} = {}) {
  const C = document.createElement('canvas'); C.width = C.height = size;
  const N = document.createElement('canvas'); N.width = N.height = size;
  const R = document.createElement('canvas'); R.width = R.height = size;
  const ctx = C.getContext('2d');
  const nctx = N.getContext('2d');
  const rctx = R.getContext('2d');

  const m2px = size / 1.0;
  const s = Math.max(4, Math.round(slab * m2px));
  const g = Math.max(1, Math.round(grout * m2px));
  const bev = Math.max(1, Math.round(bevel * m2px));

  ctx.fillStyle = `rgb(${groutCol[0]},${groutCol[1]},${groutCol[2]})`;
  ctx.fillRect(0, 0, size, size);

  const step = s + g;
  const count = Math.ceil(size / step) + 1;

  const rand = (a, b) => a + Math.random() * (b - a);
  for (let iy = 0; iy < count; iy++) {
    for (let ix = 0; ix < count; ix++) {
      const x0 = ix * step + g * 0.5;
      const y0 = iy * step + g * 0.5;
      const col = palette[(ix + iy) % palette.length].slice();
      col[0] += Math.round(rand(-5, 5));
      col[1] += Math.round(rand(-5, 5));
      col[2] += Math.round(rand(-5, 5));

      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.fillRect(x0, y0, s, s);

      const gradV = ctx.createLinearGradient(x0, y0, x0, y0 + s);
      gradV.addColorStop(0, 'rgba(0,0,0,0.025)');
      gradV.addColorStop(0.5, 'rgba(0,0,0,0)');
      gradV.addColorStop(1, 'rgba(0,0,0,0.025)');
      ctx.fillStyle = gradV; ctx.fillRect(x0, y0, s, s);


      const hbuf = nctx.createImageData(s, s);
      for (let yy = 0; yy < s; yy++) {
        for (let xx = 0; xx < s; xx++) {
          const d = Math.min(xx, s - 1 - xx, yy, s - 1 - yy);
          const t = Math.min(1, d / bev);
          const H = 200 + Math.round(55 * t);
          hbuf.data[(yy * s + xx) * 4 + 3] = H;
        }
      }
      nctx.putImageData(hbuf, x0, y0);

      const rimg = rctx.createImageData(s, s);
      for (let i = 0; i < s * s; i++) {
        const yy = (i / s) | 0, xx = i % s;
        const d = Math.min(xx, s - 1 - xx, yy, s - 1 - yy);
        const t = Math.min(1, d / bev);
        const Rv = Math.round(185 + (1 - t) * 25);
        rimg.data[i * 4 + 0] = Rv; rimg.data[i * 4 + 1] = Rv; rimg.data[i * 4 + 2] = Rv; rimg.data[i * 4 + 3] = 255;
      }
      rctx.putImageData(rimg, x0, y0);
    }
  }

  const height = nctx.getImageData(0, 0, size, size);
  const nimg = nctx.createImageData(size, size);
  const getH = (x, y) => { x = Math.max(0, Math.min(size - 1, x)); y = Math.max(0, Math.min(size - 1, y)); return height.data[(y * size + x) * 4 + 3] / 255; };
  const k = 1.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = getH(x + 1, y) - getH(x - 1, y);
      const dy = getH(x, y + 1) - getH(x, y - 1);
      let nx = -dx * k, ny = -dy * k, nz = 1.0; const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const i = (y * size + x) * 4; nimg.data[i] = (nx * 0.5 + 0.5) * 255; nimg.data[i + 1] = (ny * 0.5 + 0.5) * 255; nimg.data[i + 2] = (nz * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const color = new THREE.CanvasTexture(C);
  const normal = new THREE.CanvasTexture(N);
  const rough = new THREE.CanvasTexture(R);
  for (const t of [color, normal, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if ('SRGBColorSpace' in THREE) t.colorSpace = THREE.SRGBColorSpace; else if ('sRGBEncoding' in THREE) t.encoding = THREE.sRGBEncoding; }
  return { color, normal, rough, slab };
}

function buildMaterialFromSet(texSet, len, w, metersPerSlab = 0.60) {
  // keep a single texture set but independent repeat per piece
  const repX = Math.max(0.0001, len / metersPerSlab);
  const repY = Math.max(0.0001, w   / metersPerSlab);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: texSet.color,
    normalMap: texSet.normal,
    roughnessMap: texSet.rough,
    roughness: 1.0,
    metalness: 0.0,
  });
  mat.map = texSet.color; mat.normalMap = texSet.normal; mat.roughnessMap = texSet.rough;
  mat.map = mat.map; mat.normalMap = mat.normalMap; mat.roughnessMap = mat.roughnessMap;
  mat.map = mat.map;
  mat.map.repeat = new THREE.Vector2(repX, repY);
  mat.normalMap.repeat = new THREE.Vector2(repX, repY);
  mat.roughnessMap.repeat = new THREE.Vector2(repX, repY);

  mat.normalScale = new THREE.Vector2(0.4, 0.4);
  mat.side = THREE.FrontSide;
  mat.shadowSide = THREE.FrontSide;

  return mat;
}

function applyWorldAlignedUV(mat, mesh, metersPerSlab){
  const texs = [mat.map, mat.normalMap, mat.roughnessMap].filter(Boolean);
  for(const t of texs){
    t.matrixAutoUpdate = true;
    t.rotation = -mesh.rotation.z;
    let offX = (-mesh.position.x / metersPerSlab);
    let offY = (-mesh.position.y / metersPerSlab);
    offX = ((offX % 1) + 1) % 1;
    offY = ((offY % 1) + 1) % 1;
    t.offset.set(offX, offY);
  }
}

function makeSidewalkStrips({
  angle = 0,
  span = 25,
  offsetA = 7,
  offsetB = 12,
  shift = 0,
  z = 0.00,
  curbDepth = 0.34,
  h = 0.08,
  material = null,
  extendAtCenter = 0.20,
  zBias = 0.0,
  texSet = null,
} = {}){
  const g = new THREE.Group();
  const along = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  const normal = new THREE.Vector2(-along.y, along.x);

  const w = Math.max(0.04, Math.abs(offsetB - offsetA) - curbDepth);
  const len = Math.max(0.1, 2*span + extendAtCenter);
  const mid = (offsetA + offsetB) * 0.5;

  const mat = material || (texSet ? buildMaterialFromSet(texSet, len, w) : null) || makeSidewalkMaterial(len, w);
  const mk = (sign)=>{
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, h), mat);
    m.castShadow=false; m.receiveShadow=true;
    const cx = along.x*shift + normal.x*(sign*mid);
    const cy = along.y*shift + normal.y*(sign*mid);
    m.position.set(cx,cy, z + h/2 - 0.01 + zBias);
    m.rotation.z = Math.atan2(along.y, along.x);
    applyWorldAlignedUV(mat, m, 0.60);
    return m;
  };
  g.add(mk(+1), mk(-1));
  return g;
}

function makeCornerPatchesAligned({
  angle = 0,
  offsetA = 7,
  offsetB = 12,
  z = 0.0,
  curbDepth = 0.34,
  h = 0.08,
  material = null,
  overlap = 0.06,
  texSet = null,
} = {}){
  const g = new THREE.Group();
  const along = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  const normal = new THREE.Vector2(-along.y, along.x);
  const perpAlong = new THREE.Vector2(-along.y, along.x);
  const perpNormal = new THREE.Vector2(-perpAlong.y, perpAlong.x);

  const w = Math.max(0.02, Math.abs(offsetB - offsetA) - curbDepth) + overlap*2;
  const mid = (offsetA + offsetB) * 0.5;
  const len = w;
  const mat = material || (texSet ? buildMaterialFromSet(texSet, len, w) : null) || makeSidewalkMaterial(len, w);

  const build = (sx, sy) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, w, h), mat);
    m.castShadow=false; m.receiveShadow=true;
    const pos = new THREE.Vector2()
      .addScaledVector(normal, sx*mid)
      .addScaledVector(perpNormal, sy*mid);
    m.position.set(pos.x, pos.y, z + h/2 - 0.01 + 0.0012);
    m.rotation.z = 0;
    applyWorldAlignedUV(mat, m, 0.60);
    return m;
  };

  g.add(build(+1,+1), build(+1,-1), build(-1,+1), build(-1,-1));
  return g;
}

export function makeCrossSidewalks(opts = {}){
  const g = new THREE.Group();
  const shift = opts.shift ?? 0;
  const texSet = makeSlabPaverSet();
  const add = (o)=>{
    if (Math.abs(shift) > 1e-6){
      g.add(makeSidewalkStrips({ ...o, shift:+shift, texSet }));
      g.add(makeSidewalkStrips({ ...o, shift:-shift, texSet }));
    } else {
      g.add(makeSidewalkStrips({ ...o, shift:0, texSet }));
    }
  };

  add({ ...opts, zBias: 0.0 });
  add({ ...opts, angle:(opts.angle??0)+Math.PI/2, zBias: 0.0006 });
  g.add(makeCornerPatchesAligned({ ...opts, texSet }));
  return g;
}