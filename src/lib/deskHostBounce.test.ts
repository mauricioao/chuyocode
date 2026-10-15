import { describe, it, expect } from 'vitest';
import { deskHostBounceHtml, deskHostBounceScript } from '@lib/deskHostBounce';

const LABELS = { title: 'Ejercicios de inglés', continueLabel: 'Volver al escritorio' };

/** Runs the bounce script against a fake embedded window — a host at `window.parent`. */
function runEmbedded(): { source: unknown; type: unknown; targetOrigin: unknown } | null {
  let posted: { source: unknown; type: unknown; targetOrigin: unknown } | null = null;
  const parent = {
    postMessage: (message: { source: unknown; type: unknown }, targetOrigin: unknown) => {
      posted = { source: message.source, type: message.type, targetOrigin };
    },
  };
  const self = {};
  const fakeWindow = { parent, self, top: parent, location: { origin: 'http://localhost:4321' } };
  new Function('window', deskHostBounceScript('/es/ingles'))(fakeWindow);
  return posted;
}

/** Runs the bounce script against a fake TOP window — no parent at all. */
function runNotEmbedded(): string {
  const self: { location: { href: string } } = { location: { href: 'http://localhost:4321/es/ingles' } };
  const fakeWindow = { parent: self, self, top: self, location: { origin: 'http://localhost:4321' } };
  new Function('window', deskHostBounceScript('/es/ingles'))(fakeWindow);
  return self.location.href;
}

describe('deskHostBounceHtml', () => {
  it('links the whole tab to the plain hub as the no-JS way out', () => {
    const html = deskHostBounceHtml('es', LABELS);

    expect(html).toContain(
      '<a id="desk-host-bounce-continue" href="/es/ingles" target="_top">Volver al escritorio</a>',
    );
    expect(html).toContain('<html lang="es">');
  });

  it('escapes its labels', () => {
    const html = deskHostBounceHtml('es', { ...LABELS, continueLabel: '<b>x</b> & "y"' });

    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });

  it('never renders any desk markup', () => {
    const html = deskHostBounceHtml('es', LABELS);

    expect(html).not.toContain('data-desk-window');
    expect(html).not.toContain('data-desk-window-open');
  });
});

describe('deskHostBounceScript', () => {
  it('asks the host to close this window when embedded, via the shared desk-window message envelope', () => {
    const posted = runEmbedded();

    expect(posted).toEqual({ source: 'desk-window', type: 'close', targetOrigin: 'http://localhost:4321' });
  });

  it('sends the real tab to the plain hub when there is no host at all', () => {
    const href = runNotEmbedded();

    expect(href).toBe('http://localhost:4321/es/ingles');
  });
});
