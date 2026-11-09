import { test, expect, type Page } from '@playwright/test';

/**
 * The catalog filter panel with the capsule dropdowns (owner approval
 * 2026-11-09, maquette `propuestas/desplegables` B2/B3). Each list is a Radix
 * Select portaled to <body>, so whether a press "outside the panel" really is
 * outside only exists in a real browser: opening, choosing and dismissing a
 * list must never close the panel under it (`CommunityFiltersPanel.astro`'s
 * outside-click script). The catalog is guest-open, so this runs anonymous.
 */

test.use({ viewport: { width: 1440, height: 900 } });

async function openPanel(page: Page) {
  await page.goto('/es/ingles/actividades', { waitUntil: 'networkidle' });
  // The dropdowns only work once their island has hydrated.
  await page.waitForFunction(() => {
    const island = document.querySelector('astro-island[component-url*="CommunityFiltersIsland"]');
    return island !== null && !island.hasAttribute('ssr');
  });
  await page.getByTestId('filters-trigger').click();
  await expect(page.getByTestId('filters-level')).toBeVisible();
}

const panel = (page: Page) => page.getByTestId('filters-popover');

test('opening and choosing in each list keeps the panel open, and Aplicar sends the same query as before', async ({ page }) => {
  await openPanel(page);

  for (const [testId, option] of [
    ['filters-level', 'Básico A2'],
    ['filters-type', 'Elegir la respuesta'],
    ['filters-sort', 'Más vistas'],
  ] as const) {
    await page.getByTestId(testId).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(panel(page)).toHaveAttribute('open', '');
    await page.getByRole('option', { name: option }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(panel(page)).toHaveAttribute('open', '');
    await expect(page.getByTestId(testId)).toHaveText(option);
  }

  await page.getByTestId('filters-apply').click();
  await page.waitForURL(/\/es\/ingles\/actividades\?/);
  expect(new URL(page.url()).search).toBe('?q=&nivel=A2&tipo=choose&orden=vistas');
  await expect(page.getByTestId('filter-chip-nivel')).toBeVisible();
  await expect(page.getByTestId('filter-chip-tipo')).toContainText('Elegir la respuesta');
});

test('the panel opens with the current values from the URL', async ({ page }) => {
  await page.goto('/es/ingles/actividades?nivel=B1&tipo=match&orden=gustadas', { waitUntil: 'networkidle' });
  await page.getByTestId('filters-trigger').click();
  await expect(page.getByTestId('filters-level')).toHaveText('Intermedio B1');
  await expect(page.getByTestId('filters-type')).toHaveText('Une las parejas');
  await expect(page.getByTestId('filters-sort')).toHaveText('Más gustadas');
});

test('Escape closes the open list first, then the panel', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('filters-level').click();
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(panel(page)).toHaveAttribute('open', '');
  await expect(page.getByTestId('filters-level')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel(page)).not.toHaveAttribute('open', '');
});

test('a press outside closes the open list first, then the panel', async ({ page }) => {
  await openPanel(page);
  // Somewhere outside both the panel and the list that is not a link: the
  // window's own title. Raw mouse clicks — an open Radix list sets
  // `pointer-events: none` on <body>, which a locator click would refuse.
  const title = await page.getByText('Actividades de la comunidad', { exact: true }).first().boundingBox();
  expect(title).not.toBeNull();
  const outside = { x: title!.x + title!.width / 2, y: title!.y + title!.height / 2 };

  await page.getByTestId('filters-type').click();
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.mouse.click(outside.x, outside.y);
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(panel(page)).toHaveAttribute('open', '');

  await page.mouse.click(outside.x, outside.y);
  await expect(panel(page)).not.toHaveAttribute('open', '');
});
