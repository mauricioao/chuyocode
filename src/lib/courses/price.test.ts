import { describe, it, expect } from 'vitest';
import { formatPrice } from './price';

describe('formatPrice', () => {
  it('formats whole-dollar USD cents in Spanish', () => {
    expect(formatPrice(1999, 'USD', 'es')).toMatch(/19[.,]99/);
  });

  it('formats whole-dollar USD cents in English', () => {
    const formatted = formatPrice(1999, 'USD', 'en');
    expect(formatted).toContain('19.99');
    expect(formatted).toContain('$');
  });

  it('rounds nothing away for a whole-currency amount', () => {
    expect(formatPrice(5000, 'USD', 'en')).toContain('50.00');
  });
});
