/**
 * `cloze` template ("Completar la frase") — bracket-sentence parsing, the
 * authoring round-trip, and the game-time derivation, all in one pure module
 * (no React, no I/O), same posture as `gameModes.ts`/`exercisePayload.ts`.
 *
 * AUTHORING SYNTAX: a teacher writes a plain sentence and marks each blank by
 * wrapping the word (or phrase) in square brackets — `"I [was] travelling
 * when I [received] a phone call."`. `parseClozeText` turns that into ordered
 * text/blank segments; everything outside a bracket pair is literal text,
 * including an unmatched `[` (no closing `]`) and an empty `[]` (kept as
 * literal `[]` rather than treated as a zero-word blank).
 *
 * STORAGE REUSES THE EXISTING PAYLOAD, NO SCHEMA CHANGE: each BLANK becomes
 * its own `row` block + `drop`-mechanic {@link Slot} (`DropRenderer.tsx`'s
 * existing mechanic, one blank per slot, exactly like every other gap
 * question) drawing from ONE pool shared by the whole block (every blank
 * word plus the author's distractors). A sentence with K blanks is therefore
 * K slots, not one — the single-value `drop` mechanic cannot represent more
 * than one gap per slot, so "map onto the existing payload" means one slot
 * per GAP, not per sentence. Each blank's own `label` carries the FULL
 * sentence with every OTHER blank already filled in and only ITS OWN gap
 * shown as `___` — so Básico (the generic question list/`DropRenderer`)
 * still renders every blank as a normal, independently gradable gap
 * question, and the dedicated `cloze` game groups them back into one
 * sentence for its own big stage.
 *
 * GROUPING: a blank's row/slot id carries `-cz-s<sentenceSeq>-b<blankSeq>-`
 * (see {@link clozeRowPrefix}/{@link sentenceKeyFromId}) — the only extra
 * bookkeeping this template needs, entirely inside the id string QuizBlockEditor
 * already mints (`nextId`), so no new field is added to `Slot`/`Block`/`Payload`.
 * A freshly added, still-bracket-less sentence is ONE placeholder `text` slot
 * (no pool, no answer) holding the raw line verbatim, so a half-typed sentence
 * survives a reload exactly like `ReorderEditor`'s own too-short-to-play one.
 */
import type { Block, Payload, Pool, PoolItem, RowBlock, Slot } from '../exercisePayload';
import type { Draft } from '../authoringDraft';

/** `[` + anything but `[`/`]` + `]` — a single, non-nested bracket pair. */
const BRACKET_PAIR = /\[([^[\]]*)\]/g;

/** Mirrors `exercisePayload.ts`'s own `BLANK_MARKER` convention: a run of 3+ underscores is one blank. */
const GAP_MARKER = '___';

/** Row/slot id fragment marking one blank of one authored sentence — `clozeRowPrefix`'s own inverse. */
const CLOZE_ID_PATTERN = /-cz-s(\d+)-b(\d+)-/;

export interface ClozeSegment {
  kind: 'text' | 'blank';
  /** Literal text for `'text'`; the trimmed authored word/phrase for `'blank'`. */
  text: string;
}

export interface ClozeParseResult {
  /** Ordered text/blank segments, exactly as authored (brackets stripped). */
  segments: ClozeSegment[];
  /** Each blank's trimmed word/phrase, in authored (left-to-right) order. */
  blanks: string[];
}

/**
 * Parse one authored line into its text/blank segments.
 *
 * Edge cases, all literal text rather than a blank: an empty bracket pair
 * (`"a phone call[]"`), and an unmatched `[` with no closing `]` (the regex
 * never matches it, so it is never stripped, same as any other character).
 */
function pushText(segments: ClozeSegment[], text: string): void {
  if (!text) return;
  const last = segments[segments.length - 1];
  // Merge into the previous text run (e.g. the literal text before an empty
  // `[]` pair and the `[]` itself) so two adjacent non-blank runs never show
  // up as two segments — a blank is the only thing that ever splits one.
  if (last && last.kind === 'text') {
    last.text += text;
    return;
  }
  segments.push({ kind: 'text', text });
}

export function parseClozeText(raw: string): ClozeParseResult {
  const segments: ClozeSegment[] = [];
  const blanks: string[] = [];
  let cursor = 0;
  BRACKET_PAIR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BRACKET_PAIR.exec(raw))) {
    pushText(segments, raw.slice(cursor, match.index));
    const word = (match[1] ?? '').trim();
    if (word.length > 0) {
      segments.push({ kind: 'blank', text: word });
      blanks.push(word);
    } else {
      pushText(segments, match[0]);
    }
    cursor = match.index + match[0].length;
  }
  pushText(segments, raw.slice(cursor));
  return { segments, blanks };
}

/** The full sentence with every blank filled by its own word — no brackets, no markers. */
export function plainSentence(parsed: ClozeParseResult): string {
  return parsed.segments.map((s) => s.text).join('');
}

/** One blank's own Básico-compatible label: every OTHER blank filled in, `blankIndex`'s own gap shown as `___`. */
export function labelForBlank(parsed: ClozeParseResult, blankIndex: number): string {
  let seen = -1;
  return parsed.segments
    .map((seg) => {
      if (seg.kind === 'text') return seg.text;
      seen += 1;
      return seen === blankIndex ? GAP_MARKER : seg.text;
    })
    .join('');
}

/**
 * Rebuild the authored bracket text from EVERY blank's own label (its own
 * `___` resolved back to its word) plus the ordered words — the exact
 * inverse of `labelForBlank`/`parseClozeText` for a sentence THIS module
 * built, which is the only sentence it is ever asked to reconstruct.
 *
 * Deliberately NOT a text search for each word inside the fully-filled
 * sentence: a blank word that also occurs earlier as plain text (`"The cat
 * chased the [cat] away."`) would make the FIRST occurrence win instead of
 * the real one. Each blank's own label already marks its own exact position
 * with `___` — every OTHER blank in that same label is already filled with
 * its real word, identically to the fully-filled sentence, so the text
 * BEFORE that marker is byte-identical between the two. The marker's own
 * offset is therefore this blank's exact position, no searching required.
 */
export function reconstructRawText(labels: readonly string[], words: readonly string[]): string {
  if (labels.length === 0) return '';
  const full = (labels[0] as string).replace(GAP_MARKER, words[0] ?? '');
  let result = '';
  let cursor = 0;
  labels.forEach((label, i) => {
    const pos = label.indexOf(GAP_MARKER);
    if (pos === -1) return;
    const word = words[i] ?? '';
    result += full.slice(cursor, pos) + `[${word}]`;
    cursor = pos + word.length;
  });
  result += full.slice(cursor);
  return result;
}

/** The row/slot id fragment for one sentence's blank — embedded into `nextId`'s own prefix, never a standalone id. */
export function clozeRowPrefix(sentenceSeq: number, blankSeq: number): string {
  return `cz-s${sentenceSeq}-b${blankSeq}`;
}

/** Recover `{ sentenceSeq, blankSeq }` from an id minted via `clozeRowPrefix`, or `null` for any other id. */
export function sentenceKeyFromId(id: string): { sentenceSeq: number; blankSeq: number } | null {
  const m = CLOZE_ID_PATTERN.exec(id);
  if (!m) return null;
  return { sentenceSeq: Number(m[1]), blankSeq: Number(m[2]) };
}

/** One authored sentence, as the editor shows it. */
export interface ClozeSentenceRow {
  /** This sentence's own sequence number — stable across edits, used both as its React key and to mint its rows' ids. */
  seq: number;
  rowIds: string[];
  slotIds: string[];
  /** How many real (bracketed) blanks this sentence currently has — `0` for a still-bracket-less placeholder. */
  blankCount: number;
  /** The raw authored text, brackets included, reconstructed from storage. */
  text: string;
}

function poolFor(draft: Draft, slot: Slot | undefined): Pool {
  return slot?.pool ? (draft.pools[slot.pool] ?? []) : [];
}

/** Every authored sentence, grouped and reconstructed from the draft's own rows/slots — the editor's whole view model. */
export function deriveClozeSentences(draft: Draft): ClozeSentenceRow[] {
  const groups = new Map<number, { blankSeq: number; rowId: string; slotId: string }[]>();
  for (const block of draft.blocks) {
    if (block.kind !== 'row') continue;
    const key = sentenceKeyFromId(block.id);
    if (!key) continue;
    const arr = groups.get(key.sentenceSeq) ?? [];
    arr.push({ blankSeq: key.blankSeq, rowId: block.id, slotId: block.slotId });
    groups.set(key.sentenceSeq, arr);
  }

  const bySlotId = new Map(draft.slots.map((s) => [s.id, s]));
  const rows: ClozeSentenceRow[] = [];

  for (const [seq, entries] of groups) {
    entries.sort((a, b) => a.blankSeq - b.blankSeq);
    const rowIds = entries.map((e) => e.rowId);
    const slotIds = entries.map((e) => e.slotId);
    const firstSlot = bySlotId.get(slotIds[0] as string);
    let text = '';
    let blankCount = 0;
    if (firstSlot) {
      if (firstSlot.input === 'drop') {
        blankCount = entries.length;
        const labels = slotIds.map((slotId) => bySlotId.get(slotId)?.label ?? '');
        const words = slotIds.map((slotId) => {
          const slot = bySlotId.get(slotId);
          const pool = poolFor(draft, slot);
          return pool.find((item) => item.id === slot?.answer[0])?.text ?? '';
        });
        text = reconstructRawText(labels, words);
      } else {
        // The 0-blank placeholder: the raw text IS the label, verbatim.
        text = firstSlot.label;
      }
    }
    rows.push({ seq, rowIds, slotIds, blankCount, text });
  }

  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

/** How many of `rows` are actually playable (>= 1 real blank) — the editor's own "needs at least one sentence" hint. */
export function playableSentenceCount(rows: readonly ClozeSentenceRow[]): number {
  return rows.filter((r) => r.blankCount >= 1).length;
}

/**
 * Replace one sentence's rows/slots/pool items with whatever `rawText` now
 * parses to — the editor's per-keystroke commit. Preserves the sentence's
 * position among its siblings; removes exactly the pool items this sentence
 * used to claim (its distractors and every other sentence's items are
 * untouched).
 */
export function applyClozeSentenceText(
  draft: Draft,
  seq: number,
  rawText: string,
  poolName: string,
  nextId: (prefix: string) => string,
): Draft {
  const parsed = parseClozeText(rawText);

  let insertAt = draft.blocks.length;
  let found = false;
  const staleSlotIds = new Set<string>();
  const keptBlocks: Block[] = [];
  draft.blocks.forEach((block) => {
    if (block.kind === 'row') {
      const key = sentenceKeyFromId(block.id);
      if (key && key.sentenceSeq === seq) {
        if (!found) {
          insertAt = keptBlocks.length;
          found = true;
        }
        staleSlotIds.add(block.slotId);
        return;
      }
    }
    keptBlocks.push(block);
  });

  const staleAnswerIds = new Set<string>();
  draft.slots.forEach((slot) => {
    if (staleSlotIds.has(slot.id)) slot.answer.forEach((a) => staleAnswerIds.add(a));
  });
  const keptSlots = draft.slots.filter((s) => !staleSlotIds.has(s.id));
  const existingPool = draft.pools[poolName] ?? [];
  const poolWithoutStale = existingPool.filter((item) => !staleAnswerIds.has(item.id));

  const newBlocks: RowBlock[] = [];
  const newSlots: Slot[] = [];
  const newPoolItems: PoolItem[] = [];

  if (parsed.blanks.length === 0) {
    const prefix = clozeRowPrefix(seq, 0);
    const rowId = nextId(`row-${prefix}`);
    const slotId = nextId(`slot-${prefix}`);
    newBlocks.push({ kind: 'row', id: rowId, slotId });
    newSlots.push({ id: slotId, label: rawText, input: 'text', answer: [] });
  } else {
    parsed.blanks.forEach((word, i) => {
      const prefix = clozeRowPrefix(seq, i);
      const rowId = nextId(`row-${prefix}`);
      const slotId = nextId(`slot-${prefix}`);
      const itemId = nextId(`item-${prefix}`);
      newBlocks.push({ kind: 'row', id: rowId, slotId });
      newSlots.push({ id: slotId, label: labelForBlank(parsed, i), input: 'drop', pool: poolName, answer: [itemId] });
      newPoolItems.push({ id: itemId, text: word });
    });
  }

  const blocks = [...keptBlocks.slice(0, insertAt), ...newBlocks, ...keptBlocks.slice(insertAt)];
  const slots = [...keptSlots, ...newSlots];
  const pools = { ...draft.pools, [poolName]: [...poolWithoutStale, ...newPoolItems] };

  return { ...draft, blocks, slots, pools };
}

/** Append a brand-new, empty sentence (a 0-blank placeholder) right after every existing one. */
export function addClozeSentence(draft: Draft, poolName: string, nextId: (prefix: string) => string): Draft {
  const existingSeqs = deriveClozeSentences(draft).map((r) => r.seq);
  const seq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 0;
  return applyClozeSentenceText(draft, seq, '', poolName, nextId);
}

/** Remove one sentence entirely — its rows, its slots, and the pool items it claimed. */
export function removeClozeSentence(draft: Draft, seq: number, poolName: string): Draft {
  const staleSlotIds = new Set<string>();
  const blocks = draft.blocks.filter((block) => {
    if (block.kind !== 'row') return true;
    const key = sentenceKeyFromId(block.id);
    if (key && key.sentenceSeq === seq) {
      staleSlotIds.add(block.slotId);
      return false;
    }
    return true;
  });
  const staleAnswerIds = new Set<string>();
  draft.slots.forEach((s) => {
    if (staleSlotIds.has(s.id)) s.answer.forEach((a) => staleAnswerIds.add(a));
  });
  const slots = draft.slots.filter((s) => !staleSlotIds.has(s.id));
  const existingPool = draft.pools[poolName] ?? [];
  const pools = { ...draft.pools, [poolName]: existingPool.filter((item) => !staleAnswerIds.has(item.id)) };
  return { ...draft, blocks, slots, pools };
}

/** Pool items no blank currently claims as its answer — the author's own "Palabras extra (distractores)", comma-joined for display. */
export function deriveDistractorsText(draft: Draft, poolName: string): string {
  const claimed = new Set<string>();
  draft.slots.forEach((s) => {
    if (s.pool === poolName) s.answer.forEach((a) => claimed.add(a));
  });
  const pool = draft.pools[poolName] ?? [];
  return pool
    .filter((item) => !claimed.has(item.id))
    .map((item) => item.text ?? '')
    .join(', ');
}

/** Replace the distractor words wholesale, by comma-separated text — every claimed (blank-answer) item is left untouched. */
export function applyDistractorsText(
  draft: Draft,
  poolName: string,
  text: string,
  nextId: (prefix: string) => string,
): Draft {
  const claimed = new Set<string>();
  draft.slots.forEach((s) => {
    if (s.pool === poolName) s.answer.forEach((a) => claimed.add(a));
  });
  const pool = draft.pools[poolName] ?? [];
  const kept = pool.filter((item) => claimed.has(item.id));
  const words = text
    .split(',')
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const added: PoolItem[] = words.map((word) => ({ id: nextId('distractor'), text: word }));
  return { ...draft, pools: { ...draft.pools, [poolName]: [...kept, ...added] } };
}

/** One sentence as the `cloze` GAME sees it — every blank, in order, still a gap. */
export interface ClozeGameSegment {
  kind: 'text' | 'blank';
  text: string;
  /** Present for a `'blank'` segment — the exact slot this gap grades against. */
  slotId?: string;
}

export interface ClozeGameSentence {
  seq: number;
  segments: ClozeGameSegment[];
  /** Every blank's slot id, left to right — the game's own per-blank drop targets. */
  blankSlotIds: string[];
}

/** Every PLAYABLE sentence (>= 1 real blank), reconstructed from a persisted `Payload` — the `cloze` game's, presentation's and print's shared input. */
export function deriveClozeGameSentences(payload: Payload): ClozeGameSentence[] {
  const blocks = payload.blocks ?? [];
  const bySlotId = new Map(payload.slots.map((s) => [s.id, s]));
  const groups = new Map<number, { blankSeq: number; slotId: string }[]>();

  for (const block of blocks) {
    if (block.kind !== 'row') continue;
    const key = sentenceKeyFromId(block.id);
    if (!key) continue;
    const slot = bySlotId.get(block.slotId);
    if (!slot || slot.input !== 'drop') continue;
    const arr = groups.get(key.sentenceSeq) ?? [];
    arr.push({ blankSeq: key.blankSeq, slotId: block.slotId });
    groups.set(key.sentenceSeq, arr);
  }

  const result: ClozeGameSentence[] = [];
  for (const [seq, entries] of groups) {
    entries.sort((a, b) => a.blankSeq - b.blankSeq);
    const firstSlot = bySlotId.get(entries[0]!.slotId);
    if (!firstSlot) continue;

    const wordFor = (slotId: string): string => {
      const slot = bySlotId.get(slotId);
      if (!slot) return '';
      const pool = slot.pool ? (payload.pools[slot.pool] ?? []) : [];
      return pool.find((item) => item.id === slot.answer[0])?.text ?? '';
    };
    const labels = entries.map((e) => bySlotId.get(e.slotId)?.label ?? '');
    const words = entries.map((e) => wordFor(e.slotId));
    const raw = reconstructRawText(labels, words);
    const parsed = parseClozeText(raw);

    let blankIdx = -1;
    const segments: ClozeGameSegment[] = parsed.segments.map((seg) => {
      if (seg.kind === 'text') return { kind: 'text', text: seg.text };
      blankIdx += 1;
      return { kind: 'blank', text: seg.text, slotId: entries[blankIdx]?.slotId };
    });

    result.push({ seq, segments, blankSlotIds: entries.map((e) => e.slotId) });
  }

  result.sort((a, b) => a.seq - b.seq);
  return result;
}
