// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initMyActivityStatusNotice } from './myActivityStatusNotice';
import { MY_ACTIVITY_STATUS_STORAGE_KEY } from '../ingles/myActivityStatusToasts';

const toastSpy = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastSpy(...args) }));

const LABELS = {
  lang: 'es',
  published: 'Tu actividad «{title}» ya está publicada',
  rejected: 'Tu actividad «{title}» necesita cambios',
  viewLabel: 'Ver',
  fixLabel: 'Corregir',
};

beforeEach(() => {
  toastSpy.mockClear();
  window.localStorage.clear();
});

describe('initMyActivityStatusNotice', () => {
  it('stores the first snapshot silently, with no toast', () => {
    initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'pending_review' }], LABELS, window);
    expect(toastSpy).not.toHaveBeenCalled();
    const stored = window.localStorage.getItem(MY_ACTIVITY_STATUS_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual({ a1: { title: 'Animals', status: 'pending_review' } });
  });

  it('toasts a publish with a "Ver" action that navigates to the practice page', () => {
    window.localStorage.setItem(
      MY_ACTIVITY_STATUS_STORAGE_KEY,
      JSON.stringify({ a1: { title: 'Animals', status: 'pending_review' } }),
    );
    initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'live' }], LABELS, window);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const [message, opts] = toastSpy.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe('Tu actividad «Animals» ya está publicada');
    expect(opts.action.label).toBe('Ver');
  });

  it('toasts a rejection with a "Corregir" action', () => {
    window.localStorage.setItem(
      MY_ACTIVITY_STATUS_STORAGE_KEY,
      JSON.stringify({ a1: { title: 'Animals', status: 'pending_review' } }),
    );
    initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'rejected' }], LABELS, window);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    const [message, opts] = toastSpy.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe('Tu actividad «Animals» necesita cambios');
    expect(opts.action.label).toBe('Corregir');
  });

  it('never toasts an unchanged status', () => {
    window.localStorage.setItem(MY_ACTIVITY_STATUS_STORAGE_KEY, JSON.stringify({ a1: { title: 'Animals', status: 'live' } }));
    initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'live' }], LABELS, window);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('persists the fresh snapshot after toasting', () => {
    window.localStorage.setItem(
      MY_ACTIVITY_STATUS_STORAGE_KEY,
      JSON.stringify({ a1: { title: 'Animals', status: 'pending_review' } }),
    );
    initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'live' }], LABELS, window);
    const stored = JSON.parse(window.localStorage.getItem(MY_ACTIVITY_STATUS_STORAGE_KEY)!);
    expect(stored).toEqual({ a1: { title: 'Animals', status: 'live' } });
  });

  it('never throws when localStorage access itself throws (private mode / blocked storage)', () => {
    const brokenWindow = {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
    } as unknown as Window;
    expect(() => initMyActivityStatusNotice([{ id: 'a1', title: 'Animals', status: 'live' }], LABELS, brokenWindow)).not.toThrow();
    expect(toastSpy).not.toHaveBeenCalled();
  });
});
