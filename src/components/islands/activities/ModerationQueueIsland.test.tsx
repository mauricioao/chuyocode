// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ModerationQueueIsland from './ModerationQueueIsland';
import type { ReviewQueueItem, ReportedActivityItem } from '@/lib/activities/moderation';

afterEach(() => cleanup());
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

const FIRST_PUBLICATION: ReviewQueueItem = {
  revisionId: 'rev-1',
  activityId: 'act-1',
  activityTitle: 'Primera actividad',
  author: { id: 'author-1', email: 'autor@example.com' },
  submittedAt: '2026-01-01T00:00:00Z',
  isEdit: false,
  blocks: [
    {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-uploads/author-1/img.webp', width: 800, height: 600 },
      zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['gato'] }],
    },
  ],
  publishedBlocks: null,
};

const EDIT_ITEM: ReviewQueueItem = {
  revisionId: 'rev-2',
  activityId: 'act-2',
  activityTitle: 'Actividad editada',
  author: { id: 'author-2', email: 'otro@example.com' },
  submittedAt: null,
  isEdit: true,
  blocks: [{ id: 'q1', type: 'quiz', payload: { pools: {}, slots: [{ id: 's1', label: 'nuevo', input: 'text', answer: ['x'] }] } }],
  publishedBlocks: [{ id: 'q0', type: 'quiz', payload: { pools: {}, slots: [{ id: 's0', label: 'viejo', input: 'text', answer: ['y'] }] } }],
};

const REPORTED_ITEM: ReportedActivityItem = {
  activityId: 'act-3',
  activityTitle: 'Actividad reportada',
  author: { id: 'author-3', email: 'reportado@example.com' },
  reports: [
    { id: 'r1', reporterId: 'reporter-1', reason: 'inappropriate', details: 'contenido ofensivo', createdAt: '2026-01-03T00:00:00Z' },
  ],
};

function okJson(body: unknown = { ok: true }) {
  return { ok: true, json: async () => body };
}

describe('ModerationQueueIsland — tabs', () => {
  it('shows counts and defaults to the pending tab', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[REPORTED_ITEM]} />);
    expect(screen.getByTestId('moderation-tab-pending').textContent).toContain('1');
    expect(screen.getByTestId('moderation-tab-reported').textContent).toContain('1');
    expect(screen.getByTestId('moderation-item-rev-1')).toBeTruthy();
  });

  it('switches to the reported tab and shows its items, clearing selection', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[REPORTED_ITEM]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-tab-reported'));

    expect(screen.getByTestId('moderation-item-act-3')).toBeTruthy();
    expect(screen.queryByTestId('moderation-item-rev-1')).toBeNull();
  });

  it('shows the empty state for an empty pending list', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[]} initialReported={[]} />);
    expect(screen.getByTestId('moderation-empty').textContent).toContain('No hay actividades pendientes');
  });
});

describe('ModerationQueueIsland — pending detail', () => {
  it('selecting an item shows its title, author and block preview, answers hidden by default', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));

    expect(screen.getByTestId('moderation-detail').textContent).toContain('Primera actividad');
    expect(screen.getByTestId('moderation-detail').textContent).toContain('autor@example.com');
    expect(screen.getByTestId('moderation-zone-z1').textContent).not.toContain('gato');
  });

  it('toggles the answers on and off', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-toggle-answers'));
    expect(screen.getByTestId('moderation-zone-z1').textContent).toContain('gato');
  });

  it('shows a first-publication item with no published/new toggle', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    expect(screen.getByTestId('moderation-detail').textContent).toContain('Primera publicación');
    expect(screen.queryByTestId('moderation-version-published')).toBeNull();
  });

  it('shows the published/new toggle for an edit, defaulting to the new version', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[EDIT_ITEM]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-2'));

    expect(screen.getByTestId('moderation-detail').textContent).toContain('nuevo');
    fireEvent.click(screen.getByTestId('moderation-version-published'));
    expect(screen.getByTestId('moderation-detail').textContent).toContain('viejo');
  });

  it('resolves a worksheet audio marker via the real audio preview endpoint, so the moderator can listen', () => {
    const withAudio: ReviewQueueItem = {
      ...FIRST_PUBLICATION,
      blocks: [{ ...FIRST_PUBLICATION.blocks[0], audio: [{ id: 'a1', x: 0.5, y: 0.5, path: 'activity-audio-uploads/author-1/a1.webm' }] }] as ReviewQueueItem['blocks'],
    };
    render(<ModerationQueueIsland lang="es" initialPending={[withAudio]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    const player = screen.getByTestId('moderation-audio-player-a1') as HTMLAudioElement;
    expect(player.getAttribute('src')).toBe(
      '/api/actividades/audio?path=' + encodeURIComponent('activity-audio-uploads/author-1/a1.webm'),
    );
  });
});

describe('ModerationQueueIsland — approve', () => {
  it('opens a confirmation, POSTs to aprobar, and removes the item on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okJson());
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-approve-open'));
    expect(screen.getByTestId('moderation-approve-dialog')).toBeTruthy();

    fireEvent.click(screen.getByTestId('moderation-approve-confirm'));

    await waitFor(() => expect(screen.queryByTestId('moderation-item-rev-1')).toBeNull());
    expect(fetch).toHaveBeenCalledWith('/api/admin/actividades/rev-1/aprobar', { method: 'POST' });
  });

  it('shows the confirm button as loading/aria-busy and disables both buttons while approving', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-approve-open'));
    fireEvent.click(screen.getByTestId('moderation-approve-confirm'));

    const confirm = screen.getByTestId('moderation-approve-confirm') as HTMLButtonElement;
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.disabled).toBe(true);

    await waitFor(() => resolveFetch(okJson()));
  });

  it('shows an error and keeps the item when approval fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: 'approve_failed' }) });
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-approve-open'));
    fireEvent.click(screen.getByTestId('moderation-approve-confirm'));

    await waitFor(() => expect(screen.queryByTestId('moderation-approve-error')).not.toBeNull());
    expect(screen.getByTestId('moderation-item-rev-1')).toBeTruthy();
  });
});

describe('ModerationQueueIsland — reject', () => {
  it('requires a note before submitting', async () => {
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-reject-open'));
    fireEvent.click(screen.getByTestId('moderation-reject-confirm'));

    expect(screen.getByTestId('moderation-reject-error').textContent).toContain('Escribe una nota');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('a quick-pick fills the note, and submitting POSTs it and removes the item', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okJson());
    render(<ModerationQueueIsland lang="es" initialPending={[FIRST_PUBLICATION]} initialReported={[]} />);
    fireEvent.click(screen.getByTestId('moderation-item-rev-1'));
    fireEvent.click(screen.getByTestId('moderation-reject-open'));
    fireEvent.click(screen.getByTestId('moderation-reject-quickpick-blurry'));

    const note = screen.getByTestId('moderation-reject-note') as HTMLTextAreaElement;
    expect(note.value.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('moderation-reject-confirm'));

    await waitFor(() => expect(screen.queryByTestId('moderation-item-rev-1')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/actividades/rev-1/rechazar',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('note') }),
    );
  });
});

describe('ModerationQueueIsland — reported detail', () => {
  it('lists reports with reason, details and date', () => {
    render(<ModerationQueueIsland lang="es" initialPending={[]} initialReported={[REPORTED_ITEM]} />);
    fireEvent.click(screen.getByTestId('moderation-tab-reported'));
    fireEvent.click(screen.getByTestId('moderation-item-act-3'));

    const report = screen.getByTestId('moderation-report-r1');
    expect(report.textContent).toContain('Contenido inapropiado');
    expect(report.textContent).toContain('contenido ofensivo');
  });

  it('restores the activity and removes it from the reported list', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okJson());
    render(<ModerationQueueIsland lang="es" initialPending={[]} initialReported={[REPORTED_ITEM]} />);
    fireEvent.click(screen.getByTestId('moderation-tab-reported'));
    fireEvent.click(screen.getByTestId('moderation-item-act-3'));
    fireEvent.click(screen.getByTestId('moderation-restore-open'));
    fireEvent.click(screen.getByTestId('moderation-restore-confirm'));

    await waitFor(() => expect(screen.queryByTestId('moderation-item-act-3')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/actividades/act-3/restaurar',
      expect.objectContaining({ body: JSON.stringify({ action: 'restore' }) }),
    );
  });

  it('removes the activity and takes it off the reported list', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(okJson());
    render(<ModerationQueueIsland lang="es" initialPending={[]} initialReported={[REPORTED_ITEM]} />);
    fireEvent.click(screen.getByTestId('moderation-tab-reported'));
    fireEvent.click(screen.getByTestId('moderation-item-act-3'));
    fireEvent.click(screen.getByTestId('moderation-remove-open'));
    fireEvent.click(screen.getByTestId('moderation-remove-confirm'));

    await waitFor(() => expect(screen.queryByTestId('moderation-item-act-3')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/actividades/act-3/restaurar',
      expect.objectContaining({ body: JSON.stringify({ action: 'remove' }) }),
    );
  });
});
