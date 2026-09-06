/**
 * ExerciseCard.astro — the FIRST rendered-markup coverage in the English
 * section.
 *
 * Every other test here asserts status codes, because the pages mount React
 * islands and `AstroContainer` cannot render those without the `@astrojs/react`
 * server renderer (`src/pages/[lang]/libros/libros.test.ts:47`,
 * `src/pages/[lang]/ingles/ingles.test.ts:309`). This component deliberately
 * contains NO React — the skill glyph is inline SVG, not `lucide-react` — so the
 * container renders it standalone and the markup becomes assertable.
 *
 * WHAT THIS STILL CANNOT SEE: appearance. jsdom has no layout engine and the
 * container returns no scoped CSS, so nothing below proves the badge row wraps,
 * that the icon is legible at 12px, or that the focus state is visible. Four
 * bugs in this repo were invisible to vitest, `astro check` AND `astro build`.
 * A human still has to look.
 */
import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

import ExerciseCard from './ExerciseCard.astro';
import { SKILL_ICON_PATHS } from '@lib/skillIcons';

const baseProps = {
  href: '/es/ingles/B1/job-interview/greetings',
  title: 'Job interview',
  skill: 'reading',
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ExerciseCard, { props });
}

describe('ExerciseCard.astro — link and title', () => {
  it('renders the whole card as one anchor to href', async () => {
    const html = await render(baseProps);
    expect(html).toContain('href="/es/ingles/B1/job-interview/greetings"');
    // One anchor = one tab stop for keyboard users.
    expect(html.match(/<a\b/g)).toHaveLength(1);
  });

  it('renders the title the caller supplied, verbatim', async () => {
    const html = await render({ ...baseProps, title: 'Review comments' });
    expect(html).toContain('Review comments');
  });

  it('steps the title up to text-xl only when asked', async () => {
    // The related grid runs two columns and asks for `xl`; the listing does not.
    expect(await render(baseProps)).toContain('text-lg');
    expect(await render({ ...baseProps, titleSize: 'xl' })).toContain('text-xl');
  });

  it('stretches to full height so grid neighbours equalise', async () => {
    expect(await render(baseProps)).toContain('h-full');
  });

  it('keeps the hover and focus affordances the other cards use', async () => {
    const html = await render(baseProps);
    expect(html).toContain('hover:border-accent');
    expect(html).toContain('focus-visible:border-accent');
  });
});

describe('ExerciseCard.astro — level badge', () => {
  it('renders the pre-composed level badge when given one', async () => {
    const html = await render({ ...baseProps, levelBadge: 'Nivel B1' });
    expect(html).toContain('Nivel B1');
  });

  it('accepts the English chrome for the same badge', async () => {
    // "Nivel"/"Level" is chrome and localizes; the CEFR code never does.
    const html = await render({ ...baseProps, levelBadge: 'Level B1' });
    expect(html).toContain('Level B1');
  });

  it('renders NO level badge when the prop is omitted', async () => {
    // The listing omits it: every card there shares the page's level, so the
    // badge would print identical text on every row.
    const html = await render(baseProps);
    expect(html).not.toContain('Nivel');
    expect(html).not.toContain('Level');
    // `secondary` is the level badge's variant and nothing else here uses it.
    expect(html).not.toContain('bg-secondary');
  });
});

describe('ExerciseCard.astro — skill label stays English', () => {
  it('derives the English label from the skill, not from a prop', async () => {
    expect(await render({ ...baseProps, skill: 'reading' })).toContain('Reading');
    expect(await render({ ...baseProps, skill: 'writing' })).toContain('Writing');
    expect(await render({ ...baseProps, skill: 'listening' })).toContain(
      'Listening',
    );
  });

  it('never renders a Spanish skill label, in any locale', async () => {
    // Taxonomy labels are exercise DATA and stay English everywhere
    // (docs/exercise-model.md, "Authoring rules"). The component takes no lang
    // prop at all, which is what makes that structural rather than remembered.
    const html = await render({ ...baseProps, skill: 'writing' });
    for (const spanish of ['Escritura', 'Lectura', 'Escucha', 'Comprensión']) {
      expect(html).not.toContain(spanish);
    }
  });
});

describe('ExerciseCard.astro — decorative skill icon', () => {
  it('draws the listening glyph from the headphones geometry', async () => {
    const html = await render({ ...baseProps, skill: 'listening' });
    expect(html).toContain('<svg');
    expect(html).toContain(SKILL_ICON_PATHS.listening[0]);
  });

  it('draws every path of a multi-path glyph', async () => {
    const html = await render({ ...baseProps, skill: 'writing' });
    for (const d of SKILL_ICON_PATHS.writing) {
      expect(html).toContain(d);
    }
    expect(html.match(/<path\b/g)).toHaveLength(SKILL_ICON_PATHS.writing.length);
  });

  it('hides the icon from screen readers and keeps the text label visible', async () => {
    const html = await render({ ...baseProps, skill: 'reading' });
    // Decorative: the label carries the meaning, the icon only speeds up
    // scanning. Announcing both would say "Reading" twice.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).toContain('Reading');
  });

  it('keeps the svg a DIRECT child of the badge so badgeVariants sizes it', async () => {
    // `badgeVariants` carries `[&>svg]:size-3!` and `gap-1`; an svg nested one
    // level deeper would silently lose both.
    const html = await render({ ...baseProps, skill: 'reading' });
    expect(html).toMatch(/<span[^>]*class="[^"]*inline-flex[^"]*"[^>]*>\s*<svg/);
  });
});

describe('ExerciseCard.astro — an unknown skill degrades, never breaks', () => {
  // `src/lib/exercises.ts` builds rows with `skill: row.skill as Skill`, an
  // UNCHECKED cast, so a future or misspelled skill genuinely reaches here.
  it('renders NO icon for a skill outside the taxonomy', async () => {
    const html = await render({ ...baseProps, skill: 'speaking' });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<path');
  });

  it('never renders the literal word "undefined"', async () => {
    // The failure this guards is silent: an unmapped label would print
    // "undefined" into the badge and no status-code test would ever see it.
    const html = await render({ ...baseProps, skill: 'speaking' });
    expect(html).not.toContain('undefined');
  });

  it('falls back to the raw skill value so the badge is never blank', async () => {
    const html = await render({ ...baseProps, skill: 'speaking' });
    expect(html).toContain('speaking');
  });

  it('still renders the card, the link and the title', async () => {
    // A bad skill must degrade one badge, never cost the user the whole card.
    const html = await render({ ...baseProps, skill: 'speaking' });
    expect(html).toContain('href="/es/ingles/B1/job-interview/greetings"');
    expect(html).toContain('Job interview');
  });
});
