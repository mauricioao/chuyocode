import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pickDailyActivity } from '../../../src/lib/activities/dailyPick';
import { assertLocalSupabaseUrl, type LocalSupabase } from './localSupabase';

/**
 * Published activities the visual suite renders on `/es/ingles/actividades`,
 * written to the LOCAL Supabase stack by ./globalSetup.ts and removed again by
 * ./globalTeardown.ts. supabase/seed.sql is deliberately left alone.
 *
 * Shape of the set, and why:
 *  - 21 rows, one more than a catalog page (`ACTIVITIES_PAGE_SIZE`), so the
 *    pagination bar always reads "1 de 2" even when other local sessions have
 *    left a few live activities of their own behind (up to 19 more still give
 *    2 pages).
 *  - `published_at` in 2090, so these rows are always the newest and fill the
 *    whole of page 1 ahead of anything else in the local database (the
 *    catalog never prints the date).
 *  - Every row has the same `heart_count`, high enough to out-rank ad-hoc
 *    local rows, so the "Actividad del día" candidates (top page by hearts,
 *    then `published_at`) are exactly page 1 in page-1 order.
 *  - "Actividad del día" is picked server-side by `pickDailyActivity` from
 *    TODAY's date, so a fixed set would highlight a different card each day.
 *    Instead the setup computes today's pick index and places
 *    {@link DAILY_PICK_TITLE}'s row in that slot, so the rendered page is the
 *    same every day: the highlighted card first, then the rest in a fixed
 *    order. (A run straddling midnight in America/Lima could still see a
 *    different pick — re-run it.)
 */

interface ActivityFixture {
  id: string;
  revisionId: string;
  title: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;
  /** Quiz questions, one block each. */
  blocks: Array<Array<[question: string, answer: string]>>;
  viewTotal: number;
}

const HEART_COUNT = 18;

/**
 * `ACTIVITIES_PAGE_SIZE` (src/lib/activities/activities.ts). Not imported:
 * that module pulls in the Supabase server client, which validates the app's
 * env at import time. The visual spec asserts the "1 de 2" pagination and the
 * daily-pick card, so a drift here fails loudly rather than silently.
 */
const ACTIVITIES_PAGE_SIZE = 20;

function fixture(
  n: number,
  title: string,
  level: ActivityFixture['level'],
  viewTotal: number,
  blocks: ActivityFixture['blocks'],
): ActivityFixture {
  const suffix = String(n).padStart(2, '0');
  return {
    id: `f17e0000-0000-4000-8000-0000000000${suffix}`,
    revisionId: `f17e0000-0000-4000-8000-0000000001${suffix}`,
    title,
    level,
    blocks,
    viewTotal,
  };
}

const Q = (question: string, answer: string): [string, string] => [question, answer];

/** In display order: the daily pick first, then the rest of page 1, then page 2. */
const FIXTURES: ActivityFixture[] = [
  fixture(0, 'Daily routines: what time is it?', 'A1', 142, [[Q('I wake up at ___ o’clock.', 'seven')], [Q('She ___ breakfast at 8.', 'has')]]),
  fixture(1, 'Animals on the farm', 'A1', 97, [[Q('A cow says ___.', 'moo')]]),
  fixture(2, 'Colours and shapes', 'A1', 88, [[Q('The sky is ___.', 'blue')], [Q('A ball is a ___.', 'circle')]]),
  fixture(3, 'Present simple: likes and dislikes', 'A2', 76, [[Q('He ___ pizza.', 'likes')]]),
  fixture(4, 'At the restaurant', 'A2', 64, [[Q('Can I have the ___, please?', 'menu')], [Q('The bill, ___.', 'please')], [Q('A table for ___.', 'two')]]),
  fixture(5, 'Past simple: last weekend', 'A2', 59, [[Q('We ___ to the beach.', 'went')]]),
  fixture(6, 'Giving directions', 'B1', 51, [[Q('Turn ___ at the corner.', 'left')], [Q('Go ___ on.', 'straight')]]),
  fixture(7, 'Comparatives: bigger and better', 'B1', 47, [[Q('An elephant is ___ than a cat.', 'bigger')]]),
  fixture(8, 'Phrasal verbs at home', 'B1', 43, [[Q('Please turn ___ the lights.', 'off')], [Q('Pick ___ your toys.', 'up')]]),
  fixture(9, 'Future plans with going to', 'B1', 38, [[Q('I am going ___ study.', 'to')]]),
  fixture(10, 'Present perfect: have you ever…?', 'B2', 35, [[Q('Have you ever ___ sushi?', 'eaten')], [Q('I have ___ been there.', 'never')]]),
  fixture(11, 'Conditionals: if I were you', 'B2', 31, [[Q('If I ___ you, I would rest.', 'were')]]),
  fixture(12, 'Reported speech', 'B2', 27, [[Q('She said she ___ tired.', 'was')], [Q('He told me he ___ come.', 'would')]]),
  fixture(13, 'Passive voice in the news', 'B2', 24, [[Q('The bridge ___ built in 1990.', 'was')]]),
  fixture(14, 'Idioms about weather', 'C1', 21, [[Q('It is raining cats and ___.', 'dogs')]]),
  fixture(15, 'Formal emails', 'C1', 18, [[Q('I look forward to ___ from you.', 'hearing')], [Q('Yours ___.', 'sincerely')]]),
  fixture(16, 'Linking words: however, therefore', 'C1', 15, [[Q('It was late; ___, we stayed.', 'however')]]),
  fixture(17, 'Numbers 1 to 20', 'A1', 12, [[Q('Ten plus two is ___.', 'twelve')]]),
  fixture(18, 'Family members', 'A1', 9, [[Q('My mother’s mother is my ___.', 'grandmother')], [Q('My father’s brother is my ___.', 'uncle')]]),
  fixture(19, 'Weather words', null, 6, [[Q('When it is cold it can ___.', 'snow')]]),
  // Page 2 — never rendered, only keeps the pagination bar stable.
  fixture(20, 'Holidays around the world', 'A2', 3, [[Q('Christmas is in ___.', 'December')]]),
];

/** The card the visual spec expects highlighted as "Actividad del día". */
export const DAILY_PICK_TITLE = FIXTURES[0].title;
/** The first regular card right after it. */
export const FIRST_REGULAR_TITLE = FIXTURES[1].title;

/**
 * Display order → publish slots for `date`: the slot today's daily pick reads
 * (`pickDailyActivity` over a full page of candidates) gets
 * {@link DAILY_PICK_TITLE}, every other page-1 slot keeps the display order,
 * and the extra row stays last (page 2). Slot 0 is the newest.
 */
export function arrangeForDailyPick(date: Date): ActivityFixture[] {
  const slotIndexes = Array.from({ length: ACTIVITIES_PAGE_SIZE }, (_, i) => i);
  const pickSlot = pickDailyActivity(slotIndexes, date) ?? 0;
  const pageOne = FIXTURES.slice(1, ACTIVITIES_PAGE_SIZE);
  pageOne.splice(pickSlot, 0, FIXTURES[0]);
  return [...pageOne, ...FIXTURES.slice(ACTIVITIES_PAGE_SIZE)];
}

function blocksJson(fixtureBlocks: ActivityFixture['blocks'], id: string) {
  return fixtureBlocks.map((questions, b) => ({
    id: `${id}-b${b}`,
    type: 'quiz',
    payload: {
      pools: {},
      slots: questions.map(([label, answer], s) => ({ id: `s${b}-${s}`, input: 'text', label, answer: [answer] })),
      blocks: questions.map((_, s) => ({ id: `r${b}-${s}`, kind: 'row', slotId: `s${b}-${s}` })),
    },
  }));
}

function serviceClient(supabase: LocalSupabase): SupabaseClient {
  assertLocalSupabaseUrl(supabase.url);
  return createClient(supabase.url, supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Delete every fixture row (revisions cascade from their activity). Safe to call twice. */
export async function removeVisualActivities(supabase: LocalSupabase): Promise<void> {
  const client = serviceClient(supabase);
  const { error } = await client.from('activities').delete().in('id', FIXTURES.map((f) => f.id));
  if (error) throw new Error(`[visual] removing fixture activities failed: ${error.message}`);
  const { error: revError } = await client
    .from('activity_revisions')
    .delete()
    .in('id', FIXTURES.map((f) => f.revisionId));
  if (revError) throw new Error(`[visual] removing fixture revisions failed: ${revError.message}`);
}

/** (Re)create the fixture set, arranged for `date`'s daily pick. */
export async function seedVisualActivities(supabase: LocalSupabase, date: Date): Promise<void> {
  await removeVisualActivities(supabase);
  const client = serviceClient(supabase);
  const arranged = arrangeForDailyPick(date);
  const base = Date.UTC(2090, 0, 1, 12, 0, 0);

  // A live activity must point at its revision, and the revision references
  // the activity: insert as drafts, then the revisions, then go live.
  const drafts = arranged.map((f, slot) => ({
    id: f.id,
    author_id: null,
    title: f.title,
    level: f.level,
    status: 'draft',
    block_types: ['quiz'],
    block_count: f.blocks.length,
    published_at: new Date(base - slot * 60_000).toISOString(),
    created_at: '2090-01-01T00:00:00Z',
    updated_at: '2090-01-01T00:00:00Z',
    heart_count: HEART_COUNT,
    view_total: f.viewTotal,
  }));
  const { error: draftError } = await client.from('activities').insert(drafts);
  if (draftError) throw new Error(`[visual] inserting fixture activities failed: ${draftError.message}`);

  const revisions = arranged.map((f) => ({
    id: f.revisionId,
    activity_id: f.id,
    blocks: blocksJson(f.blocks, f.id),
    status: 'approved',
    created_by: null,
    created_at: '2090-01-01T00:00:00Z',
  }));
  const { error: revError } = await client.from('activity_revisions').insert(revisions);
  if (revError) throw new Error(`[visual] inserting fixture revisions failed: ${revError.message}`);

  const live = drafts.map((d, i) => ({ ...d, status: 'live', published_revision_id: arranged[i].revisionId }));
  const { error: liveError } = await client.from('activities').upsert(live);
  if (liveError) throw new Error(`[visual] publishing fixture activities failed: ${liveError.message}`);
}
