// @vitest-environment jsdom
/**
 * TurnstileWidget tests.
 *
 * `loadTurnstileScript`'s shared promise is module-level state, so every
 * test EXCEPT the dedup test below stubs `window.turnstile` BEFORE
 * rendering — the loader's very first check (`if (window.turnstile) return
 * Promise.resolve()`) then short-circuits regardless of whatever an earlier
 * test left the shared promise as, keeping every test here order-
 * independent. Only the dedup test exercises the real "inject a `<script>`"
 * path, and it is self-contained: it starts with `window.turnstile` unset
 * (restored by `afterEach` below) and ends by simulating the script's own
 * `load` event, so it proves both the dedup AND the eventual render in one
 * place rather than needing a second test to depend on the same state.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import TurnstileWidget from './TurnstileWidget';

interface FakeRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme: string;
  language: string;
}

interface FakeTurnstile {
  render: ReturnType<typeof vi.fn<(container: HTMLElement, options: FakeRenderOptions) => string>>;
  remove: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
}

/** Install a `window.turnstile` stub so the loader skips the script tag entirely. */
function stubTurnstileGlobal(): FakeTurnstile {
  const fake: FakeTurnstile = {
    render: vi.fn(() => 'widget-id-1'),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  (window as unknown as { turnstile?: FakeTurnstile }).turnstile = fake;
  return fake;
}

function scriptTags(): NodeListOf<HTMLScriptElement> {
  return document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]');
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { turnstile?: FakeTurnstile }).turnstile;
  scriptTags().forEach((el) => el.remove());
  vi.restoreAllMocks();
});

describe('TurnstileWidget — container', () => {
  it('renders a stable container element', () => {
    stubTurnstileGlobal();
    const { getByTestId } = render(
      <TurnstileWidget siteKey="1x00000000000000000000AA" language="es" onToken={() => {}} resetSignal={0} />,
    );
    expect(getByTestId('turnstile-widget')).toBeTruthy();
  });

  it('skips the script tag entirely when window.turnstile already exists', async () => {
    const fake = stubTurnstileGlobal();
    render(
      <TurnstileWidget siteKey="1x00000000000000000000AA" language="es" onToken={() => {}} resetSignal={0} />,
    );

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    expect(scriptTags()).toHaveLength(0);
  });
});

describe('TurnstileWidget — script loading', () => {
  it('injects the script exactly once for two simultaneous widgets, then renders both', async () => {
    render(
      <>
        <TurnstileWidget siteKey="key-a" language="es" onToken={() => {}} resetSignal={0} />
        <TurnstileWidget siteKey="key-b" language="es" onToken={() => {}} resetSignal={0} />
      </>,
    );

    expect(scriptTags()).toHaveLength(1);

    // Simulate the real script executing (it defines the global) and the
    // browser firing the tag's `load` event.
    const fake = stubTurnstileGlobal();
    scriptTags()[0].dispatchEvent(new Event('load'));

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(2));
    const sitekeys = fake.render.mock.calls.map(([, options]) => options.sitekey).sort();
    expect(sitekeys).toEqual(['key-a', 'key-b']);
  });
});

describe('TurnstileWidget — render options', () => {
  it('calls turnstile.render with the site key, language and a dark theme', async () => {
    const fake = stubTurnstileGlobal();
    render(
      <TurnstileWidget siteKey="1x00000000000000000000AA" language="en" onToken={() => {}} resetSignal={0} />,
    );

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    const [, options] = fake.render.mock.calls[0];
    expect(options.sitekey).toBe('1x00000000000000000000AA');
    expect(options.language).toBe('en');
    expect(options.theme).toBe('dark');
  });

  it('reports the token via onToken when the widget succeeds', async () => {
    const fake = stubTurnstileGlobal();
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="key" language="es" onToken={onToken} resetSignal={0} />);

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    fake.render.mock.calls[0][1].callback('tok-123');

    expect(onToken).toHaveBeenCalledWith('tok-123');
  });

  it('reports null via onToken on expiry', async () => {
    const fake = stubTurnstileGlobal();
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="key" language="es" onToken={onToken} resetSignal={0} />);

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    fake.render.mock.calls[0][1]['expired-callback']();

    expect(onToken).toHaveBeenCalledWith(null);
  });

  it('reports null via onToken on a widget error', async () => {
    const fake = stubTurnstileGlobal();
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="key" language="es" onToken={onToken} resetSignal={0} />);

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    fake.render.mock.calls[0][1]['error-callback']();

    expect(onToken).toHaveBeenCalledWith(null);
  });
});

describe('TurnstileWidget — reset and unmount', () => {
  it('does not reset on the initial resetSignal value', async () => {
    const fake = stubTurnstileGlobal();
    render(<TurnstileWidget siteKey="key" language="es" onToken={() => {}} resetSignal={0} />);

    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));
    expect(fake.reset).not.toHaveBeenCalled();
  });

  it('resets the widget when resetSignal changes', async () => {
    const fake = stubTurnstileGlobal();
    const { rerender } = render(
      <TurnstileWidget siteKey="key" language="es" onToken={() => {}} resetSignal={0} />,
    );
    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));

    rerender(<TurnstileWidget siteKey="key" language="es" onToken={() => {}} resetSignal={1} />);

    expect(fake.reset).toHaveBeenCalledWith('widget-id-1');
  });

  it('removes the widget on unmount', async () => {
    const fake = stubTurnstileGlobal();
    const { unmount } = render(
      <TurnstileWidget siteKey="key" language="es" onToken={() => {}} resetSignal={0} />,
    );
    await waitFor(() => expect(fake.render).toHaveBeenCalledTimes(1));

    unmount();

    expect(fake.remove).toHaveBeenCalledWith('widget-id-1');
  });
});
