// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import MisActividadesIsland, { type MisActividadesActivity } from './MisActividadesIsland';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QR = '<svg data-testid="qr-svg" viewBox="0 0 45 45"><path d="M4,4h1v1h-1z"/></svg>';

const DRAFT: MisActividadesActivity = {
  id: 'act-draft',
  title: 'Mi borrador',
  level: null,
  status: 'draft',
  blockCount: 2,
  reviewNote: null,
  hasPendingRevision: false,
  share: null,
};

const LIVE_WITH_PENDING: MisActividadesActivity = {
  id: 'act-live',
  title: 'Publicada',
  level: 'B1',
  status: 'live',
  blockCount: 3,
  reviewNote: null,
  hasPendingRevision: true,
  share: {
    url: 'https://chuyocode.test/es/ingles/actividades/act-live',
    qr: QR,
    whatsappHref: 'https://wa.me/?text=Publicada%20https%3A%2F%2Fchuyocode.test%2Fes%2Fingles%2Factividades%2Fact-live',
  },
};

const REJECTED: MisActividadesActivity = {
  id: 'act-rejected',
  title: 'Rechazada',
  level: 'A2',
  status: 'rejected',
  blockCount: 1,
  reviewNote: 'Falta una zona en la hoja 2.',
  hasPendingRevision: false,
  share: null,
};

describe('MisActividadesIsland — empty state', () => {
  it('shows the empty message and a create-activity CTA when there is nothing', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[]} />);
    expect(screen.getByTestId('mis-actividades-empty')).toBeTruthy();
    const cta = screen.getByText('Crear actividad');
    expect(cta.getAttribute('href')).toBe('/es/crear');
  });
});

describe('MisActividadesIsland — listing', () => {
  it('renders each activity with its title, status badge, level and block count', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);
    const row = screen.getByTestId(`activity-row-${DRAFT.id}`);
    expect(row.textContent).toContain('Mi borrador');
    expect(screen.getByTestId(`activity-status-${DRAFT.id}`).textContent).toContain('Borrador');
    expect(row.textContent).toContain('Sin nivel');
    expect(row.textContent).toContain('2 bloques');
  });

  it('shows the "cambios en revisión" note only for a live activity with a pending revision', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[LIVE_WITH_PENDING, DRAFT]} />);
    expect(screen.getByTestId(`activity-pending-${LIVE_WITH_PENDING.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`activity-pending-${DRAFT.id}`)).toBeNull();
  });

  it('shows the reviewer note only for a rejected activity', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[REJECTED, DRAFT]} />);
    expect(screen.getByTestId(`activity-review-note-${REJECTED.id}`).textContent).toContain(
      'Falta una zona en la hoja 2.',
    );
    expect(screen.queryByTestId(`activity-review-note-${DRAFT.id}`)).toBeNull();
  });

  it('links Editar to the creator editor for every activity', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);
    expect(screen.getByTestId(`activity-edit-${DRAFT.id}`).getAttribute('href')).toBe(
      `/es/crear/${DRAFT.id}`,
    );
  });

  it('only shows Ver for a live activity', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT, LIVE_WITH_PENDING]} />);
    expect(screen.queryByTestId(`activity-view-${DRAFT.id}`)).toBeNull();
    expect(screen.getByTestId(`activity-view-${LIVE_WITH_PENDING.id}`).getAttribute('href')).toBe(
      `/es/ingles/actividades/${LIVE_WITH_PENDING.id}`,
    );
  });
});

describe('MisActividadesIsland — share (D8)', () => {
  it('renders "Compartir" only for a live activity with share data', () => {
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT, LIVE_WITH_PENDING]} />);
    expect(screen.queryByTestId(`activity-share-${DRAFT.id}`)).toBeNull();
    expect(screen.getByTestId(`activity-share-${LIVE_WITH_PENDING.id}`)).toBeTruthy();
  });

  it('opens the dialog with the server-computed url, QR and WhatsApp link', async () => {
    render(<MisActividadesIsland lang="es" initialActivities={[LIVE_WITH_PENDING]} />);
    const wrapper = screen.getByTestId(`activity-share-${LIVE_WITH_PENDING.id}`);
    fireEvent.click(wrapper.querySelector('[data-testid="exercise-share"]') as HTMLElement);

    // The dialog content portals to `document.body` (Radix Dialog), so it is
    // queried via `screen`, not scoped to `wrapper` — `wrapper` only holds
    // the trigger.
    expect(await screen.findByTestId('qr-svg')).toBeTruthy();
    expect(screen.getByText(LIVE_WITH_PENDING.share!.url)).toBeTruthy();
    const whatsapp = screen.getByTestId('exercise-share-whatsapp');
    expect(whatsapp.getAttribute('href')).toBe(LIVE_WITH_PENDING.share!.whatsappHref);
  });

  it('notes that the recipient needs to sign in', async () => {
    render(<MisActividadesIsland lang="es" initialActivities={[LIVE_WITH_PENDING]} />);
    const wrapper = screen.getByTestId(`activity-share-${LIVE_WITH_PENDING.id}`);
    fireEvent.click(wrapper.querySelector('[data-testid="exercise-share"]') as HTMLElement);
    const note = await screen.findByTestId('exercise-share-note');
    expect(note.textContent).toContain('iniciar sesión');
  });
});

describe('MisActividadesIsland — delete', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('opens a confirmation dialog before deleting anything', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    expect(screen.getByTestId('delete-activity-dialog')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels without deleting', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    fireEvent.click(screen.getByTestId('delete-dialog-cancel'));
    expect(screen.queryByTestId('delete-activity-dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId(`activity-row-${DRAFT.id}`)).toBeTruthy();
  });

  it('shows the confirm button as loading/aria-busy and disables both buttons while deleting', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      ),
    );
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    fireEvent.click(screen.getByTestId('delete-dialog-confirm'));

    const confirm = screen.getByTestId('delete-dialog-confirm') as HTMLButtonElement;
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.disabled).toBe(true);
    expect((screen.getByTestId('delete-dialog-cancel') as HTMLButtonElement).disabled).toBe(true);

    await act(async () => resolveFetch({ ok: true, json: async () => ({ ok: true }) }));
  });

  it('deletes on confirm, removing the row and posting to the eliminar endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT, LIVE_WITH_PENDING]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-dialog-confirm'));
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/actividades/${DRAFT.id}/eliminar`, { method: 'POST' });
    expect(screen.queryByTestId(`activity-row-${DRAFT.id}`)).toBeNull();
    expect(screen.getByTestId(`activity-row-${LIVE_WITH_PENDING.id}`)).toBeTruthy();
  });

  it('shows an inline error and keeps the row when the delete fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-dialog-confirm'));
    });

    expect(screen.getByTestId('delete-activity-error')).toBeTruthy();
    expect(screen.getByTestId(`activity-row-${DRAFT.id}`)).toBeTruthy();
  });

  it('shows the empty state once the last activity is deleted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MisActividadesIsland lang="es" initialActivities={[DRAFT]} />);

    fireEvent.click(screen.getByTestId(`activity-delete-${DRAFT.id}`));
    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-dialog-confirm'));
    });

    expect(screen.getByTestId('mis-actividades-empty')).toBeTruthy();
  });
});

describe('MisActividadesIsland — locale', () => {
  it('renders English copy for lang="en"', () => {
    render(<MisActividadesIsland lang="en" initialActivities={[]} />);
    expect(screen.getByTestId('mis-actividades-empty').textContent).toContain('No activities created yet.');
  });
});
