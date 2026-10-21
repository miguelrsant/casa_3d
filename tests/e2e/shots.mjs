// Screenshots do percurso em pontos de t (uso: node tests/e2e/shots.mjs [url] [saida] [t1,t2,...]).
// Usa o Google Chrome instalado (channel: 'chrome'); não baixa navegador.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'tests/e2e/__screens__';
const ts = (process.argv[4] ?? '0,0.07,0.1,0.14,0.22,0.27,0.315,0.38,0.45,0.51,0.6,0.645,0.69,0.79,0.89,0.93,0.98').split(',').map(Number);
const size = { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 860) };
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: process.env.GPU === '1' ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-gl=angle', '--use-angle=gl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: size, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loader') && window.__casa, null, { timeout: 180000 });
const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecido';
});
console.log('GPU:', gpu);

for (const t of ts) {
  await page.evaluate((t) => window.__casa.setT(t), t);
  await page.waitForTimeout(Number(process.env.WAIT ?? 900));
  const fps = await page.evaluate(
    () =>
      new Promise((ok) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => (++n < 20 ? requestAnimationFrame(f) : ok((n / (performance.now() - t0)) * 1000));
        requestAnimationFrame(f);
      }),
  );
  const file = `${out}/t${t.toFixed(3)}.png`;
  await page.screenshot({ path: file });
  const info = await page.evaluate(() => {
    const r = window.__casa.renderer.gl.info.render;
    return { calls: r.calls, triangles: r.triangles };
  });
  console.log(`t=${t.toFixed(3)}  ${fps.toFixed(1)} fps  calls=${info.calls}  tris=${info.triangles}  → ${file}`);
}
console.log(logs.length ? `\nConsole:\n${[...new Set(logs)].slice(0, 30).join('\n')}` : '\nConsole limpo.');
await browser.close();
