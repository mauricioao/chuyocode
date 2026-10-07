import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@lib/authRedirect';
import { windowAuthBounceHtml, windowAuthBounceScript } from '@lib/windowAuthBounce';

const LABELS = { title: 'Entrar', redirecting: 'Tu sesión expiró…', continueLabel: 'Continuar' };

/** Runs the bounce script against a fake window: a host tab on `hostPath` with the script inside its iframe. */
function runInsideIframe(hostPath: string): string | null {
  const top = { location: { href: `http://localhost:4321${hostPath}`, ...splitPath(hostPath) } };
  const fakeWindow = { top, self: {}, location: { origin: 'http://localhost:4321' } };
  new Function('window', windowAuthBounceScript('/es/auth/entrar'))(fakeWindow);
  const href = top.location.href;
  return href.startsWith('http://localhost:4321/es/auth/entrar') ? href : null;
}

function splitPath(path: string): { pathname: string; search: string } {
  const url = new URL(path, 'http://localhost:4321');
  return { pathname: url.pathname, search: url.search };
}

describe('windowAuthBounceHtml', () => {
  it('links the whole tab to the sign-in page as the no-JS way out', () => {
    const html = windowAuthBounceHtml('es', LABELS);

    expect(html).toContain('<a id="desk-window-auth-continue" href="/es/auth/entrar" target="_top">Continuar</a>');
    expect(html).toContain('<html lang="es">');
  });

  it('escapes its labels', () => {
    const html = windowAuthBounceHtml('es', { ...LABELS, redirecting: '<b>x</b> & "y"' });

    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });
});

describe('windowAuthBounceScript', () => {
  it('sends the tab to sign in with next = the desk path the window sat on, which safeNextPath accepts', () => {
    const href = runInsideIframe('/es/ingles/actividades/abc?nivel=A2');

    expect(href).not.toBeNull();
    const next = new URL(href!).searchParams.get('next');
    expect(next).toBe('/es/ingles/actividades/abc?nivel=A2');
    expect(safeNextPath(next)).toBe('/es/ingles/actividades/abc?nivel=A2');
  });

  it('does nothing when the page is not inside an iframe', () => {
    const self = { location: { href: 'http://localhost:4321/es/auth/entrar' } };
    const fakeWindow = { top: self, self, location: { origin: 'http://localhost:4321' } };

    new Function('window', windowAuthBounceScript('/es/auth/entrar'))(fakeWindow);

    expect(self.location.href).toBe('http://localhost:4321/es/auth/entrar');
  });
});
