// @vitest-environment jsdom
/**
 * CommunityFiltersIsland — the catalog filter panel's three fields (Nivel,
 * Tipo, Ordenar por) as the capsule dropdown pattern (owner approval
 * 2026-11-09, maquette `propuestas/desplegables` B2/B3). The panel stays a
 * plain GET form: these tests check what that form SUBMITS, which must be the
 * exact query the three native selects sent before.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import { CommunityFiltersIsland, type CommunityFiltersIslandProps } from './CommunityFiltersIsland';

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

const TYPE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'match', label: 'Une las parejas' },
  { value: 'reorder', label: 'Reordenar' },
  { value: 'cloze', label: 'Completar la frase' },
  { value: 'groupsort', label: 'Ordenar por grupos' },
  { value: 'choose', label: 'Elegir la respuesta' },
];

const SORT_OPTIONS = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'gustadas', label: 'Más gustadas' },
  { value: 'vistas', label: 'Más vistas' },
];

function props(overrides: Partial<CommunityFiltersIslandProps> = {}): CommunityFiltersIslandProps {
  return {
    lang: 'es',
    level: null,
    type: '',
    sort: 'recientes',
    levelLabel: 'Nivel',
    allLevelsLabel: 'Todos los niveles',
    typeLabel: 'Tipo',
    typeOptions: TYPE_OPTIONS,
    sortLabel: 'Ordenar por',
    sortOptions: SORT_OPTIONS,
    ...overrides,
  };
}

/** The island inside the panel's own GET form, with the preserved `q` first — the page's real shape. */
function renderInForm(overrides: Partial<CommunityFiltersIslandProps> = {}) {
  const { container } = render(
    <form method="get" action="/es/ingles/actividades">
      <input type="hidden" name="q" value="" />
      <CommunityFiltersIsland {...props(overrides)} />
      <button type="submit">Aplicar</button>
    </form>,
  );
  return container.querySelector('form')!;
}

/** The query string this form sends on "Aplicar" (a GET form serializes its FormData, in document order). */
function submittedQuery(form: HTMLFormElement): string {
  let query = '';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    query = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
  });
  fireEvent.click(within(form).getByRole('button', { name: 'Aplicar' }));
  return query;
}

async function choose(testId: string, optionText: string) {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(within(await screen.findByRole('listbox')).getByText(optionText));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

describe('CommunityFiltersIsland — initial values', () => {
  it('shows each current value in its capsule, from the props', () => {
    renderInForm({ level: 'B1', type: 'choose', sort: 'vistas' });
    expect(screen.getByTestId('filters-level').textContent).toBe('Intermedio B1');
    expect(screen.getByTestId('filters-type').textContent).toBe('Elegir la respuesta');
    expect(screen.getByTestId('filters-sort').textContent).toBe('Más vistas');
  });

  it('carries the current values in the form, from the props', () => {
    const form = renderInForm({ level: 'B1', type: 'choose', sort: 'vistas' });
    const data = new FormData(form);
    expect(data.get('nivel')).toBe('B1');
    expect(data.get('tipo')).toBe('choose');
    expect(data.get('orden')).toBe('vistas');
  });

  it('shows "Todos los niveles" and "Todos" when nothing filters the feed', () => {
    renderInForm();
    expect(screen.getByTestId('filters-level').textContent).toBe('Todos los niveles');
    expect(screen.getByTestId('filters-type').textContent).toBe('Todos');
    expect(screen.getByTestId('filters-sort').textContent).toBe('Más recientes');
  });

  it('puts each field\'s label above its capsule and names the capsule with it', () => {
    renderInForm();
    for (const [testId, label] of [
      ['filters-level', 'Nivel'],
      ['filters-type', 'Tipo'],
      ['filters-sort', 'Ordenar por'],
    ] as const) {
      const capsule = screen.getByTestId(testId);
      expect(capsule.getAttribute('aria-label')).toBe(label);
      const field = capsule.closest('[data-filters-field]')!;
      expect(field.firstElementChild!.textContent).toBe(label);
    }
  });
});

describe('CommunityFiltersIsland — choosing', () => {
  it('selecting a level, a type and a sort updates the values the form carries', async () => {
    const form = renderInForm();
    await choose('filters-level', 'Básico A2');
    await choose('filters-type', 'Elegir la respuesta');
    await choose('filters-sort', 'Más gustadas');
    const data = new FormData(form);
    expect(data.get('nivel')).toBe('A2');
    expect(data.get('tipo')).toBe('choose');
    expect(data.get('orden')).toBe('gustadas');
    expect(screen.getByTestId('filters-level').textContent).toBe('Básico A2');
  });

  it('"Todos los niveles" submits an empty nivel', async () => {
    const form = renderInForm({ level: 'C1' });
    await choose('filters-level', 'Todos los niveles');
    expect(new FormData(form).get('nivel')).toBe('');
    expect(screen.getByTestId('filters-level').textContent).toBe('Todos los niveles');
  });

  it('"Todos" submits an empty tipo', async () => {
    const form = renderInForm({ type: 'match' });
    await choose('filters-type', 'Todos');
    expect(new FormData(form).get('tipo')).toBe('');
  });

  it('lists every type it is given, "Elegir la respuesta" included', async () => {
    renderInForm();
    fireEvent.click(screen.getByTestId('filters-type'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(TYPE_OPTIONS.map((o) => o.label));
  });

  it('lists the three sort orders', async () => {
    renderInForm();
    fireEvent.click(screen.getByTestId('filters-sort'));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Más recientes', 'Más gustadas', 'Más vistas']);
  });
});

describe('CommunityFiltersIsland — the submitted query', () => {
  it('untouched, sends exactly what the native selects sent: every field, empty ones included', () => {
    const form = renderInForm();
    expect(submittedQuery(form)).toBe('q=&nivel=&tipo=&orden=recientes');
  });

  it('after choosing, sends the chosen values under the same names, in the same order', async () => {
    const form = renderInForm();
    await choose('filters-level', 'Intermedio B2');
    await choose('filters-type', 'Une las parejas');
    await choose('filters-sort', 'Más vistas');
    expect(submittedQuery(form)).toBe('q=&nivel=B2&tipo=match&orden=vistas');
  });

  it('sends one value per name: never a second field from the dropdown itself', () => {
    const form = renderInForm({ level: 'A1', type: 'cloze', sort: 'gustadas' });
    const data = new FormData(form);
    expect(data.getAll('nivel')).toEqual(['A1']);
    expect(data.getAll('tipo')).toEqual(['cloze']);
    expect(data.getAll('orden')).toEqual(['gustadas']);
  });
});

describe('CommunityFiltersIsland — inside the panel', () => {
  it('keeps the anchored list on a phone: the panel is already the bottom sheet there, never a sheet on a sheet', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    renderInForm();
    for (const testId of ['filters-level', 'filters-type', 'filters-sort']) {
      fireEvent.click(screen.getByTestId(testId));
      expect(await screen.findByRole('listbox')).toBeTruthy();
      expect(screen.queryByTestId(`${testId}-sheet`)).toBeNull();
      fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    }
  });

  it('hydrates the server render cleanly, desktop or phone, with the values from the props', async () => {
    for (const desktop of [true, false]) {
      const element = () => <CommunityFiltersIsland {...props({ level: 'A2', type: 'choose', sort: 'gustadas' })} />;
      const result = await renderThenHydrate(element, { matches: () => desktop });
      expect(result.recoverableErrors).toEqual([]);
      expect(result.consoleErrors).toEqual([]);
      expect(result.html).toContain('Básico A2');
      expect(result.html).toContain('Elegir la respuesta');
      expect(result.html).toContain('Más gustadas');
      expect(result.html).toMatch(/<input type="hidden" name="nivel" value="A2"/);
      expect(result.html).toMatch(/<input type="hidden" name="tipo" value="choose"/);
      expect(result.html).toMatch(/<input type="hidden" name="orden" value="gustadas"/);
    }
  });
});
