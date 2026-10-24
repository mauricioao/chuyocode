// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('@/lib/activities/imageUpload', async () => {
  const actual = await vi.importActual<typeof import('@/lib/activities/imageUpload')>('@/lib/activities/imageUpload');
  return { ...actual, uploadActivityImage: vi.fn() };
});

import BackgroundPicker from './BackgroundPicker';
import { uploadActivityImage } from '@/lib/activities/imageUpload';
import type { BlockBackground } from '@/lib/activities/blocks';

afterEach(() => cleanup());
beforeEach(() => vi.clearAllMocks());

const FILE = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

function openPanel() {
  fireEvent.click(screen.getByTestId('background-picker-trigger'));
}

describe('BackgroundPicker — trigger and panel', () => {
  it('starts closed', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    expect(screen.queryByTestId('background-picker-panel')).toBeNull();
  });

  it('opens the panel on click, and closes it again on a second click', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    expect(screen.getByTestId('background-picker-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('background-picker-trigger'));
    expect(screen.queryByTestId('background-picker-panel')).toBeNull();
  });

  it('closes on Escape', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('background-picker-panel')).toBeNull();
  });

  it('closes on an outside click', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <BackgroundPicker lang="es" value={undefined} onChange={() => {}} />
      </div>,
    );
    openPanel();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('background-picker-panel')).toBeNull();
  });

  it('shows the button label in English under lang="en"', () => {
    render(<BackgroundPicker lang="en" value={undefined} onChange={() => {}} />);
    expect(screen.getByTestId('background-picker-trigger').textContent).toContain('Background');
  });
});

describe('BackgroundPicker — presets', () => {
  it('lists all five presets', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    for (const preset of ['sky', 'mint', 'sun', 'lavender', 'slate']) {
      expect(screen.getByTestId(`background-picker-preset-${preset}`)).toBeTruthy();
    }
  });

  it('calls onChange with the preset when clicked', () => {
    const onChange = vi.fn();
    render(<BackgroundPicker lang="es" value={undefined} onChange={onChange} />);
    openPanel();
    fireEvent.click(screen.getByTestId('background-picker-preset-mint'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', preset: 'mint' });
  });

  it('calling "Ninguno" clears the background', () => {
    const onChange = vi.fn();
    const value: BlockBackground = { kind: 'preset', preset: 'sky' };
    render(<BackgroundPicker lang="es" value={value} onChange={onChange} />);
    openPanel();
    fireEvent.click(screen.getByTestId('background-picker-none'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('BackgroundPicker — upload (purpose=background)', () => {
  it('shows "Subir imagen" when no image is set', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    expect(screen.getByTestId('background-picker-upload').textContent).toBe('Subir imagen');
  });

  it('uploads with purpose "background" and calls onChange with the resulting image', async () => {
    vi.mocked(uploadActivityImage).mockResolvedValue({
      ok: true,
      image: { path: 'activity-uploads/u1/background-x.webp', width: 1200, height: 800 },
    });
    const onChange = vi.fn();
    render(<BackgroundPicker lang="es" value={undefined} onChange={onChange} />);
    openPanel();
    const input = screen.getByTestId('background-picker-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [FILE] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(uploadActivityImage).toHaveBeenCalledWith(FILE, 'background');
    expect(onChange).toHaveBeenCalledWith({
      kind: 'image',
      path: 'activity-uploads/u1/background-x.webp',
      width: 1200,
      height: 800,
    });
  });

  it('shows the localized error message on a failed upload, and never calls onChange', async () => {
    vi.mocked(uploadActivityImage).mockResolvedValue({ ok: false, errorCode: 'invalid_dimensions' });
    const onChange = vi.fn();
    render(<BackgroundPicker lang="es" value={undefined} onChange={onChange} />);
    openPanel();
    const input = screen.getByTestId('background-picker-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [FILE] } });

    await waitFor(() => expect(screen.getByTestId('background-picker-error')).toBeTruthy());
    expect(screen.getByTestId('background-picker-error').textContent).toBe(
      'La imagen debe medir entre 200 y 2400 píxeles de lado.',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with an image already chosen, shows a thumbnail plus "Cambiar" and "Quitar"', () => {
    const value: BlockBackground = { kind: 'image', path: 'activity-uploads/u1/background-x.webp', width: 1200, height: 800 };
    render(<BackgroundPicker lang="es" value={value} onChange={() => {}} />);
    openPanel();
    expect(screen.getByTestId('background-picker-thumb')).toBeTruthy();
    expect(screen.getByTestId('background-picker-change')).toBeTruthy();
    expect(screen.getByTestId('background-picker-remove')).toBeTruthy();
    expect(screen.queryByTestId('background-picker-upload')).toBeNull();
  });

  it('"Quitar" clears the background', () => {
    const onChange = vi.fn();
    const value: BlockBackground = { kind: 'image', path: 'activity-uploads/u1/background-x.webp', width: 1200, height: 800 };
    render(<BackgroundPicker lang="es" value={value} onChange={onChange} />);
    openPanel();
    fireEvent.click(screen.getByTestId('background-picker-remove'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe('BackgroundPicker — floating position (owner bug: opening the panel pushed the scaled preview down ~190px)', () => {
  it('keeps the glass surface and the absolute positioning on separate elements, so the cascade cannot fight', () => {
    // `.ingles-glass` (global.css) sets an UNLAYERED `position: relative` —
    // plain CSS outside any `@layer` always wins over a LAYERED Tailwind
    // utility like `.absolute` (`@layer utilities`), regardless of class
    // order in the string. A panel carrying BOTH classes at once therefore
    // actually rendered `position: relative`, in normal flow, pushing
    // everything below it down by the panel's own ~190px height. The fix
    // keeps the glass recipe and the floating position on two different
    // elements so the two rules never land on the same node.
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    const panel = screen.getByTestId('background-picker-panel');
    expect(panel.className).toContain('ingles-glass');
    expect(panel.className).not.toMatch(/\babsolute\b/);
    const wrapper = panel.parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/\babsolute\b/);
    expect(wrapper.className).not.toContain('ingles-glass');
  });

  it('right-aligns the floating wrapper under the trigger (owner spec)', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    const wrapper = screen.getByTestId('background-picker-panel').parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/\bright-0\b/);
    expect(wrapper.className).not.toMatch(/\bleft-0\b/);
  });
});

describe('BackgroundPicker — accessibility (trigger <-> panel wiring)', () => {
  it('wires aria-controls from the trigger to the panel', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    openPanel();
    const trigger = screen.getByTestId('background-picker-trigger');
    const panel = screen.getByTestId('background-picker-panel');
    expect(panel.id).toBeTruthy();
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('moves focus into the panel on open, and returns it to the trigger once it closes', () => {
    render(<BackgroundPicker lang="es" value={undefined} onChange={() => {}} />);
    const trigger = screen.getByTestId('background-picker-trigger');
    trigger.focus();
    openPanel();
    expect(document.activeElement).toBe(screen.getByTestId('background-picker-panel'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
