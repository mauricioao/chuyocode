// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { shouldGoBack, initBackButtons, BACK_BUTTON_ATTR } from './backNavigation';

describe('shouldGoBack', () => {
  it('is false with no previous history entry, even with a same-origin referrer', () => {
    expect(shouldGoBack('https://chuyocode.test/es/ingles', 'https://chuyocode.test', 1)).toBe(
      false,
    );
  });

  it('is false with an empty referrer, even with previous history', () => {
    expect(shouldGoBack('', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is false when the referrer is a different origin', () => {
    expect(shouldGoBack('https://google.com/search', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is true with a same-origin referrer and a previous history entry', () => {
    expect(
      shouldGoBack('https://chuyocode.test/es/ingles/propuestos', 'https://chuyocode.test', 2),
    ).toBe(true);
  });

  it('compares the ORIGIN, not the full URL — a same-origin referrer on a different path still counts', () => {
    expect(shouldGoBack('https://chuyocode.test/en/libros', 'https://chuyocode.test', 3)).toBe(
      true,
    );
  });

  it('is false, not a throw, for a malformed referrer', () => {
    expect(shouldGoBack('not a url', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is false for a subdomain of the same site — origins must match exactly', () => {
    expect(shouldGoBack('https://blog.chuyocode.test/post', 'https://chuyocode.test', 2)).toBe(
      false,
    );
  });
});

describe('initBackButtons', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function renderBackLink(href = '/es/ingles'): HTMLAnchorElement {
    const link = document.createElement('a');
    link.href = href;
    link.setAttribute(BACK_BUTTON_ATTR, '');
    link.textContent = 'Volver';
    document.body.appendChild(link);
    return link;
  }

  it('calls history.back() and prevents the default navigation on a same-origin, non-empty history click', () => {
    Object.defineProperty(document, 'referrer', {
      value: `${window.location.origin}/es/ingles/propuestos`,
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the click alone (real <a> navigation) when there is no previous history entry', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles/propuestos',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 1, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(window.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the click alone when the referrer is a different origin', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://google.com/search',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 3, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('ignores clicks on unrelated links', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const other = document.createElement('a');
    other.href = '/es/libros';
    document.body.appendChild(other);
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('ignores a modified click (e.g. Ctrl+click to open in a new tab)', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
    );

    expect(window.history.back).not.toHaveBeenCalled();
  });
});
