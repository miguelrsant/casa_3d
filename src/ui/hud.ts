import { Vector3, type PerspectiveCamera } from 'three';
import { gsap } from 'gsap';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { brand } from '../content/brand';
import { copy } from '../content/copy.pt-BR';
import { house } from '../data/house';
import { stops } from '../story/stops';
import { counterAt, type SceneState } from '../story/stateAt';
import { fmt, fmtArea } from '../gen/annotations';
import { h, type UIRefs } from './dom';

gsap.registerPlugin(ScrambleTextPlugin);

const pad = (n: number) => String(n).padStart(2, '0');
const TOTAL = stops.filter((s) => s.index > 0).length;

/** Medidas do ambiente principal de uma parada, no formato do callout. */
export function specsFor(stopIdx: number): string {
  const st = stops[stopIdx];
  const room = house.rooms.find((r) => r.id === st.room);
  const out = house.outdoor.find((o) => o.id === st.room);
  const rect = room?.rect ?? out?.rect;
  const parts: string[] = [];
  if (rect) {
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    parts.push(`${fmt(w)} × ${fmt(d)} M`, `${fmtArea(w * d)} M²`);
  }
  if (room) parts.push(`PÉ-DIREITO ${fmt(room.ceiling)}`);
  else if (out?.roof) parts.push(`COBERTURA ${fmt(out.roof)}`);
  if (st.extra) parts.push(st.extra);
  parts.push(copy.hud.openFile);
  return parts.join('  ·  ');
}

export function titleLines(title: string): string {
  const w = title.split(' ');
  if (w.length <= 2) return w.join('\n');
  const mid = Math.ceil(w.length / 2);
  return `${w.slice(0, mid).join(' ')}\n${w.slice(mid).join(' ')}`;
}

const AERIAL = [
  { id: 'piscina', name: 'Piscina' },
  { id: 'estar', name: 'Estar' },
  { id: 'jantar', name: 'Jantar' },
  { id: 'cozinha', name: 'Cozinha' },
  { id: 'varanda', name: 'Varanda' },
  { id: 'pergolado', name: 'Pergolado' },
  { id: 'suite', name: 'Suíte' },
  { id: 'banho', name: 'Banho' },
  { id: 'closet', name: 'Closet' },
  { id: 'quarto2', name: 'Quarto 2' },
  { id: 'quarto3', name: 'Quarto 3' },
  { id: 'hall', name: 'Hall' },
  { id: 'garagem', name: 'Garagem' },
  { id: 'lounge', name: 'Lounge do fogo' },
  { id: 'jardimInterno', name: 'Jardim interno' },
  { id: 'adega', name: 'Adega' },
];

export class Hud {
  private lastStop = -2;
  private lastCounter = -1;
  private calloutTl: gsap.core.Timeline | null = null;
  private v = new Vector3();
  private aerialEls: { el: HTMLElement; p: Vector3 }[] = [];
  private brandSpan: HTMLElement | null;
  /** Telas estreitas: o callout fica fixo no rodapé (seguir o marcador o empurrava para fora da tela). */
  private compact = matchMedia('(max-width: 760px)');
  private touch = matchMedia('(pointer: coarse)');

  constructor(
    private ui: UIRefs,
    opts: { onJump: (t: number) => void; onOpenFile: (stop: number) => void },
  ) {
    ui.rulerButtons.forEach((b) => b.addEventListener('click', () => opts.onJump(Number(b.dataset.t))));
    ui.marker.addEventListener('click', () => {
      if (this.lastStop >= 0) opts.onOpenFile(this.lastStop);
    });
    this.brandSpan = ui.root.querySelector('[data-scramble]');
    for (const a of AERIAL) {
      const room = house.rooms.find((r) => r.id === a.id);
      const out = house.outdoor.find((o) => o.id === a.id);
      const r = room?.rect ?? out?.rect;
      if (!r) continue;
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const el = h('div', { class: 'aerial-label' }, a.name, h('small', {}, `${w.toFixed(1).replace('.', ',')} × ${d.toFixed(1).replace('.', ',')} m`));
      ui.aerial.append(el);
      this.aerialEls.push({ el, p: new Vector3((r.x0 + r.x1) / 2, 0.4, (r.z0 + r.z1) / 2) });
    }
  }

  private playCallout(stopIdx: number) {
    const st = stops[stopIdx];
    const { calloutKicker, calloutTitle, calloutSpecs, calloutLines } = this.ui;
    this.calloutTl?.kill();
    calloutSpecs.textContent = specsFor(stopIdx);
    calloutTitle.style.whiteSpace = 'pre-line';
    const tl = gsap.timeline();
    tl.fromTo(calloutLines[0], { scaleY: 0 }, { scaleY: 1, duration: 0.55, ease: 'power3.out' })
      .fromTo(calloutLines[1], { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.out' }, '<0.08')
      .to(calloutKicker, { duration: 0.5, scrambleText: { text: `${copy.hud.stopKicker} ${pad(st.index)}`, chars: '0123456789', speed: 0.7 } }, '<0.1')
      .to(calloutTitle, { duration: 0.85, scrambleText: { text: titleLines(st.title), chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', speed: 0.55, revealDelay: 0.1 } }, '<0.05')
      .fromTo(calloutSpecs, { opacity: 0, y: 4 }, { opacity: 0.85, y: 0, duration: 0.5 }, '<0.35');
    this.calloutTl = tl;
  }

  private scrambleBrand() {
    if (!this.brandSpan) return;
    // o alvo é sempre o nome da marca (ler o textContent no meio de outro scramble gravava as letras embaralhadas)
    gsap.to(this.brandSpan, { duration: 0.7, overwrite: true, scrambleText: { text: brand.wordmark, chars: 'upperCase', speed: 0.8 } });
  }

  update(s: SceneState, camera: PerspectiveCamera, w: number, hgt: number) {
    const { ui } = this;
    ui.hero.style.opacity = String(s.heroText);
    ui.hero.style.visibility = s.heroText < 0.01 ? 'hidden' : 'visible';
    ui.final.style.opacity = String(s.cta);
    ui.final.style.visibility = s.cta < 0.01 ? 'hidden' : 'visible';
    ui.root.classList.toggle('is-light', s.hudLight);

    // contador e régua
    const c = counterAt(s.t);
    if (c !== this.lastCounter) {
      ui.counter.innerHTML = `<b>${pad(c)}</b> / ${pad(TOTAL)} ${copy.hud.counterLabel}`;
      if (this.lastCounter >= 0) this.scrambleBrand();
      this.lastCounter = c;
    }
    ui.ruler.style.setProperty('--p', s.t.toFixed(4));
    ui.rulerButtons.forEach((b, i) => b.classList.toggle('is-current', i + 1 === c));

    // dica inferior
    let hint: string = copy.hints.next;
    if (s.t < 0.125) hint = copy.hints.enter;
    else if (s.callout > 0.5) hint = this.touch.matches ? copy.hints.markerTouch : copy.hints.marker;
    else if (s.t > 0.86 && s.t < 0.955) hint = copy.hints.aerial;
    else if (s.t >= 0.955) hint = copy.hints.end;
    if (ui.hint.textContent !== hint) ui.hint.textContent = hint;
    ui.hint.style.opacity = s.t > 0.9 ? String(Math.max(0, 1 - s.roll * 1.5)) : '1';

    // callout
    if (s.stop !== this.lastStop) {
      this.lastStop = s.stop;
      if (s.stop >= 0 && stops[s.stop].index > 0) this.playCallout(s.stop);
    }
    if (s.stop >= 0 && s.callout > 0.001 && this.compact.matches) {
      ui.callout.style.transform = '';
      ui.callout.style.opacity = String(s.callout);
      ui.callout.style.pointerEvents = s.callout > 0.6 ? 'auto' : 'none';
    } else if (s.stop >= 0 && s.callout > 0.001) {
      const m = stops[s.stop].marker;
      this.v.set(m[0], m[1], m[2]).project(camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      const x = Math.min(w - 380, Math.max(70, (this.v.x * 0.5 + 0.5) * w - 17));
      const y = Math.min(hgt - 200, Math.max(80, (-this.v.y * 0.5 + 0.5) * hgt - 25));
      ui.callout.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      ui.callout.style.opacity = String(visible ? s.callout : 0);
      ui.callout.style.pointerEvents = visible && s.callout > 0.6 ? 'auto' : 'none';
    } else {
      ui.callout.style.opacity = '0';
      ui.callout.style.pointerEvents = 'none';
    }

    // rótulos da vista aérea (homenagem à imagem de referência)
    const a = s.aerialLabels;
    ui.aerial.style.visibility = a > 0.01 ? 'visible' : 'hidden';
    if (a > 0.01) {
      for (const { el, p } of this.aerialEls) {
        this.v.copy(p).project(camera);
        el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * hgt).toFixed(1)}px) translate(-50%, -50%)`;
        el.style.opacity = String(a);
      }
    }
  }
}
