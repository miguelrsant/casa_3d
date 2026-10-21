import GUI from 'lil-gui';
import Stats from 'stats-gl';
import type Lenis from 'lenis';
import type { Renderer } from '../render/renderer';
import type { UIRefs } from '../ui/dom';
import { stops } from '../story/stops';

interface DebugDeps {
  renderer: Renderer;
  lenis: Lenis;
  ui: UIRefs;
  setT: (t: number | null) => void;
}

/** Painel de desenvolvimento: controle de t, passes, tone mapping e estatísticas. */
export function createDebug({ renderer, lenis, ui, setT }: DebugDeps) {
  const gui = new GUI({ title: 'casa_3d · debug' });
  gui.close();
  const p = {
    controlarT: false,
    t: 0,
    slot: false,
    toneMap: 'AgX',
    traço: 0.92,
    grão: 1,
    bloom: renderer.bloom.intensity,
    irPara: 'hero',
  };
  gui.add(p, 'controlarT').name('controlar t').onChange((v: boolean) => setT(v ? p.t : null));
  gui
    .add(p, 't', 0, 1, 0.0005)
    .listen()
    .onChange((v: number) => {
      if (p.controlarT) setT(v);
    });
  const jumps: Record<string, number> = { hero: 0 };
  for (const st of stops) jumps[`${st.index} ${st.title}`] = (st.dwell[0] + st.dwell[1]) / 2;
  jumps['aérea'] = 0.89;
  jumps['papel'] = 0.93;
  gui.add(p, 'irPara', Object.keys(jumps)).name('ir para').onChange((k: string) => {
    p.t = jumps[k];
    if (p.controlarT) setT(p.t);
    else lenis.scrollTo(p.t * lenis.limit, { immediate: true, force: true });
  });
  gui.add(p, 'slot').name('mostrar slot').onChange((v: boolean) => ui.slot.toggleAttribute('data-debug', v));
  gui.add(p, 'toneMap', ['AgX', 'ACES', 'Neutral']).onChange((v: string) => renderer.composite.set('uToneMap', ['AgX', 'ACES', 'Neutral'].indexOf(v)));
  gui.add(p, 'traço', 0, 1, 0.01).onChange((v: number) => renderer.composite.set('uInkStrength', v));
  gui.add(p, 'grão', 0, 2, 0.01).onChange((v: number) => renderer.composite.set('uGrain', v));
  gui.add(p, 'bloom', 0, 3, 0.01).onChange((v: number) => (renderer.bloom.intensity = v));

  const stats = new Stats({ trackGPU: false, horizontal: true });
  stats.dom.style.cssText += ';position:fixed;left:auto;right:0;top:auto;bottom:40px;z-index:20';
  document.body.append(stats.dom);
  void stats.init(renderer.gl);

  return {
    update() {
      if (!p.controlarT) p.t = lenis.progress;
      stats.update();
    },
  };
}
