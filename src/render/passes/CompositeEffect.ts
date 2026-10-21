import { Color, Uniform, Vector2, type DepthTexture, type Texture } from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { hashGlsl, octGlsl, toneMappingGlsl } from '../shaders/common.glsl';

const fragment = /* glsl */ `
uniform sampler2D tPreAO;
uniform sampler2D tInk;
uniform highp sampler2D tInkDepth;
uniform vec3 uPaper;
uniform vec3 uInkColor;
uniform float uSkyReveal;
uniform float uExposure;
uniform float uLine;
uniform float uGrain;
uniform float uInkStrength;
uniform int uToneMap;
uniform vec2 uInkFade;

${hashGlsl}
${octGlsl}
${toneMappingGlsl}

float paperGrain(vec2 frag) {
  vec2 p = frag / resolution.y;
  float blot = rvValueNoise(p * 4.0) * 0.5 + rvValueNoise(p * 9.0 + 3.1) * 0.32 + rvValueNoise(p * 23.0 + 7.7) * 0.18;
  float fine = rvHash12(floor(frag)) - 0.5;
  return 1.0 - uGrain * (0.06 * (blot - 0.5) + 0.014 * fine);
}

vec3 toneMap(vec3 c) {
  c *= uExposure;
  if (uToneMap == 1) return rvACES(c);
  if (uToneMap == 2) return rvNeutral(c);
  return rvAgX(c);
}

float dist(float d) { return -getViewZ(d); }

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec4 g = texture2D(tInk, uv);
  float dInk = dist(texture2D(tInkDepth, uv).r);
  float dMain = dist(depth);
  bool hasInk = g.r > 0.5;
  bool sameSurf = hasInk && abs(dMain - dInk) <= max(0.03, dInk * 0.004);
  bool drawn = sameSurf && g.a < 0.5;

  vec3 lit = toneMap(inputColor.rgb);
  float grain = paperGrain(gl_FragCoord.xy);
  vec3 col;
  if (sameSurf) col = drawn ? texture2D(tPreAO, uv).rgb * grain : lit;
  else if (depth >= 0.99999) col = mix(uPaper * grain, lit, uSkyReveal);
  else col = lit;

  if (drawn) {
    vec2 s = texelSize * uLine;
    vec4 gL = texture2D(tInk, uv - vec2(s.x, 0.0));
    vec4 gR = texture2D(tInk, uv + vec2(s.x, 0.0));
    vec4 gD = texture2D(tInk, uv - vec2(0.0, s.y));
    vec4 gU = texture2D(tInk, uv + vec2(0.0, s.y));
    float dL = dist(texture2D(tInkDepth, uv - vec2(s.x, 0.0)).r);
    float dR = dist(texture2D(tInkDepth, uv + vec2(s.x, 0.0)).r);
    float dD = dist(texture2D(tInkDepth, uv - vec2(0.0, s.y)).r);
    float dU = dist(texture2D(tInkDepth, uv + vec2(0.0, s.y)).r);

    float e = 0.0;
    // silhueta contra o fundo (o traço fica do lado do objeto)
    if (gL.r < 0.5 || gR.r < 0.5 || gD.r < 0.5 || gU.r < 0.5) e = 1.0;
    // degrau de profundidade (laplaciano positivo = lado mais próximo)
    float lapX = (dL + dR - 2.0 * dInk) / dInk;
    float lapY = (dD + dU - 2.0 * dInk) / dInk;
    if (max(lapX, lapY) > 0.018) e = 1.0;
    // peças diferentes (desempate pelo ID evita linha dupla)
    if ((gR.r > 0.5 && abs(gR.r - g.r) > 0.5 && g.r > gR.r) || (gU.r > 0.5 && abs(gU.r - g.r) > 0.5 && g.r > gU.r) ||
        (gL.r > 0.5 && abs(gL.r - g.r) > 0.5 && g.r > gL.r) || (gD.r > 0.5 && abs(gD.r - g.r) > 0.5 && g.r > gD.r)) e = 1.0;
    // quinas (normal muda) — só para a direita e para cima, para manter 1 px
    vec3 n0 = rvOctDecode(g.gb);
    if ((gR.r > 0.5 && dot(n0, rvOctDecode(gR.gb)) < 0.86) || (gU.r > 0.5 && dot(n0, rvOctDecode(gU.gb)) < 0.86)) e = 1.0;

    float fade = 1.0 - 0.6 * smoothstep(uInkFade.x, uInkFade.y, dInk);
    col = mix(col, uInkColor, e * uInkStrength * fade);
  }
  outputColor = vec4(col, 1.0);
}
`;

export interface CompositeInputs {
  preAO: Texture;
  ink: Texture;
  inkDepth: DepthTexture;
  paper: Color;
  inkColor: Color;
}

/** Junta render (com tone mapping) e desenho (sem HDR), desenha o traço e o grão do papel. */
export class CompositeEffect extends Effect {
  constructor(i: CompositeInputs) {
    super('CompositeEffect', fragment, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, Uniform>([
        ['tPreAO', new Uniform(i.preAO)],
        ['tInk', new Uniform(i.ink)],
        ['tInkDepth', new Uniform(i.inkDepth)],
        ['uPaper', new Uniform(i.paper)],
        ['uInkColor', new Uniform(i.inkColor)],
        ['uSkyReveal', new Uniform(0)],
        ['uExposure', new Uniform(1)],
        ['uLine', new Uniform(1)],
        ['uGrain', new Uniform(1)],
        ['uInkStrength', new Uniform(0.92)],
        ['uToneMap', new Uniform(0)],
        ['uInkFade', new Uniform(new Vector2(1e4, 2e4))],
      ]),
    });
  }
  set(name: string, value: unknown) {
    this.uniforms.get(name)!.value = value;
  }
}
