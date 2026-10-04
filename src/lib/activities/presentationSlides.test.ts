import { describe, it, expect } from 'vitest';
import {
  collectPresentationQuestions,
  collectPresentationWorksheets,
  hasPresentableQuiz,
  hasPresentableWorksheet,
  hasPresentableContent,
  buildPresentationSlides,
  revealableSlides,
  listProjectionWarnings,
  promptFontSize,
  PROMPT_FONT_MAX_PX,
  PROMPT_FONT_MIN_PX,
} from './presentationSlides';
import type { Block } from './blocks';

const WORKSHEET: Block = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
  zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
};

/** Two zones, deliberately authored out of reading order (bottom-left first) — exercises `orderZonesForReading` through this module. */
const WORKSHEET_TWO_ZONES: Block = {
  id: 'w2',
  type: 'worksheet',
  rotation: 0,
  name: 'Mi hoja',
  image: { path: 'activity-images/abc/img-2.webp', width: 800, height: 400 },
  zones: [
    { id: 'bottom', x: 0.1, y: 0.8, w: 0.1, h: 0.1, kind: 'text', answers: ['b'] },
    { id: 'top', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['a'] },
  ],
};

const WORKSHEET_NO_IMAGE: Block = { id: 'w3', type: 'worksheet', rotation: 0, zones: [] };

const WORKSHEET_NO_ZONES: Block = {
  id: 'w4',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/abc/img-4.webp', width: 800, height: 400 },
  zones: [],
};

function quizBlock(id: string, slotIds: string[]): Block {
  return {
    id,
    type: 'quiz',
    payload: {
      pools: {},
      slots: slotIds.map((slotId) => ({ id: slotId, label: `${slotId} label`, input: 'text', answer: ['x'] })),
    },
  };
}

describe('collectPresentationQuestions', () => {
  it('returns nothing for an empty block list', () => {
    expect(collectPresentationQuestions([])).toEqual([]);
  });

  it('ignores worksheet blocks entirely', () => {
    expect(collectPresentationQuestions([WORKSHEET])).toEqual([]);
  });

  it("flattens one quiz block's own slots, in their authored order", () => {
    const block = quizBlock('q1', ['s1', 's2']);
    const questions = collectPresentationQuestions([block]);
    expect(questions.map((q) => q.slot.id)).toEqual(['s1', 's2']);
    expect(questions.every((q) => q.blockId === 'q1')).toBe(true);
    expect(questions[0]!.payload).toBe((block as { payload: unknown }).payload);
  });

  it('flattens several quiz blocks, interleaved with worksheets, in document order', () => {
    const blocks = [WORKSHEET, quizBlock('q1', ['s1']), WORKSHEET, quizBlock('q2', ['s2', 's3'])];
    const questions = collectPresentationQuestions(blocks);
    expect(questions.map((q) => [q.blockId, q.slot.id])).toEqual([
      ['q1', 's1'],
      ['q2', 's2'],
      ['q2', 's3'],
    ]);
  });
});

describe('hasPresentableQuiz', () => {
  it('is false with no blocks at all', () => {
    expect(hasPresentableQuiz([])).toBe(false);
  });

  it('is false with only worksheet blocks', () => {
    expect(hasPresentableQuiz([WORKSHEET])).toBe(false);
  });

  it('is false for a quiz block with zero questions (a draft-parsed empty block)', () => {
    expect(hasPresentableQuiz([quizBlock('q1', [])])).toBe(false);
  });

  it('is true once at least one quiz question exists, worksheets alongside or not', () => {
    expect(hasPresentableQuiz([quizBlock('q1', ['s1'])])).toBe(true);
    expect(hasPresentableQuiz([WORKSHEET, quizBlock('q1', ['s1'])])).toBe(true);
  });
});

describe('promptFontSize', () => {
  it('gives a short prompt the maximum size', () => {
    expect(promptFontSize('Cats?')).toBe(PROMPT_FONT_MAX_PX);
  });

  it('floors a very long prompt at the minimum size', () => {
    const long = 'A'.repeat(200);
    expect(promptFontSize(long)).toBe(PROMPT_FONT_MIN_PX);
  });

  it('shrinks a medium-length prompt strictly between the two bounds', () => {
    const medium = 'A'.repeat(60);
    const size = promptFontSize(medium);
    expect(size).toBeLessThan(PROMPT_FONT_MAX_PX);
    expect(size).toBeGreaterThan(PROMPT_FONT_MIN_PX);
  });

  it('is monotonically non-increasing as the prompt gets longer', () => {
    const lengths = [5, 20, 30, 45, 60, 75, 90, 120];
    const sizes = lengths.map((n) => promptFontSize('A'.repeat(n)));
    for (let i = 1; i < sizes.length; i += 1) {
      expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]!);
    }
  });

  it('measures the trimmed length, ignoring surrounding whitespace', () => {
    expect(promptFontSize('Cats?')).toBe(promptFontSize('   Cats?   '));
  });
});

describe('collectPresentationWorksheets', () => {
  it('returns nothing for an empty block list, or one with only quiz blocks', () => {
    expect(collectPresentationWorksheets([])).toEqual([]);
    expect(collectPresentationWorksheets([quizBlock('q1', ['s1'])])).toEqual([]);
  });

  it('skips a worksheet with no image yet, and one with an image but no zones', () => {
    expect(collectPresentationWorksheets([WORKSHEET_NO_IMAGE])).toEqual([]);
    expect(collectPresentationWorksheets([WORKSHEET_NO_ZONES])).toEqual([]);
  });

  it('returns a presentable worksheet with its own zones already in reading order', () => {
    const [page] = collectPresentationWorksheets([WORKSHEET_TWO_ZONES]);
    expect(page.blockId).toBe('w2');
    expect(page.name).toBe('Mi hoja');
    expect(page.image).toEqual(WORKSHEET_TWO_ZONES.image);
    // Authored bottom-first; reading order is top-to-bottom.
    expect(page.zones.map((z) => z.id)).toEqual(['top', 'bottom']);
  });

  it('keeps authored block order across several worksheets, skipping unpresentable ones in between', () => {
    const pages = collectPresentationWorksheets([WORKSHEET, WORKSHEET_NO_ZONES, WORKSHEET_TWO_ZONES]);
    expect(pages.map((p) => p.blockId)).toEqual(['w1', 'w2']);
  });
});

describe('hasPresentableWorksheet', () => {
  it('is false with no blocks, or a worksheet missing an image or zones', () => {
    expect(hasPresentableWorksheet([])).toBe(false);
    expect(hasPresentableWorksheet([WORKSHEET_NO_IMAGE])).toBe(false);
    expect(hasPresentableWorksheet([WORKSHEET_NO_ZONES])).toBe(false);
  });

  it('is true once a worksheet has an image and at least one zone', () => {
    expect(hasPresentableWorksheet([WORKSHEET])).toBe(true);
  });
});

describe('hasPresentableContent', () => {
  it('is false when nothing at all is presentable', () => {
    expect(hasPresentableContent([])).toBe(false);
    expect(hasPresentableContent([WORKSHEET_NO_IMAGE, WORKSHEET_NO_ZONES])).toBe(false);
    expect(hasPresentableContent([quizBlock('q1', [])])).toBe(false);
  });

  it('is true for a quiz-only activity (unchanged from hasPresentableQuiz)', () => {
    expect(hasPresentableContent([quizBlock('q1', ['s1'])])).toBe(true);
  });

  it('is true for a WORKSHEET-ONLY activity — the broadened predicate this feature adds', () => {
    expect(hasPresentableContent([WORKSHEET])).toBe(true);
  });
});

describe('buildPresentationSlides', () => {
  it('returns nothing for an empty block list', () => {
    expect(buildPresentationSlides([])).toEqual([]);
  });

  it('matches collectPresentationQuestions for a quiz-only deck (one "question" slide per slot)', () => {
    const block = quizBlock('q1', ['s1', 's2']);
    const slides = buildPresentationSlides([block]);
    expect(slides).toEqual([
      { kind: 'question', blockId: 'q1', payload: block.payload, slot: block.payload.slots[0] },
      { kind: 'question', blockId: 'q1', payload: block.payload, slot: block.payload.slots[1] },
    ]);
  });

  it('builds one overview slide plus one zone slide per zone, in reading order, for a worksheet-only deck', () => {
    const slides = buildPresentationSlides([WORKSHEET_TWO_ZONES]);
    expect(slides.map((s) => s.kind)).toEqual(['worksheet-overview', 'worksheet-zone', 'worksheet-zone']);

    const overview = slides[0] as Extract<(typeof slides)[number], { kind: 'worksheet-overview' }>;
    expect(overview.blockId).toBe('w2');
    expect(overview.zones.map((z) => z.id)).toEqual(['top', 'bottom']);

    const [, zoneSlide1, zoneSlide2] = slides as Extract<(typeof slides)[number], { kind: 'worksheet-zone' }>[];
    expect(zoneSlide1.zone.id).toBe('top');
    expect(zoneSlide1.zoneIndex).toBe(1);
    expect(zoneSlide1.zoneCount).toBe(2);
    expect(zoneSlide2.zone.id).toBe('bottom');
    expect(zoneSlide2.zoneIndex).toBe(2);
    expect(zoneSlide2.zoneCount).toBe(2);
  });

  it('skips an unpresentable worksheet (no image/zones) entirely, contributing no slides', () => {
    expect(buildPresentationSlides([WORKSHEET_NO_IMAGE])).toEqual([]);
    expect(buildPresentationSlides([WORKSHEET_NO_ZONES])).toEqual([]);
  });

  it('interleaves worksheets and quizzes in exactly their authored block order', () => {
    const q1 = quizBlock('q1', ['s1']);
    const q2 = quizBlock('q2', ['s2']);
    const slides = buildPresentationSlides([WORKSHEET, q1, WORKSHEET_TWO_ZONES, q2]);
    expect(slides.map((s) => s.kind)).toEqual([
      'worksheet-overview', // WORKSHEET
      'worksheet-zone',
      'question', // q1
      'worksheet-overview', // WORKSHEET_TWO_ZONES
      'worksheet-zone',
      'worksheet-zone',
      'question', // q2
    ]);
    expect(slides.map((s) => s.blockId)).toEqual(['w1', 'w1', 'q1', 'w2', 'w2', 'w2', 'q2']);
  });
});

describe('revealableSlides', () => {
  it('is a parallel array: true for question/worksheet-zone slides, false for a worksheet-overview', () => {
    const slides = buildPresentationSlides([WORKSHEET_TWO_ZONES, quizBlock('q1', ['s1'])]);
    expect(revealableSlides(slides)).toEqual([false, true, true, true]);
  });

  it('is empty for an empty deck', () => {
    expect(revealableSlides([])).toEqual([]);
  });
});

describe('listProjectionWarnings', () => {
  it('is empty for a short quiz prompt and a comfortably sized worksheet zone', () => {
    // A generously sized zone relative to its page (20% of each side on a
    // 1000x1000 image) — comfortably under `MAX_ZONE_CAMERA_ZOOM` once
    // framed with padding, unlike the much smaller/thinner zones the other
    // cases below deliberately use.
    const comfortableWorksheet: Block = {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-images/abc/img-1.webp', width: 1000, height: 1000 },
      zones: [{ id: 'z1', x: 0.4, y: 0.4, w: 0.2, h: 0.2, kind: 'text', answers: ['cat'] }],
    };
    expect(listProjectionWarnings([quizBlock('q1', ['s1']), comfortableWorksheet])).toEqual([]);
  });

  it('warns on a quiz prompt long enough to be floored at the minimum font size', () => {
    const block: Block = {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: {},
        slots: [{ id: 's1', label: 'A'.repeat(200), input: 'text', answer: ['x'] }],
      },
    };
    expect(listProjectionWarnings([block])).toEqual([
      { blockId: 'q1', slotId: 's1', reason: 'quiz_prompt_too_long' },
    ]);
  });

  it('warns on a worksheet zone small enough to exceed the camera helper\'s max zoom', () => {
    const tinyZoneWorksheet: Block = {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-images/abc/img-1.webp', width: 2000, height: 2000 },
      zones: [{ id: 'tiny', x: 0.5, y: 0.5, w: 0.01, h: 0.01, kind: 'text', answers: ['x'] }],
    };
    expect(listProjectionWarnings([tinyZoneWorksheet])).toEqual([
      { blockId: 'w1', zoneId: 'tiny', reason: 'worksheet_zone_too_small' },
    ]);
  });

  it('collects every warning across several blocks, in authored order', () => {
    const longPromptQuiz: Block = {
      id: 'q1',
      type: 'quiz',
      payload: { pools: {}, slots: [{ id: 's1', label: 'A'.repeat(200), input: 'text', answer: ['x'] }] },
    };
    const tinyZoneWorksheet: Block = {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-images/abc/img-1.webp', width: 2000, height: 2000 },
      zones: [{ id: 'tiny', x: 0.5, y: 0.5, w: 0.01, h: 0.01, kind: 'text', answers: ['x'] }],
    };
    const warnings = listProjectionWarnings([longPromptQuiz, tinyZoneWorksheet]);
    expect(warnings).toEqual([
      { blockId: 'q1', slotId: 's1', reason: 'quiz_prompt_too_long' },
      { blockId: 'w1', zoneId: 'tiny', reason: 'worksheet_zone_too_small' },
    ]);
  });
});
