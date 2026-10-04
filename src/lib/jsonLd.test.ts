import { describe, it, expect } from 'vitest';
import { toJsonLd } from './jsonLd';

describe('toJsonLd', () => {
  it('serializes a plain object to valid, parseable JSON', () => {
    const data = { '@context': 'https://schema.org', '@type': 'Book', name: 'Clean Code' };
    const out = toJsonLd(data);
    expect(JSON.parse(out)).toEqual(data);
  });

  it('preserves the expected @type after a round trip', () => {
    const out = toJsonLd({ '@type': 'NewsArticle', headline: 'Title' });
    expect(JSON.parse(out)['@type']).toBe('NewsArticle');
  });

  it('escapes a literal </script> sequence inside a string value', () => {
    const out = toJsonLd({ description: 'before </script><script>alert(1)</script> after' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('</script');
    // Still valid, round-trips to the ORIGINAL (unescaped) string — the
    // backslash is a JSON escape, not part of the actual value.
    const parsed = JSON.parse(out) as { description: string };
    expect(parsed.description).toBe(
      'before </script><script>alert(1)</script> after',
    );
  });

  it('is case-insensitive about the closing tag', () => {
    const out = toJsonLd({ x: '</SCRIPT>' });
    expect(out.toLowerCase()).not.toContain('</script>');
  });

  it('omits keys whose value is undefined, same as plain JSON.stringify', () => {
    const out = toJsonLd({ a: 1, b: undefined });
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });
});
