import { describe, expect, it } from 'vitest';
import { renderHighlightMarkup } from './highlightMarkup';

describe('renderHighlightMarkup', () => {
  it('wraps a single *term* in <em>', () => {
    expect(renderHighlightMarkup('Use *since* with the present perfect.')).toBe(
      'Use <em>since</em> with the present perfect.',
    );
  });

  it('wraps multiple terms in the same string', () => {
    expect(renderHighlightMarkup('*many* with countable, *much* with uncountable.')).toBe(
      '<em>many</em> with countable, <em>much</em> with uncountable.',
    );
  });

  it('leaves plain text with no asterisks untouched', () => {
    expect(renderHighlightMarkup('No emphasis here.')).toBe('No emphasis here.');
  });

  it('escapes HTML-significant characters outside the emphasis', () => {
    expect(renderHighlightMarkup('5 < 10 & "quoted" & \'single\'')).toBe(
      '5 &lt; 10 &amp; &quot;quoted&quot; &amp; &#39;single&#39;',
    );
  });

  it('escapes HTML-significant characters INSIDE the emphasis too', () => {
    expect(renderHighlightMarkup('Use *a & b*')).toBe('Use <em>a &amp; b</em>');
  });

  it('renders a lone, unbalanced asterisk literally instead of dropping it', () => {
    expect(renderHighlightMarkup('only *one star')).toBe('only *one star');
  });

  it('renders an empty **pair** (no content between) literally', () => {
    expect(renderHighlightMarkup('nothing ** here')).toBe('nothing ** here');
  });

  it('never throws on an empty string', () => {
    expect(renderHighlightMarkup('')).toBe('');
  });

  it('pairs a run of three asterisks left to right, leaving the odd one out literal', () => {
    // "*a* b *c" -> first pair closes on "a", the trailing lone "*c" has no
    // closing partner and renders literally.
    expect(renderHighlightMarkup('*a* b *c')).toBe('<em>a</em> b *c');
  });
});
