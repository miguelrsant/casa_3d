import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __casa?: { setT: (t: number | null) => void };
  }
}

async function ready(page: Page, url = '/') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => !document.getElementById('loader') && !!window.__casa, null, { timeout: 240_000 });
  return errors;
}

test('logo e CTA abrem miguelrsant.com.br em nova aba', async ({ page }) => {
  await ready(page);
  const logo = page.locator('a.brand');
  await expect(logo).toHaveAttribute('href', 'https://miguelrsant.com.br');
  await expect(logo).toHaveAttribute('target', '_blank');
  await expect(logo).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(logo.locator('img')).toHaveAttribute('src', '/brand/miguelrsant-icon.svg');
  const cta = page.locator('a.cta');
  await expect(cta).toHaveAttribute('href', 'https://miguelrsant.com.br');
  await expect(cta).toHaveAttribute('target', '_blank');
});

test('carrega sem erros no console e mostra o hero', async ({ page }) => {
  const errors = await ready(page);
  await expect(page.locator('h1.hero__title')).toContainText('PLANTA.');
  await expect(page.locator('canvas#scene')).toBeVisible();
  expect(errors).toEqual([]);
});

test('callout do ambiente e ficha técnica (abre pelo marcador, fecha com ESC)', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.__casa!.setT(0.22));
  await expect(page.locator('.callout__title')).toHaveText(/A\s+ENTRADA/, { timeout: 90_000 });
  await expect.poll(async () => Number(await page.locator('.callout').evaluate((el) => getComputedStyle(el).opacity)), { timeout: 90_000 }).toBeGreaterThan(0.5);
  await page.locator('.marker').click();
  await expect(page.locator('.file')).toHaveClass(/is-open/);
  await expect(page.locator('.file__title')).toContainText('ENTRADA');
  await page.keyboard.press('Escape');
  await expect(page.locator('.file')).not.toHaveClass(/is-open/);
});
