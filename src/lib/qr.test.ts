/**
 * Unit tests for share URLs and QR generation (src/lib/qr.ts).
 *
 * Two properties are worth proving and the rest is the library's problem:
 *   1. the URL is DERIVED FROM THE REQUEST — a different host produces a
 *      different link, and the visitor's own query string does not ride along;
 *   2. the QR is DETERMINISTIC — the same URL always yields byte-identical
 *      markup, and different URLs do not.
 *
 * Appearance is deliberately not asserted: the module geometry is uqr's
 * contract, and a golden string here would break on a patch release without
 * anything actually being wrong.
 */
import { describe, it, expect } from 'vitest';
import { QR_OPTIONS, qrSvg, shareUrl } from './qr';

const PATH = '/es/ingles/A2/past-simple/refactor-the-legacy-module';

describe('shareUrl', () => {
  it('keeps the origin the request arrived on', () => {
    expect(shareUrl(new URL(`https://chuyocode.com${PATH}`))).toBe(
      `https://chuyocode.com${PATH}`,
    );
  });

  it('follows the request host instead of a hardcoded one', () => {
    // The whole point: the same build serves production, branch deploys and
    // Netlify previews. A QR generated on a preview must point AT that preview,
    // or nobody can tell it is wrong until a classroom lands on the wrong page.
    const preview = shareUrl(new URL(`https://deploy-preview-12--chuyo.netlify.app${PATH}`));
    const prod = shareUrl(new URL(`https://chuyocode.com${PATH}`));
    expect(preview).not.toBe(prod);
    expect(preview.startsWith('https://deploy-preview-12--chuyo.netlify.app')).toBe(true);
  });

  it('preserves a non-default port and a plain-http dev origin', () => {
    expect(shareUrl(new URL(`http://localhost:4321${PATH}`))).toBe(
      `http://localhost:4321${PATH}`,
    );
  });

  it('drops the query string', () => {
    // The teacher's `?utm_source=...` is how THEY arrived; sharing it would
    // attribute a room of students to their campaign.
    expect(shareUrl(new URL(`https://chuyocode.com${PATH}?utm_source=twitter&x=1`))).toBe(
      `https://chuyocode.com${PATH}`,
    );
  });

  it('drops the fragment', () => {
    expect(shareUrl(new URL(`https://chuyocode.com${PATH}#answers`))).toBe(
      `https://chuyocode.com${PATH}`,
    );
  });

  it('drops both at once', () => {
    expect(shareUrl(new URL(`https://chuyocode.com${PATH}?a=1#b`))).toBe(
      `https://chuyocode.com${PATH}`,
    );
  });
});

describe('qrSvg', () => {
  const url = `https://chuyocode.com${PATH}`;

  it('is deterministic for a given URL', () => {
    // A QR that varied between two renders of the same page would mean the
    // markup could not be cached or diffed, and would make every other
    // assertion here meaningless.
    expect(qrSvg(url)).toBe(qrSvg(url));
  });

  it('encodes different URLs differently', () => {
    // Triangulation: without this, a function that ignored its input and
    // returned a constant would pass the determinism test above.
    expect(qrSvg(url)).not.toBe(qrSvg(`${url}-other`));
  });

  it('returns a self-sizing svg with a viewBox and no width/height', () => {
    // Scoped to the OPENING TAG. The background `<rect>` legitimately carries
    // width/height; what must be absent is a fixed size on the `<svg>` itself,
    // because the dialog sizes it with CSS.
    const openingTag = (qrSvg(url) ?? '').slice(0, (qrSvg(url) ?? '').indexOf('>') + 1);
    expect(openingTag.startsWith('<svg')).toBe(true);
    expect(openingTag).toContain('viewBox=');
    expect(openingTag).not.toContain('width=');
    expect(openingTag).not.toContain('height=');
  });

  it('paints an explicit white background, whatever the site theme is', () => {
    // This site is dark. A QR rendered in theme colours is a QR that scanners
    // reject, so the white rect (which spans the quiet zone) is load-bearing.
    expect(qrSvg(url)).toContain('fill="white"');
  });

  it('returns null for empty input rather than an empty code', () => {
    expect(qrSvg('')).toBeNull();
  });

  it('never throws — it reports failure as null', () => {
    // The only realistic failure is data beyond QR version 40 capacity. This
    // runs on the exercise page's SSR path, where a throw would replace a
    // graded exercise with a 500 over a decoration.
    expect(() => qrSvg('x'.repeat(10_000))).not.toThrow();
    expect(qrSvg('x'.repeat(10_000))).toBeNull();
  });
});

describe('QR_OPTIONS', () => {
  it('uses error correction M and the spec quiet zone', () => {
    // Asserted because both are deliberate departures from uqr's defaults
    // ('L' and a 1-module border), chosen for a code read off a projector.
    expect(QR_OPTIONS.ecc).toBe('M');
    expect(QR_OPTIONS.border).toBe(4);
  });
});
