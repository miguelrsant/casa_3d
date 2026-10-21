import { copy } from '../content/copy.pt-BR';
import { house } from '../data/house';
import { stops } from '../story/stops';
import { fmt, fmtArea } from '../gen/annotations';
import { h, s } from './dom';
import { titleLines } from './hud';

/** Mini-planta em SVG com o ambiente destacado. */
function miniPlan(highlight: string[]) {
  const pad = 1.5;
  const x0 = -1 - pad;
  const z0 = -11 - pad;
  const W = 42 + pad * 2;
  const D = 37 + pad * 2;
  const svg = s('svg', { viewBox: `${x0} ${z0} ${W} ${D}`, role: 'img', 'aria-label': 'Planta com o ambiente destacado' });
  const draw = (r: { x0: number; z0: number; x1: number; z1: number }, on: boolean, weight = 0.12) =>
    svg.append(
      s('rect', {
        x: r.x0,
        y: r.z0,
        width: r.x1 - r.x0,
        height: r.z1 - r.z0,
        fill: on ? 'rgba(226,81,42,0.28)' : 'none',
        stroke: on ? '#E2512A' : '#262522',
        'stroke-width': on ? 0.22 : weight,
      }),
    );
  for (const o of house.outdoor) if (o.kind !== 'deck') draw(o.rect, highlight.includes(o.id), 0.06);
  for (const r of house.rooms) draw(r.rect, highlight.includes(r.id), 0.16);
  return svg;
}

export class FileModal {
  readonly el: HTMLElement;
  private sheet: HTMLElement;
  private returnFocus: HTMLElement | null = null;

  constructor(private hooks: { onOpen: () => void; onClose: () => void }) {
    this.sheet = h('div', { class: 'file__sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': copy.file.title });
    this.el = h('div', { class: 'file', 'aria-hidden': 'true' }, this.sheet);
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    document.body.append(this.el);
  }

  get isOpen() {
    return this.el.classList.contains('is-open');
  }

  open(stopIdx: number) {
    const st = stops[stopIdx];
    const room = house.rooms.find((r) => r.id === st.room);
    const out = house.outdoor.find((o) => o.id === st.room);
    const rect = room?.rect ?? out?.rect;
    const close = h('button', { class: 'file__close', type: 'button' }, copy.file.close);
    close.addEventListener('click', () => this.close());
    const dl = h('dl');
    if (rect) {
      const w = rect.x1 - rect.x0;
      const d = rect.z1 - rect.z0;
      dl.append(h('dt', {}, copy.file.area), h('dd', {}, `${fmtArea(w * d)} m²`), h('dt', {}, copy.file.size), h('dd', {}, `${fmt(w)} × ${fmt(d)} m`));
    }
    if (room) dl.append(h('dt', {}, copy.file.ceiling), h('dd', {}, `${fmt(room.ceiling)} m`));
    const highlight = [st.room, ...(st.id === 'suite' ? ['closet', 'banho'] : []), ...(st.id === 'cozinha' ? ['cozinha', 'adega'] : [])];
    this.sheet.replaceChildren(
      close,
      h('div', { class: 'file__kicker' }, `${copy.file.title} · ${copy.hud.stopKicker} ${String(st.index).padStart(2, '0')}`),
      h('h2', { class: 'file__title', style: 'white-space:pre-line' }, titleLines(st.title)),
      h('div', { class: 'file__plan' }, miniPlan(highlight)),
      dl,
      h('p', {}, st.text),
      h('div', { class: 'file__kicker', style: 'margin:22px 0 8px;color:inherit' }, copy.file.finishes),
      h('ul', {}, ...st.finishes.map((f) => h('li', {}, f))),
    );
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.el.classList.add('is-open');
    this.el.setAttribute('aria-hidden', 'false');
    this.hooks.onOpen();
    requestAnimationFrame(() => close.focus());
  }

  close() {
    this.el.classList.remove('is-open');
    this.el.setAttribute('aria-hidden', 'true');
    this.hooks.onClose();
    this.returnFocus?.focus();
  }
}
