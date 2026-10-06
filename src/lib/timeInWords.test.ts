import { describe, expect, it } from 'vitest';
import { timeInWords } from './timeInWords';

describe('timeInWords', () => {
  it('says the bare hour ("o\'clock") at the exact hour', () => {
    expect(timeInWords(9, 0)).toBe("nine o'clock");
    expect(timeInWords(0, 0)).toBe("twelve o'clock");
    expect(timeInWords(12, 0)).toBe("twelve o'clock");
  });

  it('rounds up to the NEXT hour\'s "o\'clock" once minutes round to 60', () => {
    // 58 rounds to the nearest 5 (60), which is really the next hour.
    expect(timeInWords(8, 58)).toBe("nine o'clock");
    expect(timeInWords(11, 58)).toBe("twelve o'clock");
    expect(timeInWords(23, 58)).toBe("twelve o'clock");
  });

  it('says "past" for the first half of the hour', () => {
    expect(timeInWords(9, 5)).toBe('five past nine');
    expect(timeInWords(9, 10)).toBe('ten past nine');
    expect(timeInWords(9, 15)).toBe('quarter past nine');
    expect(timeInWords(9, 20)).toBe('twenty past nine');
    expect(timeInWords(9, 25)).toBe('twenty-five past nine');
  });

  it('says "half past" at the exact half hour', () => {
    expect(timeInWords(9, 30)).toBe('half past nine');
  });

  it('says "to" the NEXT hour for the second half of the hour', () => {
    expect(timeInWords(9, 35)).toBe('twenty-five to ten');
    expect(timeInWords(9, 40)).toBe('twenty to ten');
    expect(timeInWords(9, 45)).toBe('quarter to ten');
    expect(timeInWords(9, 50)).toBe('ten to ten');
    expect(timeInWords(9, 55)).toBe('five to ten');
  });

  it('wraps the "to" hour from eleven back to twelve', () => {
    expect(timeInWords(11, 45)).toBe('quarter to twelve');
  });

  it('rounds an in-between minute to the nearest 5', () => {
    expect(timeInWords(9, 7)).toBe('five past nine'); // rounds down to 5
    expect(timeInWords(9, 8)).toBe('ten past nine'); // rounds up to 10
    expect(timeInWords(9, 2)).toBe("nine o'clock"); // rounds down to 0
  });
});
