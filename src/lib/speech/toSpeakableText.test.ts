import { describe, expect, it } from 'vitest';
import { MAX_SPEAKABLE_LENGTH, toSpeakableText } from './toSpeakableText';

describe('toSpeakableText', () => {
  it('returns empty text as-is', () => {
    expect(toSpeakableText('')).toBe('');
  });

  it('returns null/undefined as empty', () => {
    expect(toSpeakableText(null)).toBe('');
    expect(toSpeakableText(undefined)).toBe('');
  });

  it('returns whitespace-only text as empty', () => {
    expect(toSpeakableText('   \n\t  ')).toBe('');
  });

  it('passes plain sentences through unchanged', () => {
    expect(toSpeakableText('The cat sits on the mat.')).toBe('The cat sits on the mat.');
  });

  it('reads a 3-underscore blank marker as "blank"', () => {
    expect(toSpeakableText('The cat ___ on the mat.')).toBe('The cat blank on the mat.');
  });

  it('reads a longer run of underscores as "blank" too', () => {
    expect(toSpeakableText('I ______ to school.')).toBe('I blank to school.');
  });

  it('does not treat 1-2 underscores as a blank marker', () => {
    expect(toSpeakableText('snake_case __ two')).toBe('snake case two');
  });

  it('strips markdown-ish markup characters', () => {
    expect(toSpeakableText('**bold** and `code` and <b>html and #tag')).toBe('bold and code and b html and tag');
  });

  it('collapses internal whitespace runs to one space', () => {
    expect(toSpeakableText('too   many\n\nspaces')).toBe('too many spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toSpeakableText('  padded  ')).toBe('padded');
  });

  it('caps very long text at MAX_SPEAKABLE_LENGTH characters', () => {
    const long = 'word '.repeat(200); // 1000 chars
    const result = toSpeakableText(long);
    expect(result.length).toBeLessThanOrEqual(MAX_SPEAKABLE_LENGTH);
  });

  it('caps at a word boundary near the limit rather than mid-word', () => {
    const long = 'a'.repeat(MAX_SPEAKABLE_LENGTH - 5) + ' ' + 'b'.repeat(50);
    const result = toSpeakableText(long);
    expect(result.endsWith('a')).toBe(true);
    expect(result).not.toContain('b');
  });
});
