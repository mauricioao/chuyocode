import { describe, expect, it } from 'vitest';
import { splitSentences } from './splitSentences';

describe('splitSentences', () => {
  it('returns an empty array for empty or whitespace-only input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });

  it('returns the whole text as one sentence when there is no terminal punctuation', () => {
    expect(splitSentences('Hello world')).toEqual(['Hello world']);
  });

  it('splits on periods, keeping the terminator attached', () => {
    expect(splitSentences('Hello. World.')).toEqual(['Hello.', 'World.']);
  });

  it('splits on question marks and exclamation marks', () => {
    expect(splitSentences('Is this ok? Yes!')).toEqual(['Is this ok?', 'Yes!']);
  });

  it('keeps a trailing clause with no terminal punctuation as its own sentence', () => {
    expect(splitSentences('First sentence. Second clause with no ending')).toEqual([
      'First sentence.',
      'Second clause with no ending',
    ]);
  });

  it('collapses extra whitespace between sentences', () => {
    expect(splitSentences('One.   Two.')).toEqual(['One.', 'Two.']);
  });

  it('never returns a whitespace-only chunk', () => {
    expect(splitSentences('One. . Two.')).toEqual(['One.', '.', 'Two.']);
  });
});
