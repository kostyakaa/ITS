import * as THREE from 'three';
import { WORLD, LANES, TEXTURE } from './config.js';
import { VoxelCar as Car } from './voxelCar.js';
import { makeCrossCurbs } from './curb.js';
import { makeCrossSidewalks } from './sidewalk.js';   // ← добавили

const HALF = WORLD.half;

function roadHalfWidth() {
  const W = LANES.width ?? 3.5;
  const SHO = LANES.shoulder ?? 0.5;
  const MED = LANES.median ?? 1.0;
  const per = LANES.perSide ?? 2;
  return MED / 2 + SHO + W * per;
}

export class SceneObject {
  constructor(mesh = new THREE.Group()) {
    this.node = mesh; this.node.matrixAutoUpdate = true;
    this._path = null; this._cursor = 0; this._speed = 0;
  }
  addTo(parent){ parent.add(this.node); return this; }
  setPosition(x,y,z=0){ this.node.position.set(x,y,z); return this; }
  setRotationZ(rad){ this.node.rotation.z = rad; return this; }
  followPath(points,{speed=6,step=0.25}={}) {
    if(!points||points.length<2) return this;
    this._path={points,step}; this._cursor=0; this._speed=speed;
    const p0=points[0], p1=points[1];
    this.setPosition(p0.x,p0.y,p0.z||0);
    this.setRotationZ(Math.atan2(p1.y-p0.y,p1.x-p0.x));
    return this;
  }
  update(dt){
    if(!this._path) return;
    const {points,step}=this._path;
    const d=(this._speed/step)*dt;
    this._cursor=(this._cursor+d)%points.length;
    const i=Math.floor(this._cursor), j=(i+1)%points.length;
    const a=points[i], b=points[j], t=this._cursor-i;
    const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t, z=(a.z||0)+((b.z||0)-(a.z||0))*t;
    this.setPosition(x,y,z);
    this.setRotationZ(Math.atan2(b.y-a.y,b.x-a.x));
  }
}
export class CarObject extends SceneObject{ constructor(){ super(new Car()); } }

function sampleLine(a,b,step=0.25){
  const out=[]; const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
  const n=Math.max(2,Math.ceil(len/step));
  for(let k=0;k<n;k++){const t=k/n; out.push(new THREE.Vector3(a.x+dx*t,a.y+dy*t,0));}
  return out;
}
function buildSquareLoop(o,step=0.25){
  const p1=new THREE.Vector3(-o,+o,0), p2=new THREE.Vector3(+o,+o,0);
  const p3=new THREE.Vector3(+o,-o,0), p4=new THREE.Vector3(-o,-o,0);
  return [...sampleLine(p1,p2,step),...sampleLine(p2,p3,step),...sampleLine(p3,p4,step),...sampleLine(p4,p1,step)];
}

export class World {
  constructor() {
    this.group = new THREE.Group();
    this.clock = new THREE.Clock();
    this.objects = [];
    this.renderer = null;

    this._roadMesh = null;

    this.inlineCurbs = {
      angle: 0,
      span: 25,
      offset: 12,
      shift: 36.5,
      z: 0.00,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.32, tileLen: 0.90, gap: 0.02 },
    };

    this.outlineCurbs = {
      angle: 0,
      span: 25,
      offset: 7,
      shift: 32,
      z: 0.00,
      strip: { depth: 0.34, baseH: 0.08, stoneH: 0.16, tileLen: 0.90, gap: 0.02 },
    };

    this._curbGroup = null;
    this._sidewalkGroup = null; // ← добавили хранение тротуаров

    this._build();
  }
  attachRenderer(renderer){ this.renderer = renderer; }

  _setupTexture(tex) {
    if ('SRGBColorSpace' in THREE) tex.colorSpace = THREE.SRGBColorSpace; else if ('sRGBEncoding' in THREE) tex.encoding = THREE.sRGBEncoding;
    const aniso = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;
    tex.anisotropy = Math.max(8, aniso);
    tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }
  _load(url){ return new Promise((res,rej)=>{ if(!url) return res(null); new THREE.TextureLoader().load(url,t=>res(this._setupTexture(t)),undefined,rej); }); }

  async _build(){
    await this._buildRoad();
    this._buildCurbs();
    this._buildSidewalks();     // ← строим тротуары
    this._demoOneCar();
  }

  async _buildRoad(){
    const [base,markings,crosswalks,edges]=await Promise.all([
      this._load(TEXTURE.layers?.base || TEXTURE.url),
      this._load(TEXTURE.layers?.markings),
      this._load(TEXTURE.layers?.crosswalks),
      this._load(TEXTURE.layers?.edges),
    ]);
    const seed=base||markings||crosswalks||edges;
    const sizeMeters = TEXTURE.meters ?? WORLD.size;

    let colorMap=null, dispMap=null;
    if(seed?.image){
      const w=seed.image.width, h=seed.image.height;
      const c=document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d');
      if(base?.image) ctx.drawImage(base.image,0,0,w,h);
      if(markings?.image) ctx.drawImage(markings.image,0,0,w,h);
      if(crosswalks?.image){ ctx.globalAlpha=0.9; ctx.drawImage(crosswalks.image,0,0,w,h); ctx.globalAlpha=1; }
      if(edges?.image) ctx.drawImage(edges.image,0,0,w,h);
      colorMap=this._setupTexture(new THREE.CanvasTexture(c));

      if(markings?.image || crosswalks?.image){
        const d=document.createElement('canvas'); d.width=w; d.height=h; const dctx=d.getContext('2d');
        dctx.fillStyle='rgb(0,0,0)'; dctx.fillRect(0,0,w,h);
        if(markings?.image) dctx.drawImage(markings.image,0,0,w,h);
        if(crosswalks?.image) dctx.drawImage(crosswalks.image,0,0,w,h);
        dispMap=this._setupTexture(new THREE.CanvasTexture(d));
      }
    }

    const seg=Math.max(1,Math.floor((TEXTURE.meters ?? 100)*2));
    const geom=new THREE.PlaneGeometry(sizeMeters,sizeMeters,seg,seg);
    const mat=new THREE.MeshStandardMaterial({
      color: colorMap ? 0xffffff : 0x2f3545,
      metalness:0, roughness:0.9,
      map: colorMap || null,
      displacementMap: dispMap || null,
      displacementScale: dispMap ? ((TEXTURE.meters/(TEXTURE.pixels||5000))*2.0) : 0,
    });
    const mesh=new THREE.Mesh(geom,mat);
    mesh.position.z=-0.01; mesh.receiveShadow=true;
    this.group.add(mesh); this._roadMesh = mesh;
  }

  _buildCurbs(){
    if (this._outlineCurbGroup) this.group.remove(this._outlineCurbGroup);
    if (this._inlineCurbGroup) this.group.remove(this._inlineCurbGroup);

    this._outlineCurbGroup = makeCrossCurbs({
      span: this.outlineCurbs.span,
      offset: this.outlineCurbs.offset,
      shift: this.outlineCurbs.shift,
      z: this.outlineCurbs.z,
      strip: this.outlineCurbs.strip
    });

    this._inlineCurbGroup = makeCrossCurbs({
      span: this.inlineCurbs.span,
      offset: this.inlineCurbs.offset,
      shift: this.inlineCurbs.shift,
      z: this.inlineCurbs.z,
      strip: this.inlineCurbs.strip
    });

    this.group.add(this._outlineCurbGroup);
    this.group.add(this._inlineCurbGroup);
  }

  // === тротуары ===
  _buildSidewalks(){
    if (this._sidewalkGroup) this.group.remove(this._sidewalkGroup);

    // параметры между двумя бордюрами
    const offA = Math.min(this.outlineCurbs.offset, this.inlineCurbs.offset);
    const offB = Math.max(this.outlineCurbs.offset, this.inlineCurbs.offset);
    const span = Math.max(this.outlineCurbs.span, this.inlineCurbs.span);
    const shift = Math.max(Math.abs(this.outlineCurbs.shift), Math.abs(this.inlineCurbs.shift));

    this._sidewalkGroup = makeCrossSidewalks({
      angle: 0,
      span,
      offsetA: offA,
      offsetB: offB,
      shift ,
      z: this.outlineCurbs.z,
      curbDepth: this.outlineCurbs.strip?.depth ?? 0.34,
      h: 0.32,
    });

    this.group.add(this._sidewalkGroup);
  }

  // Поиграться параметрами
  setCurbParams({ angle, span, offset, shift, z } = {}){
    if (Number.isFinite(angle))  this.curbs.angle  = angle;
    if (Number.isFinite(span))   this.curbs.span   = span;
    if (Number.isFinite(offset)) this.curbs.offset = offset;
    if (Number.isFinite(shift))  this.curbs.shift  = shift;
    if (Number.isFinite(z))      this.curbs.z      = z;
    this._buildCurbs();
    this._buildSidewalks();
  }

  _demoOneCar(){
    const car=new CarObject().addTo(this.group);
    const o=roadHalfWidth(); const step=0.25; const speed=8;
    const loop=buildSquareLoop(o,step);
    car.setPosition(-o,+o,0).setRotationZ(0).followPath(loop,{speed,step});
    this.objects.push(car);
  }

  update(){
    const dt=this.clock.getDelta();
    for(const obj of this.objects) obj.update(dt);
  }
}