/**
 * `match` template ("Une las parejas") bulk-paste parsing (owner spec N5,
 * "paste a whole list") — pure, no React, no I/O, same posture as every
 * other module in this directory. One pair per line: the FIRST separator
 * that appears, tried in this exact priority order — a tab, then `=`, then a
 * spaced hyphen/en dash (` - ` / ` – `), then `: ` — splits it into question
 * and answer, both trimmed. A line with none of those is question-only (the
 * editor's own "needs an answer" hint already covers an incomplete pair).
 */
import { nonEmptyLines } from './pasteLines';

export interface MatchPastePair {
  question: string;
  answer: string;
}

function splitPair(line: string): MatchPastePair {
  const tabIndex = line.indexOf('\t');
  if (tabIndex !== -1) return { question: line.slice(0, tabIndex).trim(), answer: line.slice(tabIndex + 1).trim() };

  const equalsIndex = line.indexOf('=');
  if (equalsIndex !== -1) {
    return { question: line.slice(0, equalsIndex).trim(), answer: line.slice(equalsIndex + 1).trim() };
  }

  const dashMatch = /\s[-–]\s/.exec(line);
  if (dashMatch) {
    return {
      question: line.slice(0, dashMatch.index).trim(),
      answer: line.slice(dashMatch.index + dashMatch[0].length).trim(),
    };
  }

  const colonIndex = line.indexOf(': ');
  if (colonIndex !== -1) {
    return { question: line.slice(0, colonIndex).trim(), answer: line.slice(colonIndex + 2).trim() };
  }

  return { question: line.trim(), answer: '' };
}

/** Every pasted line as one `{ question, answer }` pair, in order. */
export function parseMatchPairsPaste(text: string): MatchPastePair[] {
  return nonEmptyLines(text).map(splitPair);
}
