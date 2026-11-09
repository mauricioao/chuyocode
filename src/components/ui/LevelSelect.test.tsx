// @vitest-environment jsdom
/**
 * LevelSelect / LevelBars — the level variant of the one dropdown pattern
 * (owner approval 2026-11-09, maquette `propuestas/desplegables` A3/A4/C/D/E):
 * the desk dock's ascending bars in miniature, tiers as named groups split by
 * thin lines, "Básico A1 … Avanzado C2" names, and a none option.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { Level } from '@/lib/exerciseTaxonomy';
import { LevelBars, LevelSelect } from './LevelSelect';

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.scrollIntoView ??= () => {};
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function filledRects(svg: Element) {
  return [...svg.querySelectorAll('rect')].filter((r) => r.hasAttribute('data-filled'));
}

describe('LevelBars — the dock bars in miniature', () => {
  it.each([
    ['A1', 1, 'fill-pop-mint-deep'],
    ['A2', 2, 'fill-pop-mint-deep'],
    ['B1', 3, 'fill-pop-sky-deep'],
    ['B2', 4, 'fill-pop-sky-deep'],
    ['C1', 5, 'fill-pop-violet'],
    ['C2', 6, 'fill-pop-violet'],
  ] as const)('%s fills %i of 6 bars, in its tier colour', (level, count, fillClass) => {
    const { container } = render(<LevelBars level={level} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('rect')).toHaveLength(6);
    const filled = filledRects(svg);
    expect(filled).toHaveLength(count);
    for (const rect of filled) expect(rect.getAttribute('class')).toContain(fillClass);
    // The filled bars are always the FIRST (shortest) ones, ascending.
    const rects = [...svg.querySelectorAll('rect')];
    expect(rects.slice(0, count).every((r) => r.hasAttribute('data-filled'))).toBe(true);
    for (const rect of rects.slice(count)) expect(rect.getAttribute('class')).toContain('fill-border');
  });

  it('no level: all six bars empty', () => {
    const { container } = render(<LevelBars level={null} />);
    const svg = container.querySelector('svg')!;
    expect(filledRects(svg)).toHaveLength(0);
    expect([...svg.querySelectorAll('rect')].every((r) => r.getAttribute('class')?.includes('fill-border'))).toBe(true);
  });

  it('ascends: each bar is taller than the one before, the last one fills the icon height', () => {
    const { container } = render(<LevelBars level="B1" />);
    const heights = [...container.querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
    expect(heights[5]).toBe(16);
    for (let i = 1; i < heights.length; i += 1) expect(heights[i]).toBeGreaterThan(heights[i - 1]!);
  });
});

function Controlled({
  initial = null,
  onValueChange,
  lang = 'es',
  noneLabel = 'Sin nivel',
  name,
}: {
  initial?: Level | null;
  onValueChange?: (level: Level | null) => void;
  lang?: 'es' | 'en';
  noneLabel?: string;
  name?: string;
}) {
  const [value, setValue] = useState<Level | null>(initial);
  return (
    <LevelSelect
      lang={lang}
      label="Nivel"
      noneLabel={noneLabel}
      value={value}
      name={name}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      testId="level-select"
    />
  );
}

function trigger() {
  return screen.getByTestId('level-select');
}

describe('LevelSelect — trigger', () => {
  it('shows the level name with its bars', () => {
    render(<Controlled initial="B1" />);
    expect(trigger().textContent).toBe('Intermedio B1');
    expect(trigger().getAttribute('aria-label')).toBe('Nivel');
    expect(filledRects(trigger().querySelector('[data-slot="level-bars"]')!)).toHaveLength(3);
  });

  it('shows the none label with six empty bars when no level is set', () => {
    render(<Controlled noneLabel="Todos los niveles" />);
    expect(trigger().textContent).toBe('Todos los niveles');
    expect(filledRects(trigger().querySelector('[data-slot="level-bars"]')!)).toHaveLength(0);
  });
});

describe('LevelSelect — the list', () => {
  it('lists the none option and the six levels by their full names, each with its bars', async () => {
    render(<Controlled initial="B1" />);
    fireEvent.click(trigger());
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Sin nivel',
      'Básico A1',
      'Básico A2',
      'Intermedio B1',
      'Intermedio B2',
      'Avanzado C1',
      'Avanzado C2',
    ]);
    expect(options.map((o) => filledRects(o.querySelector('[data-slot="level-bars"]')!).length)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(options[3]!.getAttribute('data-state')).toBe('checked');
    expect(options[3]!.querySelector('[data-slot="capsule-select-check"] svg')).not.toBeNull();
  });

  it('groups the tiers (named, no visible header) and splits them with thin lines', async () => {
    render(<Controlled />);
    fireEvent.click(trigger());
    const listbox = await screen.findByRole('listbox');
    const groups = within(listbox).getAllByRole('group');
    const names = groups.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent);
    expect(names).toEqual(['Básico', 'Intermedio', 'Avanzado']);
    expect(within(groups[1]!).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Intermedio B1',
      'Intermedio B2',
    ]);
    // none | Básico | Intermedio | Avanzado — three lines between four groups.
    expect(listbox.querySelectorAll('[data-slot="capsule-select-separator"]')).toHaveLength(3);
  });

  it('typing "in" jumps to Intermedio', async () => {
    render(<Controlled initial="A1" />);
    fireEvent.click(trigger());
    await screen.findByRole('listbox');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Básico A1'));
    fireEvent.keyDown(document.activeElement!, { key: 'i' });
    fireEvent.keyDown(document.activeElement!, { key: 'n' });
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Intermedio B1'));
  });

  it('reports the chosen level, and null for the none option', async () => {
    const onValueChange = vi.fn();
    render(<Controlled initial="A2" onValueChange={onValueChange} />);
    fireEvent.click(trigger());
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Avanzado C2'));
    expect(onValueChange).toHaveBeenLastCalledWith('C2');
    expect(trigger().textContent).toBe('Avanzado C2');

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    fireEvent.click(trigger());
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Sin nivel'));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(trigger().textContent).toBe('Sin nivel');
  });

  it('uses the English level names', async () => {
    render(<Controlled lang="en" initial="C1" noneLabel="No level" />);
    expect(trigger().textContent).toBe('Advanced C1');
    fireEvent.click(trigger());
    const names = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(names[0]).toBe('No level');
    expect(names[3]).toBe('Intermediate B1');
  });

  it('inside a form, submits the bare code under its name, and "" for the none option', async () => {
    const { container } = render(
      <form>
        <Controlled name="nivel" noneLabel="Todos los niveles" />
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(new FormData(form).get('nivel')).toBe('');
    fireEvent.click(trigger());
    fireEvent.click(within(await screen.findByRole('listbox')).getByText('Básico A2'));
    await waitFor(() => expect(new FormData(form).get('nivel')).toBe('A2'));
  });
});

describe('LevelSelect — on a phone', () => {
  it('opens the levels in the BottomSheet, with bars on every row', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    render(<Controlled initial="B1" />);
    fireEvent.click(trigger());
    const sheet = screen.getByTestId('level-select-sheet');
    const options = within(sheet).getAllByRole('option');
    expect(options).toHaveLength(7);
    expect(options[3]!.getAttribute('aria-selected')).toBe('true');
    expect(options.every((o) => o.querySelector('[data-slot="level-bars"]'))).toBe(true);
    expect(within(sheet).getAllByRole('group')).toHaveLength(3);
  });
});
