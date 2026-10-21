import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three';

export type V3 = [number, number, number];

/** Materiais por face de uma caixa (null = não gerar a face). */
export interface FaceMats {
  px?: Material | null;
  nx?: Material | null;
  py?: Material | null;
  ny?: Material | null;
  pz?: Material | null;
  nz?: Material | null;
}

class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  ink: number[] = [];
  seed: number[] = [];
  idx: number[] = [];
  get count() {
    return this.pos.length / 3;
  }
}

const _v = new Vector3();
const _n = new Vector3();

/** Camada do passe de traço (arquitetura e móveis). */
export const LAYER_INK = 1;

let nextInkId = 10;
export const newInkId = () => {
  nextInkId = (nextInkId % 2000) + 1;
  return nextInkId;
};

/**
 * Acumula geometria por (grupo, material) e gera malhas mescladas.
 * Atributos extras: `inkId` (contorno por peça no desenho) e `revealSeed` (revela a peça inteira).
 */
export class Builder {
  private buckets = new Map<string, { group: string; material: Material; b: Bucket }>();
  private m = new Matrix4();
  private nm = new Matrix3();
  private stack: Matrix4[] = [];
  group = 'default';
  inkId = 1;
  seed = 0;

  push(m: Matrix4) {
    this.stack.push(this.m.clone());
    this.m.multiply(m);
    this.nm.getNormalMatrix(this.m);
  }
  pop() {
    this.m.copy(this.stack.pop() ?? new Matrix4());
    this.nm.getNormalMatrix(this.m);
  }

  private bucket(material: Material): Bucket {
    const k = `${this.group}|${material.uuid}`;
    let e = this.buckets.get(k);
    if (!e) {
      e = { group: this.group, material, b: new Bucket() };
      this.buckets.set(k, e);
    }
    return e.b;
  }

  /** Quad com cantos em ordem anti-horária vista pelo lado da normal. */
  quad(material: Material, p: V3[], n: V3, uvs: [number, number][]) {
    const b = this.bucket(material);
    const base = b.count;
    _n.set(n[0], n[1], n[2]).applyMatrix3(this.nm).normalize();
    for (let i = 0; i < 4; i++) {
      _v.set(p[i][0], p[i][1], p[i][2]).applyMatrix4(this.m);
      b.pos.push(_v.x, _v.y, _v.z);
      b.nor.push(_n.x, _n.y, _n.z);
      b.uv.push(uvs[i][0], uvs[i][1]);
      b.ink.push(this.inkId);
      b.seed.push(this.seed);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Caixa alinhada aos eixos (antes da transformação atual), UVs em metros. */
  box(a: V3, c: V3, mats: FaceMats) {
    const [ax, ay, az] = a;
    const [bx, by, bz] = c;
    if (mats.px) this.quad(mats.px, [[bx, ay, bz], [bx, ay, az], [bx, by, az], [bx, by, bz]], [1, 0, 0], [[-bz, ay], [-az, ay], [-az, by], [-bz, by]]);
    if (mats.nx) this.quad(mats.nx, [[ax, ay, az], [ax, ay, bz], [ax, by, bz], [ax, by, az]], [-1, 0, 0], [[az, ay], [bz, ay], [bz, by], [az, by]]);
    if (mats.py) this.quad(mats.py, [[ax, by, bz], [bx, by, bz], [bx, by, az], [ax, by, az]], [0, 1, 0], [[ax, -bz], [bx, -bz], [bx, -az], [ax, -az]]);
    if (mats.ny) this.quad(mats.ny, [[ax, ay, az], [bx, ay, az], [bx, ay, bz], [ax, ay, bz]], [0, -1, 0], [[ax, az], [bx, az], [bx, bz], [ax, bz]]);
    if (mats.pz) this.quad(mats.pz, [[ax, ay, bz], [bx, ay, bz], [bx, by, bz], [ax, by, bz]], [0, 0, 1], [[ax, ay], [bx, ay], [bx, by], [ax, by]]);
    if (mats.nz) this.quad(mats.nz, [[bx, ay, az], [ax, ay, az], [ax, by, az], [bx, by, az]], [0, 0, -1], [[-bx, ay], [-ax, ay], [-ax, by], [-bx, by]]);
  }

  /** Caixa com o mesmo material em todas as faces (sem a de baixo, por padrão). */
  solid(a: V3, c: V3, material: Material, bottom = false) {
    this.box(a, c, { px: material, nx: material, py: material, ny: bottom ? material : null, pz: material, nz: material });
  }

  /** Acrescenta uma BufferGeometry qualquer (cilindros, lathes, caixas arredondadas...). */
  geometry(geo: BufferGeometry, material: Material, local?: Matrix4) {
    if (local) this.push(local);
    const b = this.bucket(material);
    const base = b.count;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(this.m);
      b.pos.push(_v.x, _v.y, _v.z);
      if (nor) {
        _n.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize();
        b.nor.push(_n.x, _n.y, _n.z);
      } else b.nor.push(0, 1, 0);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i));
      else b.uv.push(_v.x, _v.z);
      b.ink.push(this.inkId);
      b.seed.push(this.seed);
    }
    const index = geo.getIndex();
    if (index) for (let i = 0; i < index.count; i++) b.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
    if (local) this.pop();
  }

  /** Gera uma malha por (grupo, material). */
  build(opts: { castShadow?: boolean; receiveShadow?: boolean; ink?: boolean } = {}): Map<string, Mesh[]> {
    const out = new Map<string, Mesh[]>();
    for (const { group, material, b } of this.buckets.values()) {
      if (!b.idx.length) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new Float32BufferAttribute(b.uv, 2));
      g.setAttribute('inkId', new Float32BufferAttribute(b.ink, 1));
      g.setAttribute('revealSeed', new Float32BufferAttribute(b.seed, 1));
      const n = b.count;
      g.setIndex(new BufferAttribute(n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx), 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new Mesh(g, material);
      mesh.castShadow = opts.castShadow ?? true;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      if (opts.ink !== false && !(material as { transparent?: boolean }).transparent) mesh.layers.enable(LAYER_INK);
      mesh.name = `${group}:${(material as { name?: string }).name ?? ''}`;
      if (!out.has(group)) out.set(group, []);
      out.get(group)!.push(mesh);
    }
    return out;
  }
}

export const addAll = (parent: Object3D, groups: Map<string, Mesh[]>) => {
  for (const meshes of groups.values()) for (const m of meshes) parent.add(m);
};
