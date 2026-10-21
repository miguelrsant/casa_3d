import { brand } from '../content/brand';
import { copy } from '../content/copy.pt-BR';
import { stops } from '../story/stops';

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Node | string | null)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null) el.append(c);
  return el;
}

const svgNS = 'http://www.w3.org/2000/svg';
export function s(tag: string, attrs: Attrs = {}, ...children: SVGElement[]): SVGElement {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

/** Link externo da marca: sempre em nova aba, sem vazar o opener. */
export function externalLink(href: string, attrs: Attrs, ...children: (Node | string)[]) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', ...attrs }, ...children);
}

export interface UIRefs {
  root: HTMLElement;
  hero: HTMLElement;
  slot: HTMLElement;
  scaleBar: SVGElement;
  scaleLabels: SVGElement[];
  hint: HTMLElement;
  counter: HTMLElement;
  ruler: HTMLElement;
  rulerButtons: HTMLButtonElement[];
  callout: HTMLElement;
  marker: HTMLButtonElement;
  calloutKicker: HTMLElement;
  calloutTitle: HTMLElement;
  calloutSpecs: HTMLElement;
  calloutLines: HTMLElement[];
  final: HTMLElement;
  aerial: HTMLElement;
}

function northArrow() {
  return s(
    'svg',
    { class: 'north', width: 44, height: 56, viewBox: '-22 -30 44 56', 'aria-hidden': 'true' },
    s('circle', { cx: 0, cy: 4, r: 17, fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }),
    s('path', { d: 'M0 -14 L7 16 L0 9 L-7 16 Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1 }),
    s('path', { d: 'M0 -14 L0 9 L-7 16 Z', fill: 'currentColor' }),
    s('text', { x: 0, y: -21, 'text-anchor': 'middle', 'font-size': 8, fill: 'currentColor', 'font-family': 'JetBrains Mono, monospace' }),
  );
}

export function buildUI(): UIRefs {
  const root = document.getElementById('ui')!;
  root.replaceChildren();

  // cabeçalho: logo (nova aba) e CTA
  const logo = h('img', { src: brand.logoSrc, alt: '', width: 30, height: 30 });
  const brandLink = externalLink(brand.url, { class: 'brand', 'aria-label': copy.header.logoAria, 'data-brand': true }, logo, h('span', { 'data-scramble': true }, brand.wordmark));
  const cta = externalLink(brand.ctaUrl, { class: 'cta' }, copy.header.cta);

  // hero
  const title = h('h1', { class: 'hero__title' });
  copy.hero.titleLines.forEach((line, i) => {
    title.append(line);
    if (i < copy.hero.titleLines.length - 1) title.append(h('br'));
  });
  title.append(h('em', {}, copy.hero.titleAccent));
  const kicker = h('div', { class: 'hero__kicker' }, ...copy.hero.kicker.flatMap((k, i) => (i ? [h('span', {}, '·'), h('span', {}, k)] : [h('span', {}, k)])));
  const col = h('div', { class: 'hero__col' }, kicker, title, h('p', { class: 'hero__body' }, copy.hero.body));
  const tb = h('div', { class: 'titleblock', 'aria-hidden': 'true' }, ...copy.hero.titleBlock.map((f) => h('div', {}, h('small', {}, f.label), f.value)));

  const scaleBar = s('svg', { width: 200, height: 26, 'aria-hidden': 'true' });
  const scaleLabels: SVGElement[] = [];
  const legend = h(
    'div',
    { class: 'legend' },
    h('h2', {}, copy.hero.legendTitle),
    h('p', {}, ...copy.hero.legendSub.flatMap((k, i) => (i ? [h('span', {}, '·'), h('span', {}, k)] : [h('span', {}, k)]))),
    scaleBar,
    northArrow(),
  );
  (legend.querySelector('.north text') as SVGElement).textContent = 'N';
  const slot = h('div', { class: 'plan-slot', 'data-plan-slot': true, 'aria-hidden': 'true' });
  const hero = h('div', { class: 'hero' }, col, tb, legend, slot);

  const nav = h('nav', { class: 'nav', 'aria-label': 'Navegação' }, ...brand.nav.flatMap((n, i) => (i ? [h('span', {}, '|'), externalLink(n.href, {}, n.label)] : [externalLink(n.href, {}, n.label)])));

  // HUD do percurso
  const hint = h('div', { class: 'hint', 'aria-live': 'polite' }, copy.hints.enter);
  const counter = h('div', { class: 'counter' });
  const rulerButtons = stops
    .filter((st) => st.index > 0)
    .map((st) => {
      const b = h('button', { type: 'button', 'aria-label': `${copy.hud.stopKicker} ${st.index}: ${st.title}`, style: `--at:${(st.dwell[0] * 100).toFixed(2)}%` }, h('span', {}, String(st.index).padStart(2, '0'))) as HTMLButtonElement;
      b.dataset.t = String((st.dwell[0] + st.dwell[1]) / 2);
      return b;
    });
  const ruler = h('div', { class: 'ruler' }, h('div', { class: 'ruler__ticks' }), h('div', { class: 'ruler__now' }), ...rulerButtons);

  // callout do ambiente
  const marker = h('button', { class: 'marker', type: 'button', 'aria-label': copy.file.title }, h('i'), h('i'), h('i'), h('i')) as HTMLButtonElement;
  const calloutKicker = h('div', { class: 'callout__kicker' });
  const calloutTitle = h('h3', { class: 'callout__title' });
  const calloutSpecs = h('div', { class: 'callout__specs' });
  const vline = h('div', { class: 'callout__vline' });
  const hline = h('div', { class: 'callout__hline' });
  const callout = h('div', { class: 'callout' }, marker, h('div', { class: 'callout__panel' }, vline, hline, calloutKicker, calloutTitle, calloutSpecs));

  // fim: CTA
  const finalCol = h(
    'div',
    { class: 'hero__col' },
    h('div', { class: 'hero__kicker' }, h('span', {}, copy.cta.kicker)),
    h('h2', { class: 'hero__title' }, copy.cta.title[0], h('br'), copy.cta.title[1], h('br'), h('em', {}, copy.cta.title[2])),
    h('p', { class: 'hero__body' }, copy.cta.body),
    externalLink(brand.ctaUrl, { class: 'button' }, copy.cta.button),
  );
  const final = h('div', { class: 'final' }, finalCol);
  const aerial = h('div', { class: 'aerial', 'aria-hidden': 'true' });

  root.append(hero, final, aerial, callout, hint, counter, ruler, nav, brandLink, cta);

  return {
    root,
    hero,
    slot,
    scaleBar,
    scaleLabels,
    hint,
    counter,
    ruler,
    rulerButtons,
    callout,
    marker,
    calloutKicker,
    calloutTitle,
    calloutSpecs,
    calloutLines: [vline, hline],
    final,
    aerial,
  };
}

/** Escala gráfica (0 · 1 · 5 · 10 m) com o comprimento real da planta na tela. */
export function drawScaleBar(svg: SVGElement, pxPerMeter: number) {
  const marks = [0, 1, 5, 10];
  const w = 10 * pxPerMeter;
  svg.setAttribute('width', String(Math.ceil(w + 24)));
  svg.replaceChildren();
  for (let i = 0; i < marks.length - 1; i++) {
    const x0 = marks[i] * pxPerMeter;
    const x1 = marks[i + 1] * pxPerMeter;
    svg.append(s('rect', { x: x0, y: 2, width: x1 - x0, height: 4, fill: i % 2 ? 'none' : 'currentColor', stroke: 'currentColor', 'stroke-width': 0.8 }));
  }
  copy.hero.scaleBarLabels.forEach((label, i) => {
    const t = s('text', { x: marks[i] * pxPerMeter, y: 18, 'font-size': 7.5, fill: 'currentColor', 'text-anchor': i === 0 ? 'start' : 'middle', 'font-family': 'JetBrains Mono, monospace' });
    t.textContent = label;
    svg.append(t);
  });
}

/** Conteúdo semântico (leitores de tela e buscadores) e a altura total do scroll. */
export function buildStory(totalVh: number) {
  const story = document.getElementById('story')!;
  story.style.height = `${totalVh}vh`;
  const sr = h('div', { class: 'sr-only' }, h('h1', {}, `${copy.hero.titleLines.join(' ')}${copy.hero.titleAccent}`), h('p', {}, copy.hero.body));
  for (const st of stops) if (st.index > 0) sr.append(h('section', {}, h('h2', {}, `${st.index}. ${st.title}`), h('p', {}, st.text)));
  story.replaceChildren(sr);
}
