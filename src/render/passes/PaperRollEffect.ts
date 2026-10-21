import { Uniform, type Texture } from 'three';
import { Effect } from 'postprocessing';

const fragment = /* glsl */ `
uniform sampler2D tPaper;
uniform float uRoll;
uniform float uHasPaper;

vec3 paperAt(vec2 uv) {
  // o cache é a saída final (sRGB): decodifica para linear antes de misturar
  return pow(texture2D(tPaper, uv).rgb, vec3(2.2));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uRoll <= 0.0 || uHasPaper < 0.5) { outputColor = inputColor; return; }
  float aspect = resolution.x / resolution.y;
  float R = 0.045;                       // raio do rolo (em altura de tela)
  float xr = mix(-0.06, 1.0 + 2.0 * R / aspect, uRoll);
  float d = (uv.x - xr) * aspect;        // distância ao eixo do rolo, em unidades de altura
  vec3 col;
  if (d < -R) {
    // papel já desenrolado (leve sombra perto do rolo, onde ele ainda se curva)
    col = paperAt(uv) * (1.0 - 0.18 * exp((d + R) * 26.0));
  } else if (d < R) {
    // o rolo: cilindro com o desenho enrolado, iluminação de cima-esquerda
    float s = clamp(d / R, -1.0, 1.0);
    float ang = asin(s);
    vec2 puv = vec2(xr + (ang * R * 1.6) / aspect, uv.y);
    vec3 p = paperAt(puv);
    float shade = 0.62 + 0.38 * cos(ang * 1.15 + 0.35);
    float spec = pow(max(0.0, cos(ang + 0.55)), 18.0) * 0.18;
    float rim = smoothstep(0.82, 1.0, abs(s)) * 0.35;
    col = p * shade * (1.0 - rim) + spec;
  } else {
    // render ao vivo com a sombra do rolo
    float sh = exp(-(d - R) * 22.0) * 0.42;
    col = inputColor.rgb * (1.0 - sh);
  }
  outputColor = vec4(col, 1.0);
}
`;

/** Final do percurso: uma folha de papel desenrola sobre o render e devolve a planta. */
export class PaperRollEffect extends Effect {
  constructor() {
    super('PaperRollEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['tPaper', new Uniform(null)],
        ['uRoll', new Uniform(0)],
        ['uHasPaper', new Uniform(0)],
      ]),
    });
  }
  setPaper(t: Texture | null) {
    this.uniforms.get('tPaper')!.value = t;
    this.uniforms.get('uHasPaper')!.value = t ? 1 : 0;
  }
  set roll(v: number) {
    this.uniforms.get('uRoll')!.value = v;
  }
}
