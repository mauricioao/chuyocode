import { describe, expect, it } from 'vitest';
import { formatElapsedTime } from './formatElapsedTime';

describe('formatElapsedTime', () => {
  it('shows just seconds under one minute', () => {
    expect(formatElapsedTime(45_000)).toBe('45 s');
  });

  it('shows minutes and seconds past one minute', () => {
    expect(formatElapsedTime(83_000)).toBe('1 min 23 s');
  });

  it('drops the seconds when they round to zero', () => {
    expect(formatElapsedTime(60_000)).toBe('1 min');
  });

  it('rounds to the nearest second, carrying into a full minute', () => {
    expect(formatElapsedTime(59_600)).toBe('1 min');
    expect(formatElapsedTime(44_400)).toBe('44 s');
  });

  it('floors at "0 s" for a non-positive duration', () => {
    expect(formatElapsedTime(0)).toBe('0 s');
    expect(formatElapsedTime(-500)).toBe('0 s');
  });

  it('handles several full minutes', () => {
    expect(formatElapsedTime(125_000)).toBe('2 min 5 s');
  });
});
