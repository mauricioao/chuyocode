// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { toast } from 'sonner';
import Toaster from './Toaster';

function stubMatchMedia(matchesNarrow: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matchesNarrow,
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  return listeners;
}

afterEach(() => {
  // sonner keeps its toast queue in a module-level store outside React
  // state, independent per `id` — clear it so one test's toast cannot leak
  // into the next (unmounting the <Toaster/> React tree does not dismiss
  // already-queued toasts).
  act(() => {
    toast.dismiss();
  });
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Toaster', () => {
  beforeEach(() => {
    stubMatchMedia(false);
  });

  it('displays a toast pushed via sonner\'s toast() API', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('Enlace copiado');
    });
    expect(await screen.findByText('Enlace copiado')).not.toBeNull();
  });

  it('renders bottom-right by default (desktop)', async () => {
    render(<Toaster />);
    act(() => {
      toast('hola');
    });
    await screen.findByText('hola');
    const region = document.querySelector('[data-sonner-toaster]');
    expect(region?.getAttribute('data-x-position')).toBe('right');
    expect(region?.getAttribute('data-y-position')).toBe('bottom');
  });

  it('switches to bottom-center on a narrow (phone) viewport', async () => {
    stubMatchMedia(true);
    render(<Toaster />);
    act(() => {
      toast('hola');
    });
    await screen.findByText('hola');
    const region = document.querySelector('[data-sonner-toaster]');
    expect(region?.getAttribute('data-x-position')).toBe('center');
    expect(region?.getAttribute('data-y-position')).toBe('bottom');
  });

  it('gives a success toast the accent-filled CheckCircle icon', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('listo');
    });
    await screen.findByText('listo');
    const icon = document.querySelector('[data-icon] svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('class')).toContain('text-success');
  });
});
