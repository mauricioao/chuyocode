import { describe, it, expect } from 'vitest';
import { findVoseo } from '@/lib/neutralSpanish';
import { villageInnScene } from './villageInn';

describe('villageInnScene', () => {
  it('is a valid, already-parsed scene at the inn', () => {
    expect(villageInnScene.id).toBe('village-inn');
    expect(villageInnScene.background).toBe('inn');
  });

  it('has a scene length in the ~20–25 line range the brief asked for', () => {
    expect(villageInnScene.lines.length).toBeGreaterThanOrEqual(20);
    expect(villageInnScene.lines.length).toBeLessThanOrEqual(25);
  });

  it('gives every line a unique id', () => {
    const ids = villageInnScene.lines.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every line both an English line and a Spanish translation', () => {
    for (const line of villageInnScene.lines) {
      expect(line.en.trim().length).toBeGreaterThan(0);
      expect(line.es.trim().length).toBeGreaterThan(0);
    }
  });

  it('covers each of the seven grammar points the owner asked for, exactly once', () => {
    const titles = villageInnScene.lines.flatMap((line) => (line.grammar ? [line.grammar.title] : []));
    expect(new Set(titles).size).toBe(titles.length); // no duplicates
    expect(titles).toEqual([
      'Saludos',
      'El verbo "to be"',
      'How much is / are…',
      'Peticiones corteses: "Could I…?"',
      'Preposiciones de lugar',
      'Presente simple (tercera persona)',
      "Can / can't",
    ]);
  });

  it('has 3–4 comprehension choices, each with exactly one correct option', () => {
    const choices = villageInnScene.lines.flatMap((line) => (line.choice ? [line.choice] : []));
    expect(choices.length).toBeGreaterThanOrEqual(3);
    expect(choices.length).toBeLessThanOrEqual(4);
    for (const choice of choices) {
      expect(choice.options.filter((o) => o.correct)).toHaveLength(1);
    }
  });

  it('uses neutral Spanish throughout (no voseo)', () => {
    const offenders = villageInnScene.lines.flatMap((line, i) => {
      const path = `lines[${i}]`;
      return [
        ...findVoseo({ [`${path}.es`]: line.es }),
        ...(line.grammar ? findVoseo({ [`${path}.grammar`]: line.grammar }) : []),
        ...(line.choice ? findVoseo({ [`${path}.choice`]: line.choice }) : []),
      ];
    });
    expect(offenders).toEqual([]);
  });

  it('features the innkeeper, a merchant and a guard, per the brief', () => {
    const names = new Set(villageInnScene.lines.map((line) => line.speaker.name));
    expect([...names].some((n) => /innkeeper/i.test(n))).toBe(true);
    expect([...names].some((n) => /merchant/i.test(n))).toBe(true);
    expect([...names].some((n) => /guard/i.test(n))).toBe(true);
  });
});
