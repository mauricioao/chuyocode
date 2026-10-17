import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

/**
 * Accessibility smoke check for the public pages that render without
 * authentication: home, the Inglés activities catalog (guest browse is
 * allowed there — see that page's own header comment), and the news list.
 * Gated pages (`/[lang]/ingles/**` minus the catalog, `/[lang]/mis-actividades`,
 * `/[lang]/crear`, admin) are out of scope here; there is no e2e auth fixture
 * in this repo yet (see `tests/e2e/desk-widgets-part4.spec.ts`).
 *
 * Only `serious`/`critical` violations fail the suite. `moderate`/`minor`
 * findings are real but are not currently a release blocker; surfacing them
 * as hard failures here would make this suite flaky-by-design against
 * CMS-sourced content neither this test nor the page author controls.
 *
 * KNOWN_VIOLATIONS below is a precise, rule-id-keyed allowlist for
 * serious/critical findings already present on a given page, each with a
 * reason. It is not a blanket "disable the rule" escape hatch: a NEW
 * serious/critical violation (different rule id, or the same rule id on a
 * page not listed here) still fails the test.
 */

const PUBLIC_PAGES = ['/es/', '/es/ingles/actividades', '/es/noticias'];

/** `{ [path]: { [axe rule id]: reason } }` — see file header. */
const KNOWN_VIOLATIONS: Record<string, Record<string, string>> = {};

test.describe('accessibility (public pages)', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no serious/critical axe violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const allowed = KNOWN_VIOLATIONS[path] ?? {};
      const unexpected = results.violations.filter(
        (violation) =>
          (violation.impact === 'serious' || violation.impact === 'critical') &&
          !(violation.id in allowed),
      );

      const report = unexpected
        .map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.helpUrl}`,
        )
        .join('\n');

      expect(unexpected, report).toHaveLength(0);
    });
  }
});
