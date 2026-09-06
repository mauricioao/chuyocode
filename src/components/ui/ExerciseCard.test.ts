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
  href: '/es/ingles/B1/phrasal-verbs/greetings',
  // The FOCUS leads: the language point is what the learner is choosing.
  title: 'Phrasal verbs',
  skill: 'reading',
};

async function render(props: Record<string, unknown>): Promise<string> {
  const container = await AstroContainer.create();
  return container.renderToString(ExerciseCard, { props });
}

describe('ExerciseCard.astro — link and title', () => {
  it('renders the whole card as one anchor to href', async () => {
    const html = await render(baseProps);
    expect(html).toContain('href="/es/ingles/B1/phrasal-verbs/greetings"');
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

describe('ExerciseCard.astro — the focus leads', () => {
  it('renders the language point as the card heading', async () => {
    // `focus` is the primary axis: "what am I practising?" is the question the
    // card has to answer at a glance. The context, when there is one, is a
    // badge underneath — it qualifies the exercise, it does not identify it.
    const html = await render({ ...baseProps, title: 'Second conditional' });

    expect(html).toContain('Second conditional');
  });

  it('puts the heading BEFORE the badge row in the markup', async () => {
    // Reading order is the accessible order: a screen reader and a sighted
    // scanner must both meet the language point first.
    const html = await render({
      ...baseProps,
      levelBadge: 'Nivel B1',
      topic: 'code-review',
    });

    expect(html.indexOf('Phrasal verbs')).toBeLessThan(html.indexOf('Nivel B1'));
    expect(html.indexOf('Phrasal verbs')).toBeLessThan(html.indexOf('Code review'));
  });
});

describe('ExerciseCard.astro — optional topic context', () => {
  it('renders the English topic label when the exercise has a context', async () => {
    const html = await render({ ...baseProps, topic: 'code-review' });

    expect(html).toContain('Code review');
  });

  it('derives the topic label from the slug, never from a lang prop', async () => {
    // Same structural rule as the skill label: the component takes no `lang`,
    // so a call site cannot pass a translated topic even by mistake.
    const html = await render({ ...baseProps, topic: 'job-interview' });

    expect(html).toContain('Job interview');
    for (const spanish of ['Entrevista', 'Revisión de código', 'Comida']) {
      expect(html).not.toContain(spanish);
    }
  });

  it('renders NO topic badge at all when the topic is null', async () => {
    // A null topic is ORDINARY, not missing data: a pure grammar drill has no
    // natural setting. `0004_exercises_focus.sql` made the column nullable for
    // exactly this case.
    const html = await render({ ...baseProps, topic: null });

    expect(html).not.toContain('Code review');
    // Exactly ONE badge — the skill — and no stray empty pill beside it.
    expect(html.match(/<span[^>]*inline-flex/g)).toHaveLength(1);
  });

  it('renders NO topic badge when the prop is omitted entirely', async () => {
    const html = await render(baseProps);

    expect(html.match(/<span[^>]*inline-flex/g)).toHaveLength(1);
  });

  it('never renders an EMPTY badge for a topic outside the taxonomy', async () => {
    // THE bug this repo already shipped once, in this very component:
    // `SKILL_LABELS[skill]` produced a bordered pill with nothing inside it.
    // Astro renders `undefined` as nothing at all, so the failure looks
    // deliberate rather than broken. An unknown topic must show the raw slug,
    // which is at least an honest English value, or show nothing.
    const html = await render({ ...baseProps, topic: 'space-travel' });

    expect(html).not.toMatch(/<span[^>]*inline-flex[^>]*>\s*<\/span>/);
    expect(html).not.toContain('undefined');
    expect(html).toContain('space-travel');
  });

  it('renders an empty-string topic as no badge, not as a blank pill', async () => {
    const html = await render({ ...baseProps, topic: '' });

    expect(html.match(/<span[^>]*inline-flex/g)).toHaveLength(1);
  });

  it('shows level, skill and topic together when all three are present', async () => {
    const html = await render({
      ...baseProps,
      levelBadge: 'Nivel B1',
      topic: 'code-review',
    });

    expect(html).toContain('Nivel B1');
    expect(html).toContain('Reading');
    expect(html).toContain('Code review');
    // Level, then skill, then context — narrowing from placement to detail.
    expect(html.indexOf('Nivel B1')).toBeLessThan(html.indexOf('Reading'));
    expect(html.indexOf('Reading')).toBeLessThan(html.indexOf('Code review'));
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
    expect(html).toContain('href="/es/ingles/B1/phrasal-verbs/greetings"');
    expect(html).toContain('Phrasal verbs');
  });
});
