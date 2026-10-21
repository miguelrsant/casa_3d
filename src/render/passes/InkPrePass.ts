import {
  Color,
  DepthTexture,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  UnsignedIntType,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { Pass } from 'postprocessing';
import { octGlsl } from '../shaders/common.glsl';
import { revealParsGlsl } from '../shaders/reveal.glsl';
import { RV } from '../zones';
import { LAYER_INK } from '../../gen/builder';

const vertex = /* glsl */ `
#include <common>
attribute float inkId;
attribute float revealSeed;
varying vec3 vWp;
varying vec3 vWn;
varying vec3 vVn;
varying float vId;
varying float vSeed;
void main() {
  vec3 objectNormal = normal;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    objectNormal = mat3(instanceMatrix) * objectNormal;
  #endif
  vec4 wp = modelMatrix * p;
  vWp = wp.xyz;
  vec3 vn = normalize(normalMatrix * objectNormal);
  vVn = vn;
  vWn = inverseTransformDirection(vn, viewMatrix);
  vId = max(inkId, 1.0);
  vSeed = revealSeed;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
#include <common>
${revealParsGlsl}
${octGlsl}
varying vec3 vWp;
varying vec3 vWn;
varying vec3 vVn;
varying float vId;
varying float vSeed;
void main() {
  vec3 s = rvState(vWp, normalize(vWn), vSeed);
  gl_FragColor = vec4(vId, rvOctEncode(normalize(vVn)), s.x);
}
`;

/**
 * Pré-passe de traço: renderiza só a camada INK num G-buffer
 * (R: ID da peça · GB: normal compactada · A: revelado) + profundidade própria.
 */
export class InkPrePass extends Pass {
  readonly target: WebGLRenderTarget;
  readonly material: ShaderMaterial;
  /** Pula o passe quando nada em desenho está à vista. */
  active = true;
  /** Diagnóstico (?ink=0): pula o passe. */
  skip = false;
  private clear = new Color();

  constructor(scene: Scene, camera: Camera) {
    super('InkPrePass', scene, camera);
    this.needsSwap = false;
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.name = 'Ink.GBuffer';
    this.target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.material = new ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { ...RV } });
    this.material.name = 'InkPrePass';
  }

  get texture() {
    return this.target.texture;
  }
  get depthTexture() {
    return this.target.depthTexture!;
  }

  override render(renderer: WebGLRenderer) {
    if (this.skip) return;
    const scene = this.scene!;
    const camera = this.camera!;
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    if (this.active) {
      const prevOverride = scene.overrideMaterial;
      const prevMask = camera.layers.mask;
      scene.overrideMaterial = this.material;
      camera.layers.set(LAYER_INK);
      renderer.render(scene, camera);
      camera.layers.mask = prevMask;
      scene.overrideMaterial = prevOverride;
    }
    renderer.setClearColor(this.clear, alpha);
  }

  override setSize(width: number, height: number) {
    this.target.setSize(width, height);
  }
}
