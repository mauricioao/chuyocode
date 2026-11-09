// @vitest-environment jsdom
/**
 * CapsuleSelect — the one dropdown pattern of the Inglés product (owner
 * approval 2026-11-09, maquette `propuestas/desplegables`, section E). Tests
 * drive the real Radix Select through the DOM (click/keyboard) and assert what
 * a user or a screen reader gets: roles, focus, the ✓, and the value.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { CapsuleSelect, type CapsuleSelectGroup } from './CapsuleSelect';

// jsdom implements none of these; Radix Select calls them while opening
// (pointer capture on the trigger, `scrollIntoView` on the focused option).
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

/** `useIsDesktop` reads this — `false` is a phone (below `lg`). */
function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

const SORT: CapsuleSelectGroup[] = [
  {
    options: [
      { value: 'recent', label: 'Más recientes' },
      { value: 'liked', label: 'Más gustadas' },
      { value: 'viewed', label: 'Más vistas' },
      { value: 'shared', label: 'Más compartidas', disabled: true },
    ],
  },
];

function Controlled({
  initial = 'recent',
  onValueChange,
  groups = SORT,
  ...rest
}: {
  initial?: string;
  onValueChange?: (value: string) => void;
  groups?: CapsuleSelectGroup[];
  disabled?: boolean;
  name?: string;
  sheetOnPhone?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CapsuleSelect
      label="Ordenar por"
      groups={groups}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      testId="sort-select"
      {...rest}
    />
  );
}

function trigger() {
  return screen.getByTestId('sort-select');
}

async function openWithClick() {
  fireEvent.click(trigger());
  return screen.findByRole('listbox');
}

function optionNamed(name: string) {
  return screen.getAllByRole('option').find((o) => o.textContent?.includes(name))!;
}

describe('CapsuleSelect — the trigger (desktop)', () => {
  it('is a combobox capsule named by its label, showing the chosen option and a chevron', () => {
    render(<Controlled />);
    const el = trigger();
    expect(el.getAttribute('role')).toBe('combobox');
    expect(el.getAttribute('aria-label')).toBe('Ordenar por');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('data-slot')).toBe('capsule-select-trigger');
    expect(el.textContent).toBe('Más recientes');
    expect(el.querySelector('[data-slot="capsule-select-caret"]')).not.toBeNull();
  });

  it('never opens while disabled', () => {
    render(<Controlled disabled />);
    expect((trigger() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger());
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('CapsuleSelect — opening, moving and choosing (desktop)', () => {
  it('opens on click into a listbox, with the chosen option focused, marked aria-selected and ✓', async () => {
    render(<Controlled initial="liked" />);
    const listbox = await openWithClick();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(listbox.id);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Más recientes',
      'Más gustadas',
      'Más vistas',
      'Más compartidas',
    ]);
    const chosen = optionNamed('Más gustadas');
    await waitFor(() => expect(document.activeElement).toBe(chosen));
    expect(chosen.getAttribute('aria-selected')).toBe('true');
    expect(chosen.getAttribute('data-state')).toBe('checked');
    // The ✓ — never colour alone — rendered on the chosen row only.
    expect(listbox.querySelectorAll('[data-slot="capsule-select-check"] svg')).toHaveLength(1);
    expect(chosen.querySelector('[data-slot="capsule-select-check"] svg')).not.toBeNull();
  });

  it('opens with the keyboard (Enter, Space, ↓, ↑)', async () => {
    for (const key of ['Enter', ' ', 'ArrowDown', 'ArrowUp']) {
      const { unmount } = render(<Controlled />);
      fireEvent.keyDown(trigger(), { key });
      expect(await screen.findByRole('listbox')).toBeTruthy();
      unmount();
    }
  });

  it('↓ moves to the next option and Enter chooses it, closes the list and returns focus to the trigger', async () => {
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    await screen.findByRole('listbox');
    await waitFor(() => expect(document.activeElement).toBe(optionNamed('Más recientes')));

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(optionNamed('Más gustadas')));

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('liked');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe('Más gustadas');
  });

  it('Esc closes without changing the value and returns focus to the trigger', async () => {
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await openWithClick();
    await waitFor(() => expect(document.activeElement).toBe(optionNamed('Más recientes')));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(optionNamed('Más gustadas')));

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger());
    expect(trigger().textContent).toBe('Más recientes');
  });

  it('a disabled option is aria-disabled, skipped by the arrows and cannot be chosen', async () => {
    const onValueChange = vi.fn();
    render(<Controlled initial="viewed" onValueChange={onValueChange} />);
    await openWithClick();
    const disabled = optionNamed('Más compartidas');
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(disabled);
    expect(onValueChange).not.toHaveBeenCalled();

    await waitFor(() => expect(document.activeElement).toBe(optionNamed('Más vistas')));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    // Nothing enabled below "Más vistas": the focus stays put.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement).toBe(optionNamed('Más vistas'));
  });

  // Radix focuses a row on hover AND on the arrows, and Chrome reports that
  // programmatic focus as `:focus-visible` either way — so the list says which
  // input is in use, and only keyboard use draws the 2px ring (global.css).
  it('marks the open list as keyboard-driven or pointer-driven, following the last input', async () => {
    render(<Controlled />);
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox.getAttribute('data-input')).toBe('keyboard');
    fireEvent.pointerMove(listbox);
    expect(listbox.getAttribute('data-input')).toBe('pointer');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(listbox.getAttribute('data-input')).toBe('keyboard');
  });

  it('a pointer open is pointer-driven', async () => {
    render(<Controlled />);
    fireEvent.pointerDown(trigger(), { button: 0, pointerType: 'mouse' });
    fireEvent.click(trigger());
    expect((await screen.findByRole('listbox')).getAttribute('data-input')).toBe('pointer');
  });

  it('clicking an option chooses it', async () => {
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await openWithClick();
    fireEvent.click(optionNamed('Más vistas'));
    expect(onValueChange).toHaveBeenCalledWith('viewed');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});

describe('CapsuleSelect — groups and an empty value', () => {
  const GROUPED: CapsuleSelectGroup[] = [
    { options: [{ value: '', label: 'Todos' }] },
    { label: 'Primeros', options: [{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }] },
    { label: 'Últimos', options: [{ value: 'y', label: 'Ípsilon' }] },
  ];

  it('names each labelled group (role=group) without a visible header, and draws a separator between groups', async () => {
    render(<Controlled groups={GROUPED} initial="a" />);
    const listbox = await openWithClick();
    const groups = within(listbox).getAllByRole('group');
    expect(groups).toHaveLength(2);
    const firstLabel = document.getElementById(groups[0]!.getAttribute('aria-labelledby')!)!;
    expect(firstLabel.textContent).toBe('Primeros');
    expect(firstLabel.className).toContain('sr-only');
    expect(listbox.querySelectorAll('[data-slot="capsule-select-separator"]')).toHaveLength(2);
  });

  it('an empty-string value is an ordinary option: shown, ✓ when chosen, and reported back as ""', async () => {
    const onValueChange = vi.fn();
    render(<Controlled groups={GROUPED} initial="" onValueChange={onValueChange} />);
    expect(trigger().textContent).toBe('Todos');
    await openWithClick();
    expect(optionNamed('Todos').getAttribute('data-state')).toBe('checked');
    fireEvent.click(optionNamed('Beta'));
    expect(onValueChange).toHaveBeenLastCalledWith('b');

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await openWithClick();
    fireEvent.click(optionNamed('Todos'));
    expect(onValueChange).toHaveBeenLastCalledWith('');
  });
});

describe('CapsuleSelect — inside a <form> (name)', () => {
  it('carries the current value under its name, "" included, and follows every change', async () => {
    const GROUPED: CapsuleSelectGroup[] = [
      { options: [{ value: '', label: 'Todos' }, { value: 'a', label: 'Alfa' }] },
    ];
    const { container } = render(
      <form>
        <Controlled groups={GROUPED} initial="" name="filtro" />
      </form>,
    );
    const form = container.querySelector('form')!;
    expect(new FormData(form).get('filtro')).toBe('');

    await openWithClick();
    fireEvent.click(optionNamed('Alfa'));
    await waitFor(() => expect(new FormData(form).get('filtro')).toBe('a'));
    // Exactly one field under that name — never a second, stale one.
    expect(new FormData(form).getAll('filtro')).toEqual(['a']);
  });

  it('a disabled select submits nothing, like a disabled native select', () => {
    const { container } = render(
      <form>
        <Controlled name="orden" disabled />
      </form>,
    );
    expect(new FormData(container.querySelector('form')!).has('orden')).toBe(false);
  });
});

describe('CapsuleSelect — on a phone (below lg)', () => {
  it('opens the options in the BottomSheet, as a listbox with the chosen option marked', () => {
    stubViewport(false);
    render(<Controlled initial="liked" />);
    const el = trigger();
    expect(el.getAttribute('role')).toBeNull();
    expect(el.getAttribute('aria-haspopup')).toBe('dialog');
    expect(el.getAttribute('aria-expanded')).toBe('false');
    expect(el.getAttribute('aria-label')).toBe('Ordenar por: Más gustadas');

    fireEvent.click(el);
    const sheet = screen.getByTestId('sort-select-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(within(sheet).getByText('Ordenar por')).toBeTruthy();
    const listbox = within(sheet).getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Más recientes', 'Más gustadas', 'Más vistas', 'Más compartidas']);
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    expect(options[0]!.getAttribute('aria-selected')).toBe('false');
    expect(options[1]!.querySelector('[data-slot="capsule-select-check"] svg')).not.toBeNull();
    expect(listbox.querySelectorAll('[data-slot="capsule-select-check"] svg')).toHaveLength(1);
    expect(options[3]!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(options[1]);
  });

  it('choosing in the sheet reports the value, closes the sheet and updates the trigger', async () => {
    stubViewport(false);
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    fireEvent.click(trigger());
    fireEvent.click(within(screen.getByTestId('sort-select-sheet')).getByText('Más vistas'));
    expect(onValueChange).toHaveBeenCalledWith('viewed');
    await waitFor(() => expect(screen.queryByTestId('sort-select-sheet')).toBeNull());
    expect(trigger().textContent).toBe('Más vistas');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    // Focus returns to the trigger, like the desktop list.
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  it('↓/↑ move between the enabled options in the sheet', () => {
    stubViewport(false);
    render(<Controlled />);
    fireEvent.click(trigger());
    const options = within(screen.getByTestId('sort-select-sheet')).getAllByRole('option');
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(options[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(options[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(options[0]!, { key: 'End' });
    expect(document.activeElement).toBe(options[2]);
  });

  it('keeps the anchored list (no sheet) when the caller already lives in a sheet (sheetOnPhone=false)', async () => {
    stubViewport(false);
    render(<Controlled sheetOnPhone={false} />);
    expect(trigger().getAttribute('role')).toBe('combobox');
    await openWithClick();
    expect(screen.queryByTestId('sort-select-sheet')).toBeNull();
  });
});
