// Gera public/fallback/planta.png (a planta do hero, sem a interface) para quando o WebGL não estiver disponível.
// Uso: node tests/e2e/fallback.mjs [url]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/?q=high';
mkdirSync('public/fallback', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => !document.getElementById('loader') && window.__casa, null, { timeout: 300000 });
await page.waitForTimeout(6000);
const box = await page.evaluate(() => {
  const r = document.querySelector('[data-plan-slot]').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});
await page.addStyleTag({ content: '#ui, .lil-gui, .stats { display: none !important; }' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'public/fallback/planta.png', clip: box });
console.log('ok', box);
await browser.close();
