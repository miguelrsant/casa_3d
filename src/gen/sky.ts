import {
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PMREMGenerator,
  Scene,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const _up = new Vector3(0, 1, 0);
const _x = new Vector3();
const _y = new Vector3();
const _c = new Vector3();

/** Direção do sol a partir de azimute (0 = norte, horário) e elevação, em graus. Norte = −z. */
export function sunDirection(azDeg: number, elDeg: number, out = new Vector3()): Vector3 {
  const az = MathUtils.degToRad(azDeg);
  const el = MathUtils.degToRad(elDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export interface SunKey {
  az: number;
  el: number;
}

/** 1 abaixo de `lo`, 0 acima de `hi` (smoothstep decrescente). */
const fall = (x: number, hi: number, lo: number) => 1 - MathUtils.smoothstep(x, lo, hi);

/** Hora azul: o Preetham escurece demais com o sol abaixo do horizonte. */
function addTwilight(sky: Sky) {
  const m = sky.material;
  m.uniforms.uTwilight = { value: 0 };
  m.fragmentShader = m.fragmentShader.replace('uniform float time;', 'uniform float time;\nuniform float uTwilight;').replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `{
      float hz = clamp(direction.y, 0.0, 1.0);
      vec3 tw = mix(vec3(0.028, 0.034, 0.058), vec3(0.006, 0.011, 0.032), pow(hz, 0.45));
      vec2 sd = normalize(vSunDirection.xz + vec2(1e-5));
      vec2 dd = normalize(direction.xz + vec2(1e-5));
      tw += vec3(0.075, 0.034, 0.015) * pow(max(dot(sd, dd), 0.0), 5.0) * pow(1.0 - hz, 4.0);
      texColor = max(texColor, tw * uTwilight);
    }
    gl_FragColor = vec4( texColor, 1.0 );`,
  );
}

/** Céu procedural (Preetham), sol com sombra, luz hemisférica e mapas de ambiente pré-calculados. */
export class SkySystem {
  readonly sky: Sky;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly target = new Object3D();
  private envMaps: { key: SunKey; tex: Texture }[] = [];
  private dir = new Vector3();
  private warm = new Color('#FFD7A6');
  private noon = new Color('#FFF6EA');
  private dusk = new Color('#FF9A5C');
  private moonC = new Color('#9fb6ff');
  private moonDir = new Vector3();

  constructor(scene: Scene, shadowSize: number) {
    this.sky = new Sky();
    this.sky.scale.setScalar(1800);
    // desenhado por último entre os opacos (fica no plano distante): o teste de profundidade descarta
    // o céu atrás das paredes, em vez de calcular o Preetham na tela inteira a cada quadro
    this.sky.renderOrder = 1000;
    addTwilight(this.sky);
    const m = this.sky.material;
    m.depthWrite = false;
    const u = m.uniforms;
    if (u.showSunDisc) u.showSunDisc.value = false;
    u.turbidity.value = 4.2;
    u.rayleigh.value = 1.15;
    u.mieCoefficient.value = 0.0028;
    u.mieDirectionalG.value = 0.78;
    scene.add(this.sky);

    this.sun = new DirectionalLight(0xffffff, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 240;
    this.sun.target = this.target;
    scene.add(this.sun, this.target);

    this.hemi = new HemisphereLight(0xdfe8f0, 0xb49a76, 0.45);
    scene.add(this.hemi);
  }

  /** Reduz o shadow map à metade (mínimo 1024). true se mudou. */
  halveShadow(): boolean {
    const size = this.sun.shadow.mapSize.x;
    if (size <= 1024) return false;
    this.sun.shadow.mapSize.set(size / 2, size / 2);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    return true;
  }

  /** Pré-calcula mapas de ambiente ao longo do horário (sem regenerar durante o scroll). */
  precompute(renderer: WebGLRenderer, keys: SunKey[], size: number) {
    const pmrem = new PMREMGenerator(renderer);
    const envScene = new Scene();
    const sky = new Sky();
    sky.scale.setScalar(90);
    addTwilight(sky);
    sky.material.uniforms.turbidity.value = 4.2;
    sky.material.uniforms.rayleigh.value = 1.15;
    sky.material.uniforms.mieCoefficient.value = 0.0028;
    sky.material.uniforms.mieDirectionalG.value = 0.78;
    sky.material.uniforms.showSunDisc && (sky.material.uniforms.showSunDisc.value = false);
    envScene.add(sky);
    const groundMat = new MeshBasicMaterial({ color: new Color('#b5a585') });
    const ground = new Mesh(new CircleGeometry(80, 32), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    envScene.add(ground);
    for (const key of keys) {
      sunDirection(key.az, key.el, this.dir);
      sky.material.uniforms.sunPosition.value.copy(this.dir);
      sky.material.uniforms.uTwilight.value = fall(key.el, 2, -2.5) * 2.2;
      const day = MathUtils.smoothstep(key.el, -6, 20);
      groundMat.color.set('#c2b08c').multiplyScalar(0.15 + 0.85 * day);
      const rt = pmrem.fromScene(envScene, 0, 0.1, 300, { size });
      this.envMaps.push({ key, tex: rt.texture });
    }
    pmrem.dispose();
  }

  /** Mapa de ambiente mais próximo da elevação atual. */
  envFor(el: number): Texture | null {
    let best: Texture | null = null;
    let bd = Infinity;
    for (const e of this.envMaps) {
      const d = Math.abs(e.key.el - el);
      if (d < bd) {
        bd = d;
        best = e.tex;
      }
    }
    return best;
  }

  /** Posiciona o sol, ajusta cor/intensidade e enquadra a sombra em torno de `center`. */
  update(az: number, el: number, center: Vector3, radius: number) {
    sunDirection(az, el, this.dir);
    this.sky.material.uniforms.sunPosition.value.copy(this.dir);
    this.sky.material.uniforms.uTwilight.value = fall(el, 2, -2.5);
    const day = MathUtils.smoothstep(el, -4, 14);
    // fim de tarde: o sol só fica branco bem alto (o percurso inteiro é por volta das 17 h)
    const high = MathUtils.smoothstep(el, 28, 55);
    const moon = fall(el, 0.5, -2);
    this.sun.color.copy(this.dusk).lerp(this.warm, MathUtils.smoothstep(el, 2, 14)).lerp(this.noon, high).lerp(this.moonC, moon);
    this.sun.intensity = 5.6 * MathUtils.smoothstep(el, -1, 6) + 0.32 * moon;
    sunDirection(70, 42, this.moonDir);
    const lightDir = this.dir.clone().lerp(this.moonDir, moon).normalize();
    this.hemi.intensity = 0.08 + 0.4 * day + 0.3 * moon;
    this.hemi.color.set('#5c6f9c').lerp(new Color('#e4ebf1'), day);
    this.hemi.groundColor.set('#2a2622').lerp(new Color('#b49a76'), day);
    // centro da sombra preso à grade de texels do shadow map: andando com a câmera, a sombra se desloca
    // em texels inteiros e as bordas não "tremem" (serrilhado andando na madeira dos sofás do lounge)
    const texel = (2 * radius) / this.sun.shadow.mapSize.x;
    _x.crossVectors(_up, lightDir).normalize();
    _y.crossVectors(lightDir, _x);
    const sx = Math.round(center.dot(_x) / texel) * texel - center.dot(_x);
    const sy = Math.round(center.dot(_y) / texel) * texel - center.dot(_y);
    _c.copy(center).addScaledVector(_x, sx).addScaledVector(_y, sy);
    this.target.position.copy(_c);
    this.sun.position.copy(_c).addScaledVector(lightDir, 110);
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.updateProjectionMatrix();
  }

  get direction() {
    return this.dir;
  }
}
