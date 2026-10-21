import {
  FramebufferTexture,
  HalfFloatType,
  Vector2,
  NoToneMapping,
  UnsignedByteType,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderTarget,
  WebGLRenderer,
  type PerspectiveCamera,
  type Scene,
} from 'three';
import { BloomEffect, CopyPass, EffectComposer, EffectPass, RenderPass, SMAAEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { InkPrePass } from './passes/InkPrePass';
import { CompositeEffect } from './passes/CompositeEffect';
import { PaperRollEffect } from './passes/PaperRollEffect';
import { palette } from './zones';
import { FRAGILE_PIXELS, QUALITY, isFragileGpu, type Quality, type Tier } from './quality';

export { detectTier, type Tier } from './quality';

export class Renderer {
  readonly gl: WebGLRenderer;
  readonly composer: EffectComposer;
  readonly ink: InkPrePass;
  readonly composite: CompositeEffect;
  readonly roll: PaperRollEffect;
  private paperTex: FramebufferTexture | null = null;
  readonly ao: N8AOPostPass | null;
  readonly bloom: BloomEffect;
  readonly tier: Tier;
  readonly quality: Quality;
  /** Escala de resolução dinâmica (o controle adaptativo reduz quando a GPU não acompanha). */
  scale = 1;
  width = 1;
  height = 1;
  dpr = 1;

  /** Diagnóstico: ?pp=0 desliga o pós; ?ao=0, ?smaa=0, ?bloom=0, ?ink=0, ?comp=0, ?hf=0|1 mexem nos passes; ?sh=0 desliga as sombras. */
  private readonly flags = new URLSearchParams(location.search);
  private readonly plain: boolean;
  private scene: Scene;
  private camera: PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement, scene: Scene, camera: PerspectiveCamera, tier: Tier) {
    this.tier = tier;
    this.scene = scene;
    this.camera = camera;
    this.plain = this.flags.get('pp') === '0';
    const gl = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = NoToneMapping;
    gl.shadowMap.enabled = this.flags.get('sh') !== '0';
    gl.shadowMap.type = PCFShadowMap;
    gl.shadowMap.autoUpdate = false;
    this.gl = gl;
    const fragile = isFragileGpu(this.gpuName) && !this.flags.has('q');
    this.quality = fragile ? { ...QUALITY[tier], pixels: Math.min(QUALITY[tier].pixels, FRAGILE_PIXELS) } : QUALITY[tier];

    // buffers de 8 bits nas GPUs frágeis: metade da memória de vídeo do pós (o nouveau cai sob pressão de memória)
    const hf = (this.flags.get('hf') ?? (fragile ? '0' : '1')) !== '0';
    const bufferType = hf ? HalfFloatType : UnsignedByteType;
    const composer = new EffectComposer(gl, { frameBufferType: bufferType, multisampling: 0 });
    this.ink = new InkPrePass(scene, camera);
    if (this.flags.get('ink') === '0') this.ink.skip = true;
    composer.addPass(this.ink);
    composer.addPass(new RenderPass(scene, camera));
    const copy = new CopyPass(new WebGLRenderTarget(1, 1, { type: bufferType, depthBuffer: false, stencilBuffer: false }));
    composer.addPass(copy);

    if (this.quality.ao && this.flags.get('ao') !== '0') {
      const ao = new N8AOPostPass(scene, camera, 1, 1);
      ao.configuration.aoRadius = 1.1;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = 2.6;
      ao.configuration.halfRes = tier === 'medium';
      ao.configuration.gammaCorrection = false;
      ao.configuration.transparencyAware = false;
      ao.setQualityMode(tier === 'high' ? 'High' : 'Medium');
      composer.addPass(ao);
      this.ao = ao;
    } else this.ao = null;

    this.bloom = new BloomEffect({ luminanceThreshold: 2.2, luminanceSmoothing: 0.4, intensity: 0.55, mipmapBlur: true, radius: 0.68 });
    if (this.flags.get('bloom') !== '0') composer.addPass(new EffectPass(camera, this.bloom));

    this.composite = new CompositeEffect({
      preAO: copy.texture,
      ink: this.ink.texture,
      inkDepth: this.ink.depthTexture,
      paper: palette.paper,
      inkColor: palette.ink,
    });
    this.roll = new PaperRollEffect();
    if (this.flags.get('comp') !== '0') composer.addPass(new EffectPass(camera, this.composite, this.roll));
    if (this.flags.get('smaa') !== '0') composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: this.quality.smaa })));
    this.composer = composer;
  }

  /** Desliga o AO (true se havia o que desligar). */
  disableAO(): boolean {
    if (!this.ao?.enabled) return false;
    this.ao.enabled = false;
    return true;
  }

  get gpuName() {
    const gl = this.gl.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  }

  /** Renderizadores por software (sem GPU de verdade). */
  get isSoftware() {
    return /swiftshader|llvmpipe|software/i.test(this.gpuName);
  }

  resize(w: number, h: number) {
    const { dpr, pixels } = this.quality;
    // teto de DPR e orçamento de pixels (telas 4K/retina não multiplicam o custo sem limite)
    const budget = Math.sqrt(pixels / Math.max(1, w * h));
    this.dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, dpr, budget) * this.scale);
    this.width = w;
    this.height = h;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.composite.set('uLine', Math.max(1, Math.round(this.dpr)));
    this.invalidatePaper();
  }

  render(dt: number) {
    if (this.plain) {
      this.gl.setRenderTarget(null);
      this.gl.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  /** Copia o quadro atual (já na tela) para a textura do papel. */
  capturePaper() {
    const w = this.gl.domElement.width;
    const h = this.gl.domElement.height;
    if (!this.paperTex || this.paperTex.image.width !== w || this.paperTex.image.height !== h) {
      this.paperTex?.dispose();
      this.paperTex = new FramebufferTexture(w, h);
    }
    this.gl.setRenderTarget(null);
    this.gl.copyFramebufferToTexture(this.paperTex, new Vector2(0, 0));
    this.roll.setPaper(this.paperTex);
  }

  invalidatePaper() {
    this.roll.setPaper(null);
  }

  get hasPaper() {
    return (this.roll.uniforms.get('uHasPaper')!.value as number) > 0.5;
  }
}
