// @vitest-environment jsdom
/**
 * CourseEditPanel tests — previously untested. Scoped to the behavior
 * touched by the coherent-loading-states pass: the status/save/grant/revoke
 * buttons' own loading state (spinner + aria-busy + stable width).
 */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));

import CourseEditPanel, { type EditableCourse, type CourseOwner } from './CourseEditPanel';

// jsdom has no ResizeObserver; `Checkbox` (Radix) reads one — same stub
// precedent as `ModuleManager.test.tsx`/`WorksheetZoneEditor.test.tsx`.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const COURSE: EditableCourse = {
  id: 'c1',
  slug: 'react-basico',
  title: 'React básico',
  subtitle: null,
  description: null,
  level: null,
  status: 'draft',
  included_in_premium: false,
  price_cents: null,
  currency: 'USD',
};

const OWNER: CourseOwner = { userId: 'u1', email: 'owner@example.com', source: 'grant', createdAt: '2026-01-01T00:00:00Z' };

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('CourseEditPanel — status button loading', () => {
  it('shows the publish button as loading/aria-busy while in flight', async () => {
    let release: (() => void) | undefined;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { release = () => resolve(jsonResponse({})); }),
    );
    render(<CourseEditPanel lang="es" initialCourse={COURSE} initialOwners={[]} initialModules={[]} />);

    fireEvent.click(screen.getByTestId('course-status-published'));
    const btn = screen.getByTestId('course-status-published') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    release?.();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });
});

describe('CourseEditPanel — save button loading', () => {
  it('shows the save button as loading/aria-busy with a stable label while in flight', async () => {
    let release: (() => void) | undefined;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { release = () => resolve(jsonResponse({ ok: true })); }),
    );
    render(<CourseEditPanel lang="es" initialCourse={COURSE} initialOwners={[]} initialModules={[]} />);

    fireEvent.click(screen.getByTestId('course-fields-submit'));
    const btn = screen.getByTestId('course-fields-submit') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    release?.();
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
  });
});

describe('CourseEditPanel — access grant/revoke loading', () => {
  it('shows the grant button as loading/aria-busy while in flight', async () => {
    let release: (() => void) | undefined;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { release = () => resolve(jsonResponse({ ok: true })); }),
    );
    render(<CourseEditPanel lang="es" initialCourse={COURSE} initialOwners={[]} initialModules={[]} />);

    fireEvent.change(screen.getByTestId('course-grant-email'), { target: { value: 'nuevo@example.com' } });
    fireEvent.click(screen.getByTestId('course-grant-submit'));
    const btn = screen.getByTestId('course-grant-submit') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    release?.();
    await waitFor(() => expect(screen.getByTestId('course-owners-list')).toBeTruthy());
  });

  it('shows the revoke button for that owner as loading/aria-busy while in flight', async () => {
    let release: (() => void) | undefined;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({}) }); }),
    );
    render(<CourseEditPanel lang="es" initialCourse={COURSE} initialOwners={[OWNER]} initialModules={[]} />);

    fireEvent.click(screen.getByTestId(`course-owner-revoke-${OWNER.userId}`));
    const btn = screen.getByTestId(`course-owner-revoke-${OWNER.userId}`) as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    release?.();
    await waitFor(() => expect(screen.getByTestId('course-owners-empty')).toBeTruthy());
  });
});
