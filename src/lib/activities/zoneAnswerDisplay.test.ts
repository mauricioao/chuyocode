import { describe, it, expect } from 'vitest';
import { zoneAnswerFontSize, MAX_ZONE_FONT_REM, MIN_ZONE_FONT_REM } from './zoneAnswerDisplay';

describe('zoneAnswerFontSize', () => {
  it('renders empty text at full size', () => {
    expect(zoneAnswerFontSize('')).toBe(MAX_ZONE_FONT_REM);
  });

  it('renders short text at full size', () => {
    expect(zoneAnswerFontSize('cat')).toBe(MAX_ZONE_FONT_REM);
  });

  it('shrinks progressively longer text', () => {
    const short = zoneAnswerFontSize('elephant');
    const longer = zoneAnswerFontSize('a much longer typed answer');
    expect(short).toBeLessThan(MAX_ZONE_FONT_REM);
    expect(longer).toBeLessThan(short);
  });

  it('never shrinks below the floor, even for a very long answer', () => {
    expect(zoneAnswerFontSize('a'.repeat(500))).toBe(MIN_ZONE_FONT_REM);
  });

  it('trims whitespace before measuring length', () => {
    expect(zoneAnswerFontSize('   cat   ')).toBe(MAX_ZONE_FONT_REM);
  });
});
