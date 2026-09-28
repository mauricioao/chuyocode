/**
 * The exercise status state machine (design.md §3, "Status state machine —
 * enforced in TypeScript, not SQL").
 *
 * `supabase/migrations/0007_exercise_authorship.sql` enforces the VALUE DOMAIN
 * (`exercises_status_valid`) and the hide pair (`hidden_at`/`hidden_by`
 * together or not at all) at the database. It does NOT enforce the GRAPH —
 * which transitions are legal from which state. That is enforced here,
 * because only the service-role client writes `exercises.status`, there is
 * exactly one server path per transition, and a `BEFORE UPDATE` transition
 * trigger would be a second, harder-to-read copy of this same table that no
 * client-side code could ever consult before showing a UI affordance.
 *
 * ACCEPTED TRADEOFF: a hand-run SQL `UPDATE` against the database can still
 * produce an illegal transition — already true of every other business rule
 * in this schema (see `exercises_hidden_pair` for the one exception that
 * COULD be expressed as a CHECK, and is).
 *
 * `canTransition` is PURE and EXHAUSTIVE: every edge in the table below is a
 * decision recorded in design.md, not something inferred at call time. A
 * status never "transitions" to itself — `removed` is explicitly terminal,
 * and every other same-state pair is simply absent from the table, so an
 * idempotent no-op save is the caller's job, not this function's.
 */

/** Every value `exercises.status` may hold (`exercises_status_valid`). */
export const STATUSES = [
  'draft',
  'live',
  'auditing',
  'needs_work',
  'removed',
] as const;

export type Status = (typeof STATUSES)[number];

/**
 * The legal edges, keyed by origin state. Read alongside design.md §3:
 *
 * | Transition                    | Actor     | Gate                              |
 * |--------------------------------|-----------|------------------------------------|
 * | `draft` → `live`               | author    | validator passes + terms accepted   |
 * | `live` → `auditing`            | trigger   | quality dislikes ≥ threshold        |
 * | `live`/`auditing` → `needs_work`| moderator | —                                    |
 * | `auditing` → `live`            | moderator | audit resolved as fine              |
 * | `needs_work` → `live`          | author    | validator passes                    |
 * | any (non-terminal) → `removed` | moderator | soft delete, logged                 |
 * | `removed` → —                  | —         | terminal in v1                      |
 *
 * `removed` maps to an empty set rather than being absent from the record:
 * absent would make a typo'd lookup (`TRANSITIONS[status]`) return
 * `undefined` and throw inside `.has`, where an empty set fails the same
 * lookup safely and makes "removed has no way out" a value, not an omission.
 */
const TRANSITIONS: Readonly<Record<Status, ReadonlySet<Status>>> = {
  draft: new Set<Status>(['live', 'removed']),
  live: new Set<Status>(['auditing', 'needs_work', 'removed']),
  auditing: new Set<Status>(['live', 'needs_work', 'removed']),
  needs_work: new Set<Status>(['live', 'removed']),
  removed: new Set<Status>(),
};

/**
 * Is moving `from` → `to` a legal transition?
 *
 * Reflexive pairs (`from === to`) always answer `false`, including for
 * `removed`: this table records MOVEMENT between states, and a caller that
 * wants "no-op if already there" checks that separately, one honest
 * responsibility per function.
 */
export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].has(to);
}
