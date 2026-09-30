import { describe, it, expect } from 'vitest';
import {
  zoneAnswerFontSize,
  MAX_ZONE_FONT_REM,
  MIN_ZONE_FONT_REM,
  zoneInputFontSizePx,
  MIN_ZONE_INPUT_FONT_PX,
  MAX_ZONE_INPUT_FONT_PX,
  shouldShowZonePlaceholder,
  ZONE_PLACEHOLDER_MIN_WIDTH_PX,
} from './zoneAnswerDisplay';

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

describe('zoneInputFontSizePx', () => {
  it('floors at the minimum for a very short zone', () => {
    expect(zoneInputFontSizePx(4)).toBe(MIN_ZONE_INPUT_FONT_PX);
  });

  it('caps at the maximum for a very tall zone', () => {
    expect(zoneInputFontSizePx(200)).toBe(MAX_ZONE_INPUT_FONT_PX);
  });

  it('scales linearly with height in between', () => {
    expect(zoneInputFontSizePx(15)).toBe(15);
  });

  it('falls back to the floor for an unmeasured (zero) height', () => {
    expect(zoneInputFontSizePx(0)).toBe(MIN_ZONE_INPUT_FONT_PX);
  });

  it('falls back to the floor for a non-finite height', () => {
    expect(zoneInputFontSizePx(NaN)).toBe(MIN_ZONE_INPUT_FONT_PX);
  });
});

describe('shouldShowZonePlaceholder', () => {
  it('shows placeholder copy at or above the width floor', () => {
    expect(shouldShowZonePlaceholder(ZONE_PLACEHOLDER_MIN_WIDTH_PX)).toBe(true);
    expect(shouldShowZonePlaceholder(200)).toBe(true);
  });

  it('hides placeholder copy below the width floor', () => {
    expect(shouldShowZonePlaceholder(ZONE_PLACEHOLDER_MIN_WIDTH_PX - 1)).toBe(false);
  });

  it('hides placeholder copy for an unmeasured (zero) width', () => {
    expect(shouldShowZonePlaceholder(0)).toBe(false);
  });
});
