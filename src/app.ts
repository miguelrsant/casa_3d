import { Color, FogExp2, Group, MathUtils, PerspectiveCamera, PlaneGeometry, Scene, Vector2, Vector3 } from 'three';
import Lenis from 'lenis';
import { copy } from './content/copy.pt-BR';
import { drive, house } from './data/house';
import { zoneIndex } from './data/schema';
import { buildZoneMap, RV } from './render/zones';
import { Renderer, detectTier } from './render/renderer';
import { bakeTextures } from './render/materials/textures';
import { initLibrary, miscMaterial, nightFloors } from './render/materials/library';
import { buildArchitecture } from './gen/architecture';
import { buildAnnotations } from './gen/annotations';
import { furnish, glowMaterials } from './gen/furniture';
import { createFire } from './gen/fire';
import { createWaterfall } from './gen/waterfall';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { buildVegetation, forestPlan, setVegetationDetail, symbolRadius, vegUniforms } from './gen/vegetation';
import { buildLandscape } from './gen/landscape';
import { SkySystem } from './gen/sky';
import { LightRig } from './render/lightRig';
import { stateAt, type HeroPose, type Pose, type SceneState } from './story/stateAt';
import { doorKeys, sunKeys } from './story/stops';
import { buildStory, buildUI, drawScaleBar } from './ui/dom';
import { Hud } from './ui/hud';
import { FileModal } from './ui/fileModal';

/** Extensão da prancha no hero (casa + cotas + eixos), em metros. */
const PLAN = { x0: -8.6, x1: 45.2, z0: -18.6, z1: 30.2 };
const SCROLL_VH = 2600;

/**
 * Carregamento de 0 a 100%. As etapas reais chegam aos saltos (e a compilação dos shaders demora),
 * então o número anda suave até a etapa e segue avançando devagar enquanto ela não termina.
 */
const loader = {
  el: document.getElementById('loader')!,
  pct: document.getElementById('loader-pct')!,
  stage: document.getElementById('loader-stage')!,
  target: 0,
  shown: 0,
  finishing: false,
  raf: 0,
  last: performance.now(),
  set(p: number, stage?: string) {
    this.target = Math.max(this.target, Math.min(1, p));
    if (stage && this.stage.textContent !== stage) {
      this.stage.textContent = stage;
      // reinicia o fade da etapa
      this.stage.style.animation = 'none';
      void this.stage.offsetWidth;
      this.stage.style.animation = '';
    }
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.tick(t));
  },
  tick(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // anda até a etapa atual e, enquanto ela não termina, avança devagar (no máximo 6 pontos além)
    if (this.shown < this.target - 0.004) this.shown += (this.target - this.shown) * (1 - Math.exp(-dt * (this.finishing ? 9 : 4)));
    else if (!this.finishing) this.shown += (Math.min(this.target + 0.06, 0.99) - this.shown) * (1 - Math.exp(-dt * 0.35));
    else this.shown = 1;
    if (this.shown > 0.9995) this.shown = 1;
    const v = this.shown;
    this.el.style.setProperty('--p', v.toFixed(4));
    const n = String(Math.floor(v * 100));
    if (this.pct.textContent !== n) {
      this.pct.textContent = n;
      this.el.setAttribute('aria-valuenow', n);
    }
    if (this.finishing && v >= 1) {
      this.raf = 0;
      this.hide();
      return;
    }
    this.raf = requestAnimationFrame((t) => this.tick(t));
  },
  done() {
    this.set(1, copy.loader.stages.ready);
    this.finishing = true;
  },
  hide() {
    this.el.classList.add('is-done');
    document.body.classList.remove('is-loading');
    setTimeout(() => this.el.remove(), 900);
  },
};
const frame = () => new Promise((r) => requestAnimationFrame(r));

/** Sem 3D: mostra a planta estática no lugar do canvas (mantém textos e CTA). */
/** Recarregamentos automáticos quando a GPU derruba o 3D (drivers instáveis costumam falhar de forma aleatória). */
const RETRY_KEY = 'casa3d:retries';
const RESUME_KEY = 'casa3d:resume';
const MAX_RETRIES = 2;
const store = {
  get(k: string) {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null) {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* sem armazenamento: só não há nova tentativa automática */
    }
  },
};

function showStaticFallback(message: string, retry = false) {
  const canvas = document.getElementById('scene');
  if (canvas) canvas.style.display = 'none';
  const slot = document.querySelector<HTMLElement>('[data-plan-slot]');
  document.getElementById('story')?.style.setProperty('height', '100vh');
  const img = Object.assign(document.createElement('img'), { src: '/fallback/planta.png', alt: 'Planta baixa da Casa Brisa' });
  img.className = 'fallback-plan';
  (slot ?? document.body).append(img);
  const note = Object.assign(document.createElement('div'), { className: 'fallback-note', textContent: message });
  if (retry) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'fallback-retry', textContent: copy.retry3d });
    btn.addEventListener('click', () => {
      store.set(RETRY_KEY, null);
      location.reload();
    });
    note.append(btn);
  }
  document.getElementById('ui')?.append(note);
}

function webgl2Available() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export async function startApp() {
  document.getElementById('loader-label')!.textContent = copy.loader.label;
  if (!webgl2Available()) {
    loader.done();
    buildUI();
    showStaticFallback(copy.noWebgl);
    return;
  }

  const ui = buildUI();
  buildStory(SCROLL_VH);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  /**
   * Tamanho de desenho = tamanho do canvas no CSS (100lvh): no celular, a barra de endereço aparece e some
   * a cada rolagem e mudaria innerHeight; redimensionar o pós-processamento a cada vez travava o scroll.
   */
  const view = { w: 1, h: 1 };
  const measure = () => {
    view.w = canvas.clientWidth || innerWidth;
    view.h = canvas.clientHeight || innerHeight;
  };
  measure();
  const scene = new Scene();
  // névoa atmosférica (sempre presente: ligar/desligar recompilaria os shaders)
  const fog = new FogExp2(0xc9d6df, 0.0032);
  scene.fog = fog;
  const fogDay = new Color('#c9d6df');
  const fogGold = new Color('#d8d2c2');
  const fogDusk = new Color('#1d2233');
  const camera = new PerspectiveCamera(50, view.w / view.h, 0.05, 600);
  const tier = detectTier();

  const renderer = new Renderer(canvas, scene, camera, tier);
  const quality = renderer.quality;
  renderer.resize(view.w, view.h);
  loader.set(0.06, copy.loader.stages.textures);
  await frame();
  // texturas procedurais (assadas na GPU) antes de criar os materiais
  initLibrary(await bakeTextures(renderer.gl, quality.tex, (p) => loader.set(0.06 + 0.14 * p)));
  loader.set(0.2, copy.loader.stages.architecture);
  await frame();

  buildZoneMap(house);
  const arch = buildArchitecture(house);
  scene.add(arch.root, arch.ground);
  const doorById = new Map(arch.doors.map((d) => [d.id, d]));
  const furn = furnish();
  arch.root.add(furn.root);
  const fire = createFire(29, -0.45 + 0.38, -7);
  scene.add(fire.mesh);
  const fall = createWaterfall(14.6, 17.4, -9.0, 2.05, -0.08);
  scene.add(...fall.meshes);
  // espelho do banho: reflexo real, ligado só quando a câmera está no banho
  const mirror = new Reflector(new PlaneGeometry(2.22, 0.97), {
    clipBias: 0.003,
    textureWidth: Math.round(view.w * quality.mirror),
    textureHeight: Math.round(view.h * quality.mirror),
    color: 0xb9bdbd,
    multisample: 0,
  });
  mirror.position.set(30.2, 1.15 + 0.03 + 0.505, 13.84);
  mirror.rotation.y = Math.PI;
  mirror.visible = false;
  scene.add(mirror);
  const bath = house.rooms.find((r) => r.id === 'banho')!.rect;
  const poolWater = miscMaterial('poolWater');
  loader.set(0.34, copy.loader.stages.landscape);
  await frame();

  const vegGroup = new Group();
  vegGroup.name = 'vegetation';
  scene.add(vegGroup);
  setVegetationDetail(quality.veg);
  // mata em volta do lote (deixa o corredor da rua de acesso livre)
  const forest = forestPlan(house.site, [drive.street.x0 - 2.5, drive.street.x1 + 2.5]).filter((_, i) => ((i * 0.6180339) % 1) < quality.forestTrees);
  const veg = buildVegetation(house, vegGroup, forest);
  const landGroup = new Group();
  landGroup.name = 'landscape';
  scene.add(landGroup);
  const land = buildLandscape(landGroup, house.site, { forest: quality.forest, cell: quality.terrainCell });
  const notes = buildAnnotations(
    house,
    veg.plants.map((p) => ({ species: p.species, x: p.x, z: p.z, r: symbolRadius(p) })),
  );
  scene.add(notes.group);
  const sky = new SkySystem(scene, quality.shadow);
  const lights = new LightRig(scene, house, quality.roomLights, quality.poolLights);
  let dtFrame = 0;
  const params = new URLSearchParams(location.search);
  const tmName = params.get('tm') ?? 'aces';
  renderer.composite.set('uToneMap', Math.max(0, ['agx', 'aces', 'neutral'].indexOf(tmName)));
  const expBias = Number(params.get('exp') ?? 1);
  loader.set(0.45, copy.loader.stages.light);
  await frame();

  sky.precompute(renderer.gl, sunKeys.filter((k, i) => sunKeys.findIndex((o) => o.el === k.el) === i).map((k) => ({ az: k.az, el: k.el })), quality.env);
  scene.environment = sky.envFor(32);
  loader.set(0.62);
  await notes.sync();
  loader.set(0.75, copy.loader.stages.compile);

  // enquadramento do hero a partir do slot da planta no DOM
  const hero: HeroPose & { slot: DOMRect; aerial: Pose } = {
    pos: new Vector3(),
    target: new Vector3(),
    fov: 12,
    slot: new DOMRect(),
    aerial: { pos: new Vector3(), target: new Vector3(), fov: 30 },
  };
  const computeHero = () => {
    const r = ui.slot.getBoundingClientRect();
    hero.slot = r;
    const aspect = r.width / Math.max(1, r.height);
    const w = PLAN.x1 - PLAN.x0;
    const d = PLAN.z1 - PLAN.z0;
    const halfH = Math.max(d, w / aspect) * 0.5 * 1.02;
    const dist = halfH / Math.tan(MathUtils.degToRad(hero.fov / 2));
    const cx = (PLAN.x0 + PLAN.x1) / 2;
    const cz = (PLAN.z0 + PLAN.z1) / 2;
    hero.pos.set(cx, dist, cz);
    hero.target.set(cx, 0, cz);
    drawScaleBar(ui.scaleBar, r.height / (halfH * 2));

    // vista aérea do fim: o lote inteiro (com o acesso) centralizado na tela cheia, com folga para o HUD
    const site = house.site;
    const a = hero.aerial;
    const sw = site.x1 - site.x0;
    const sd = site.z1 - site.z0;
    const aspectFull = view.w / Math.max(1, view.h);
    const compact = view.w < 760;
    const padY = compact ? 0.15 : 0.13;
    const padX = compact ? 0.03 : 0.17;
    const aHalf = Math.max(sd / 2 / (1 - 2 * padY), sw / 2 / aspectFull / (1 - 2 * padX));
    const aDist = aHalf / Math.tan(MathUtils.degToRad(a.fov / 2));
    a.pos.set((site.x0 + site.x1) / 2, aDist, (site.z0 + site.z1) / 2);
    a.target.set(a.pos.x, 0, a.pos.z);
  };

  let drawn = { w: 0, h: 0, scale: 0 };
  const resize = () => {
    measure();
    if (view.w !== drawn.w || view.h !== drawn.h || renderer.scale !== drawn.scale) {
      renderer.resize(view.w, view.h);
      notes.setResolution(view.w * renderer.dpr, view.h * renderer.dpr);
      drawn = { w: view.w, h: view.h, scale: renderer.scale };
    }
    computeHero();
  };
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));

  const lastSun = new Vector3();
  const lastCenter = new Vector3(1e9, 0, 0);
  let lastRadius = 0;
  const center = new Vector3();
  const tmp = new Vector3();

  // estado inicial + pré-compilação dos shaders (evita travadas no meio do scroll)
  const state: SceneState = stateAt(0, hero);
  applyState(state);
  // o shadow map precisa existir antes do primeiro quadro (sampler2DShadow sem textura gera erro de GL)
  renderer.gl.shadowMap.needsUpdate = true;
  await precompile();
  renderer.render(0);
  loader.set(1);

  /**
   * Compila de uma vez os shaders de tudo que aparece ao longo do percurso (inclusive o que ainda está
   * escondido), na variante usada de fato: a cena é desenhada num alvo do pós-processamento (cor linear),
   * não direto na tela. Assim não há compilação (e travada) no meio do scroll.
   */
  async function precompile() {
    const hidden: { visible: boolean }[] = [];
    scene.traverse((o) => {
      if (!o.visible) {
        o.visible = true;
        hidden.push(o);
      }
    });
    const prev = renderer.gl.getRenderTarget();
    renderer.gl.setRenderTarget(renderer.composer.inputBuffer);
    await renderer.gl.compileAsync(scene, camera);
    renderer.gl.setRenderTarget(prev);
    for (const o of hidden) o.visible = false;
  }

  // --- scroll ---
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lenis = new Lenis({ lerp: reduced ? 1 : 0.085, wheelMultiplier: 0.85, smoothWheel: !reduced });
  const modal = new FileModal({ onOpen: () => lenis.stop(), onClose: () => lenis.start() });
  const hud = new Hud(ui, {
    onJump: (t) => jumpTo(t),
    onOpenFile: (i) => modal.open(i),
  });
  // volta ao ponto do percurso depois de um recarregamento automático
  const resume = Number(store.get(RESUME_KEY));
  store.set(RESUME_KEY, null);
  const qt = Number(new URLSearchParams(location.search).get('t')) || resume;
  if (qt > 0) lenis.scrollTo(qt * lenis.limit, { immediate: true, force: true });

  // --- pulo pela régua ---
  // Para o próximo ambiente, a câmera segue o percurso. Para trás ou para longe, rolar o percurso inteiro
  // em 2 s passava por todas as cenas (e desfazia as revelações) num borrão: aí o último quadro
  // congela sobre a tela, a cena salta para o destino e o quadro antigo se dissolve por cima.
  const veil = Object.assign(document.createElement('canvas'), { id: 'jump-veil' });
  veil.setAttribute('aria-hidden', 'true');
  canvas.after(veil);
  let pendingJump: number | null = null;
  const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function jumpTo(t: number) {
    const now = lenis.progress || 0;
    const d = t - now;
    if (Math.abs(d) < 0.004) return;
    if (reduced) {
      lenis.scrollTo(t * lenis.limit, { immediate: true, force: true });
      return;
    }
    if (d > 0 && d < 0.12) {
      lenis.scrollTo(t * lenis.limit, { duration: 1.2 + d * 10, easing: easeInOutCubic, force: true });
      return;
    }
    pendingJump = t;
  }
  /** Chamado logo depois de desenhar o quadro (o buffer do WebGL ainda está intacto). */
  function runPendingJump() {
    if (pendingJump === null) return;
    const t = pendingJump;
    pendingJump = null;
    veil.width = canvas.width;
    veil.height = canvas.height;
    veil.getContext('2d')?.drawImage(canvas, 0, 0);
    veil.classList.remove('is-fading');
    veil.style.cssText = 'opacity:1;visibility:visible;transform:none';
    lenis.scrollTo(t * lenis.limit, { immediate: true, force: true });
    // dois quadros: o primeiro desenha a cena nova por baixo, o segundo começa a dissolver
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        veil.style.cssText = '';
        veil.classList.add('is-fading');
      }),
    );
  }

  // --- loop ---
  let last = performance.now();
  let tOverride: number | null = null;
  /** Câmera livre (diagnóstico e captura de vídeo): substitui a pose do percurso, mantendo o resto do estado. */
  let poseOverride: { pos: number[]; target: number[]; fov?: number } | null = null;

  function applyState(s: SceneState) {
    // câmera (com o deslocamento do enquadramento do hero)
    camera.position.copy(s.pos);
    camera.up.copy(s.up);
    camera.lookAt(s.target);
    camera.fov = s.fov;
    const W = view.w;
    const H = view.h;
    const k = s.hero;
    const fullW = MathUtils.lerp(W, hero.slot.width, k);
    const fullH = MathUtils.lerp(H, hero.slot.height, k);
    camera.aspect = fullW / fullH;
    camera.setViewOffset(fullW, fullH, -hero.slot.left * k, -hero.slot.top * k, W, H);
    camera.near = MathUtils.clamp((s.pos.y - 9) * 0.4, 0.05, 160);
    camera.far = Math.max(420, s.pos.y * 1.6 + 220);
    camera.updateProjectionMatrix();

    // casa
    arch.root.scale.y = s.extrude;
    arch.pivot.rotation.y = s.pivot * MathUtils.degToRad(84);
    for (let n = 0; n < doorKeys.length; n++) doorById.get(doorKeys[n].id)?.set(s.doors[n]);
    for (const c of arch.ceilings) {
      const vis = s.pos.y < c.y * s.extrude - 0.04;
      for (const m of c.meshes) m.visible = vis;
    }
    for (const sl of arch.slats) {
      const vis = s.pos.y < sl.y * s.extrude - 0.04 && s.reveal[sl.zone] > 0.5;
      for (const m of sl.meshes) m.visible = vis;
    }
    lights.update(s, dtFrame);
    for (const g of glowMaterials) g.mat.emissiveIntensity = MathUtils.lerp(g.day, g.night, s.night);
    for (const f of furn.fans) f.rotation.y += dtFrame * 2.2;
    fire.mat.uniforms.uTime.value += dtFrame;
    fire.mat.uniforms.uIntensity.value = MathUtils.smoothstep(s.reveal[zoneIndex('lounge')], 0.4, 0.9) * (0.35 + 0.65 * s.night);
    fire.mesh.visible = fire.mat.uniforms.uIntensity.value > 0.01;
    poolWater.emissiveIntensity = 0.9 * s.night * s.reveal[zoneIndex('piscina')];
    for (const f of nightFloors) f.emissiveIntensity = 0.09 * s.night * (s.pos.y > 6 ? 1 : 0.35);
    veg.update(s.reveal, dtFrame, s.pos);
    fall.update(dtFrame, MathUtils.smoothstep(s.reveal[zoneIndex('piscina')], 0.5, 0.9), s.night);
    mirror.visible =
      s.reveal[zoneIndex('banho')] > 0.6 &&
      s.pos.x > bath.x0 - 0.5 && s.pos.x < bath.x1 + 0.5 && s.pos.z > bath.z0 - 1.2 && s.pos.z < bath.z1 + 0.5;
    land.update(s.reveal[zoneIndex('site')]);
    vegUniforms.uSunDir.value.copy(sky.direction);
    vegUniforms.uSunColor.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * 0.25);
    RV.rvReveal.value.set(s.reveal);
    notes.update(s.reveal, s.siteFade);

    // luz
    tmp.subVectors(s.target, s.pos).setY(0);
    if (tmp.lengthSq() > 1e-6) tmp.normalize();
    center.copy(s.pos).addScaledVector(tmp, 9).setY(0);
    // a sombra cobre o ambiente à altura dos olhos e o lote inteiro na vista aérea
    const shadowR = 26 + 30 * MathUtils.smoothstep(s.pos.y, 25, 140);
    sky.update(s.sunAz, s.sunEl, center, shadowR);
    const env = sky.envFor(s.sunEl);
    if (env && scene.environment !== env) scene.environment = env;
    if (sky.direction.distanceToSquared(lastSun) > quality.shadowTurn || center.distanceToSquared(lastCenter) > quality.shadowMove || Math.abs(shadowR - lastRadius) > 0.5 || (s.pivot > 0 && s.pivot < 1)) {
      if (s.sky > 0.01) renderer.gl.shadowMap.needsUpdate = true; // não cancela uma atualização pendente
      lastSun.copy(sky.direction);
      lastCenter.copy(center);
      lastRadius = shadowR;
    }
    fog.color.copy(fogDusk).lerp(fogGold, MathUtils.smoothstep(s.sunEl, -1, 6)).lerp(fogDay, MathUtils.smoothstep(s.sunEl, 8, 24));
    fog.density = 0.0032 * (1 - MathUtils.smoothstep(s.pos.y, 12, 60));
    renderer.composite.set('uSkyReveal', s.sky);
    scene.environmentIntensity = (0.2 + 0.42 * MathUtils.smoothstep(s.sunEl, -4, 12)) * lights.envFactor;
    // o traço distante esmaece na tela cheia; no hero não. A troca é contínua (antes virava de uma vez no meio da descida)
    const hk = MathUtils.smoothstep(s.hero, 0.15, 0.85);
    (renderer.composite.uniforms.get('uInkFade')!.value as Vector2).set(16 * Math.pow(1e4 / 16, hk), 46 * Math.pow(2e4 / 46, hk));
    renderer.composite.set('uExposure', s.exposure * expBias);
    renderer.ink.active = s.reveal.some((v, i) => i < 22 && v < 0.999) || s.t < 0.15;
  }

  // o papel do final é um "print" do desenho com a câmera do hero (capturado quando necessário)
  const paperState: SceneState = stateAt(1, hero);
  function ensurePaper(t: number) {
    if (t < 0.86 || renderer.hasPaper) return;
    stateAt(1, hero, paperState);
    applyState(paperState);
    renderer.roll.roll = 0;
    renderer.render(0);
    renderer.capturePaper();
  }

  function loop(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    dtFrame = dt;
    last = now;
    lenis.raf(now);
    const t = tOverride ?? lenis.progress;
    ensurePaper(Number.isFinite(t) ? t : 0);
    stateAt(Number.isFinite(t) ? t : 0, hero, state);
    if (poseOverride) {
      state.pos.fromArray(poseOverride.pos);
      state.target.fromArray(poseOverride.target);
      state.fov = poseOverride.fov ?? state.fov;
      state.hero = 0;
      state.up.set(0, 1, 0);
    }
    applyState(state);
    renderer.roll.roll = state.roll < 1 ? state.roll : 0;
    hud.update(state, camera, view.w, view.h);
    renderer.render(dt);
    runPendingJump();
    probe(dt);
    debug?.update();
    if (alive) requestAnimationFrame(loop);
  }

  // painel de debug (só em desenvolvimento)
  let debug: { update(): void } | null = null;
  if (import.meta.env.DEV) {
    const mod = await import('./debug/gui');
    debug = mod.createDebug({
      renderer,
      lenis,
      ui,
      setT: (t) => (tOverride = t),
    });
  }

  // robustez: contexto perdido (drivers instáveis) → planta estática
  let alive = true;
  // robustez: contexto perdido (drivers instáveis) → recarrega e tenta de novo; depois disso, planta estática
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    const retries = Number(store.get(RETRY_KEY) ?? 0);
    if (retries < MAX_RETRIES) {
      store.set(RETRY_KEY, String(retries + 1));
      store.set(RESUME_KEY, String(lenis.progress || 0));
      location.reload();
      return;
    }
    // sem o 3D não há percurso para rolar: devolve o scroll nativo à página
    lenis.destroy();
    showStaticFallback(copy.contextLost, true);
  });
  // rodou bem por um tempo: zera as tentativas (uma queda futura volta a recarregar)
  setTimeout(() => alive && store.set(RETRY_KEY, null), 30000);

  // GPU lenta: mede o tempo de quadro o tempo todo e reduz a qualidade em degraus quando não acompanha.
  // Ordem: AO → sombra menor → resolução dinâmica. Nada aqui recompila shaders.
  const forcedTier = params.has('q');
  const steps: (() => boolean)[] = [
    () => renderer.disableAO(),
    () => {
      if (!sky.halveShadow()) return false;
      renderer.gl.shadowMap.needsUpdate = true;
      return true;
    },
    () => setScale(0.85),
    () => setScale(0.72),
    () => setScale(0.6),
  ];
  function setScale(k: number) {
    if (renderer.scale <= k) return false;
    renderer.scale = k;
    resize();
    return true;
  }
  function degrade() {
    while (steps.length) if (steps.shift()!()) return true;
    return false;
  }
  let probeFrames = -10; // ignora os primeiros quadros (uploads e aquecimento)
  let probeTime = 0;
  const probe = (dt: number) => {
    if (forcedTier || !steps.length) return;
    if (document.hidden) return; // aba em segundo plano não conta
    if (++probeFrames <= 0) return;
    probeTime += dt;
    if (probeFrames < 60 && !(probeFrames >= 8 && probeTime > 1.5)) return; // ~60 quadros ou 1,5 s
    if (probeTime / probeFrames > 0.038) degrade(); // abaixo de ~26 fps
    probeFrames = -8; // espera o efeito do degrau antes de medir de novo
    probeTime = 0;
  };
  if (renderer.isSoftware && !forcedTier) degrade();

  loader.done();
  requestAnimationFrame(loop);
  Object.assign(window, { __casa: { state, scene, camera, renderer, lenis, setT: (t: number | null) => (tOverride = t), setPose: (p: typeof poseOverride) => (poseOverride = p) } });
}
