import { Color, MathUtils, PointLight, Vector3, type Scene } from 'three';
import type { House, Rect } from '../data/schema';
import { zoneIndex } from '../data/schema';
import type { SceneState } from '../story/stateAt';

/**
 * Pool fixo de luzes pontuais (sem sombra) que acompanha o ambiente onde a câmera está.
 * De dia simula o rebatimento quente da luz do sol; à noite vira a iluminação da casa.
 * A quantidade de luzes nunca muda (mudar recompila todos os shaders do three).
 */
export class LightRig {
  private lights: PointLight[] = [];
  private targets: Vector3[] = [];
  private intensity = 0;
  private day = new Color('#ffe2c2');
  private nightC = new Color('#ffbf7a');
  /** Luzes fixas de cena: fogo do lounge e luz subaquática da piscina. */
  readonly fire: PointLight;
  private pool: PointLight[] = [];
  private time = 0;
  /** Com menos luzes por ambiente, cada uma compensa a intensidade. */
  private gain: number;
  private poolGain: number;

  constructor(
    scene: Scene,
    private house: House,
    roomLights = 3,
    poolLights = 2,
  ) {
    this.gain = roomLights >= 3 ? 1 : 2.2;
    this.poolGain = poolLights >= 2 ? 1 : 1.7;
    for (let i = 0; i < roomLights; i++) {
      const l = new PointLight(0xffe2c2, 0, 15, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
      this.targets.push(new Vector3());
    }
    this.fire = new PointLight(0xff8a3d, 0, 11, 2);
    this.fire.position.set(29, 0.55, -7);
    scene.add(this.fire);
    for (const x of poolLights >= 2 ? [13, 19] : [16]) {
      const l = new PointLight(0x39d3c8, 0, 9, 2);
      l.position.set(x, -0.5, -6.5);
      scene.add(l);
      this.pool.push(l);
    }
  }

  private roomAt(x: number, z: number): { rect: Rect; h: number } | null {
    for (const r of this.house.rooms) {
      const { x0, z0, x1, z1 } = r.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return { rect: r.rect, h: r.ceiling };
    }
    for (const o of this.house.outdoor) {
      if (!o.roof) continue;
      const { x0, z0, x1, z1 } = o.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return { rect: o.rect, h: o.roof };
    }
    return null;
  }

  /** 1 fora de casa, menor dentro (menos céu visível → menos luz ambiente azul). */
  envFactor = 1;

  update(s: SceneState, dt: number) {
    const room = s.pos.y < 3.5 ? this.roomAt(s.pos.x, s.pos.z) : null;
    let want = 0;
    if (room) {
      const { x0, z0, x1, z1 } = room.rect;
      const along = x1 - x0 >= z1 - z0;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const y = room.h * 0.62;
      const pts = along
        ? [new Vector3(MathUtils.lerp(x0, x1, 0.22), y, cz), new Vector3(cx, y, cz), new Vector3(MathUtils.lerp(x0, x1, 0.78), y, cz)]
        : [new Vector3(cx, y, MathUtils.lerp(z0, z1, 0.22)), new Vector3(cx, y, cz), new Vector3(cx, y, MathUtils.lerp(z0, z1, 0.78))];
      if (this.lights.length === 1) this.targets[0].copy(pts[1]);
      else pts.forEach((p, i) => this.targets[i]?.copy(p));
      const area = (x1 - x0) * (z1 - z0);
      want = (0.7 + Math.min(area, 110) * 0.012) * (1 + 2.2 * s.night) * Math.min(1, s.sky * 1.5 + s.night);
    }
    this.time += dt;
    const fl = 0.82 + 0.12 * Math.sin(this.time * 13.1) + 0.07 * Math.sin(this.time * 27.7 + 1.3) + 0.05 * Math.sin(this.time * 41.9);
    const lounge = s.reveal[zoneIndex('lounge')];
    this.fire.intensity = 16 * s.night * lounge * fl;
    for (const l of this.pool) l.intensity = 9 * this.poolGain * s.night * s.reveal[zoneIndex('piscina')];
    const k = 1 - Math.exp(-dt * 4);
    this.envFactor += ((room ? 0.55 : 1) - this.envFactor) * k;
    this.intensity += (want - this.intensity) * k;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (l.position.lengthSq() === 0) l.position.copy(this.targets[i]);
      l.position.lerp(this.targets[i], k);
      l.intensity = this.intensity * this.gain;
      l.color.copy(this.day).lerp(this.nightC, s.night);
    }
  }
}
