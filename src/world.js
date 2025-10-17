import * as THREE from 'three';
import { WORLD, LANES, TEXTURE, COLORS, TRAFFIC } from './config.js';
import { VoxelCar as Car } from './voxelCar.js';

const SHARP_TEXTURE = false;
const HALF = WORLD.half;
const Z = { ground: -0.05 };

function laneOffsets() {
  const start = LANES.median / 2 + LANES.shoulder + LANES.width / 2;
  return Array.from({ length: LANES.perSide }, (_, i) => start + i * LANES.width);
}
const OFF = laneOffsets();

export class World {
  constructor() {
    this.group = new THREE.Group();
    this.clock = new THREE.Clock();
    this.vehicles = [];
    this.renderer = null;
    this._build();
  }
  attachRenderer(renderer) { this.renderer = renderer; }

  _build() {
    // трава/фон
    const grassBase = this._plane(WORLD.size * 3, WORLD.size * 3, COLORS.grassMid, Z.ground - 0.01);
    const grassMid  = this._plane(WORLD.size, WORLD.size, COLORS.grassMid, Z.ground - 0.009);
    const gLeft  = this._plane(WORLD.size, WORLD.size, COLORS.grassSide, Z.ground - 0.008); gLeft.position.x  = -WORLD.size;
    const gRight = this._plane(WORLD.size, WORLD.size, COLORS.grassSide, Z.ground - 0.008); gRight.position.x =  WORLD.size;
    const gTop   = this._plane(WORLD.size, WORLD.size, COLORS.grassSide, Z.ground - 0.008); gTop.position.y   =  WORLD.size;
    const gBot   = this._plane(WORLD.size, WORLD.size, COLORS.grassSide, Z.ground - 0.008); gBot.position.y   = -WORLD.size;
    this.group.add(grassBase, grassMid, gLeft, gRight, gTop, gBot);

    // дорога из слоёв PNG (без AO — как ты и хотел)
    this._buildRoadLayers();

    // транспорт
    this._spawn();
  }

  _plane(w, h, color, z = 0) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color })
    );
    m.position.z = z;
    return m;
  }

  // ———————————————————————
  // ЗАГРУЗКА ТЕКСТУР С МНОГОСТУПЕНЧАТЫМ FALLBACK
  // ———————————————————————
  _setupTexture(tex) {
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    else if ('sRGBEncoding' in THREE) tex.encoding = THREE.sRGBEncoding;

    if (SHARP_TEXTURE) {
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.NearestFilter;
    } else {
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    }
    let aniso = 8;
    if (this.renderer?.capabilities?.getMaxAnisotropy) {
      aniso = this.renderer.capabilities.getMaxAnisotropy();
    }
    tex.anisotropy = Math.max(8, aniso);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  _loadOne(url) {
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error("no url")); return; }
      const loader = new THREE.TextureLoader();
      loader.load(url, (t) => resolve(this._setupTexture(t)), undefined, reject);
    });
  }

  async _loadWithFallback(urls) {
    const tried = [];
    for (const u of urls) {
      try {
        const tex = await this._loadOne(u);
        console.info("[texture] ok:", u);
        return tex;
      } catch (e) {
        if (u) { tried.push(u); console.warn("[texture] 404:", u); }
      }
    }
    console.error("[texture] all failed. Tried:", tried.join(", "));
    return null;
  }

  // ———————————————————————
  // ДОРОГА ИЗ СЛОЁВ
  // ———————————————————————
  async _buildRoadLayers() {
    const size = TEXTURE.meters;
    const orderBase = 10;

    // БАЗА: сразу делаем асфальтово-серую, чтобы НЕ было белого поля
    const matBase = new THREE.MeshStandardMaterial({
      color: 0x2f3545,   // тёмно-серый асфальт по умолчанию
      metalness: 0.0,
      roughness: 1.0,
      transparent: false
    });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(size, size), matBase);
    base.position.z = Z.ground;
    base.renderOrder = orderBase;
    base.receiveShadow = true;
    this.group.add(base);

    // пробуем загрузить картинку для базы: layers.base → TEXTURE.url → /kek.png → /frame.png
    // Подбираем список кандидатов для базовой текстуры дороги: только
    // определённый слой base и возможный url, без лишних заглушек.
    const baseCandidates = [
      TEXTURE.layers?.base,
      TEXTURE.url,
    ].filter(Boolean);

    const baseTex = await this._loadWithFallback(baseCandidates);
    if (baseTex) {
      matBase.map = baseTex;
      matBase.color.set(0xffffff); // цвет берём из карты
      matBase.needsUpdate = true;
    } else {
      console.warn("[road] using fallback asphalt color only (no base map)");
    }

    // helper для поверхностных слоёв (markings/crosswalks/edges)
    const addOverlay = async (url, { blending = THREE.NormalBlending, alphaTest = 0.5 } = {}, extraOrder = 1) => {
      if (!url) return;
      const tex = await this._loadWithFallback([url]);
      if (!tex) return; // тихо пропускаем, если файла нет

      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        map: tex,
        blending,
        depthWrite: false,   // не пишем глубину → нет «миганий»
        alphaTest,           // жёсткий край без серых ореолов
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.position.z = Z.ground + 0.0001 * extraOrder; // микро-смещение
      mesh.renderOrder = orderBase + extraOrder;
      this.group.add(mesh);
    };

    // твоя текущая конфигурация: markings/crosswalks/edges (без AO)
    await addOverlay(TEXTURE.layers?.markings,   { blending: THREE.NormalBlending, alphaTest: 0.6 }, 2);
    await addOverlay(TEXTURE.layers?.crosswalks, { blending: THREE.NormalBlending, alphaTest: 0.6 }, 3);
    await addOverlay(TEXTURE.layers?.edges,      { blending: THREE.NormalBlending, alphaTest: 0.6 }, 4);
  }

  // ———————————————————————
  // ТРАНСПОРТ
  // ———————————————————————
  _spawn() {
    const min = -HALF + 2.0, max = HALF - 2.0;

    const spawnHoriz = (sign) => {
      OFF.forEach(off => {
        for (let k = 0; k < TRAFFIC.perLane; k++) {
          const obj = new Car();
          obj.position.set(THREE.MathUtils.randFloat(min, max), sign * off, 0);
          if (sign < 0) obj.rotation.z = Math.PI;
          this.group.add(obj);
          this.vehicles.push({ obj, axis:'x', dir: sign>0?1:-1, speed: this._randSpeed(), min, max });
        }
      });
    };
    const spawnVert = (sign) => {
      OFF.forEach(off => {
        for (let k = 0; k < TRAFFIC.perLane; k++) {
          const obj = new Car();
          obj.position.set(sign * off, THREE.MathUtils.randFloat(min, max), 0);
          obj.rotation.z = sign>0 ? Math.PI/2 : -Math.PI/2;
          this.group.add(obj);
          this.vehicles.push({ obj, axis:'y', dir: sign>0?1:-1, speed: this._randSpeed(), min, max });
        }
      });
    };

    spawnHoriz(+1); spawnHoriz(-1);
    spawnVert(+1);  spawnVert(-1);
  }

  _randSpeed() {
    const s = TRAFFIC.speeds || [6, 8, 10];
    const base = s[(Math.random() * s.length) | 0];
    return THREE.MathUtils.randFloat(Math.max(3, base - 1), base + 1);
  }

  update() {
    const dt = this.clock.getDelta();
    for (const v of this.vehicles) {
      if (v.axis === 'x') {
        v.obj.position.x += v.dir * v.speed * dt;
        if (v.obj.position.x >  HALF - 2.0) { v.obj.position.x =  HALF - 2.0; v.dir=-1; v.obj.rotation.z = Math.PI; }
        if (v.obj.position.x < -HALF + 2.0) { v.obj.position.x = -HALF + 2.0; v.dir= 1; v.obj.rotation.z = 0; }
      } else {
        v.obj.position.y += v.dir * v.speed * dt;
        if (v.obj.position.y >  HALF - 2.0) { v.obj.position.y =  HALF - 2.0; v.dir=-1; v.obj.rotation.z = -Math.PI/2; }
        if (v.obj.position.y < -HALF + 2.0) { v.obj.position.y = -HALF + 2.0; v.dir= 1; v.obj.rotation.z =  Math.PI/2; }
      }
    }
  }
}