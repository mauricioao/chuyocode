import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0009_exercise_reactions.sql` (design.md
 * §4, tasks 8.1-8.6). See `exerciseAuthorshipMigration.test.ts` for why this
 * pattern exists — no live Postgres here, so a raw-text assertion against the
 * file is the only thing CI can check. The hand-run SQL cases (T9's unique
 * violation, the threshold behavior itself) still need their output pasted in
 * the PR body per task 8.6; this guards the SOURCE that produces it.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0009_exercise_reactions.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0009_exercise_reactions.sql', () => {
  it('T9 — one reaction per (user_id, exercise_id), enforced at the database', () => {
    expect(sql).toMatch(
      /constraint exercise_reactions_user_exercise_key unique \(user_id, exercise_id\)/,
    );
  });

  it('constrains kind to like/dislike', () => {
    expect(sql).toMatch(/kind\s+text\s+not null check \(kind in \('like','dislike'\)\)/);
  });

  it('constrains reason to exactly the four-item taxonomy', () => {
    expect(sql).toMatch(
      /reason\s+text\s+check \(reason in \('ambiguous','wrong_answer','too_hard','typo'\)\)/,
    );
  });

  it('requires a reason for a dislike and forbids one for a like', () => {
    expect(sql).toMatch(/constraint exercise_reactions_reason_pairing check \(/);
    expect(sql).toMatch(
      /\(kind = 'dislike' and reason is not null\) or \(kind = 'like' and reason is null\)/,
    );
  });

  it('is_quality_dislike excludes too_hard; is_too_hard_dislike is its complement', () => {
    expect(sql).toMatch(
      /is_quality_dislike\(k text, r text\)[\s\S]*?select k = 'dislike' and r in \('ambiguous','wrong_answer','typo'\)/,
    );
    expect(sql).toMatch(
      /is_too_hard_dislike\(k text, r text\)[\s\S]*?select k = 'dislike' and r = 'too_hard'/,
    );
  });

  it('the trigger fires on INSERT OR UPDATE OR DELETE, never INSERT alone', () => {
    expect(sql).toMatch(
      /after insert or update or delete on public\.exercise_reactions/,
    );
  });

  it('branches NEW/OLD by tg_op instead of coalescing them', () => {
    expect(sql).toMatch(/if tg_op = 'DELETE' then target := old\.exercise_id;/);
    expect(sql).not.toMatch(/coalesce\(new\./i);
    expect(sql).not.toMatch(/coalesce\(old\./i);
  });

  it('evaluates the delta INSIDE the UPDATE SET expression (0006 concurrency pattern)', () => {
    expect(sql).toMatch(
      /set quality_dislikes\s*=\s*greatest\(exercise_reaction_counts\.quality_dislikes\s*\+\s*q_delta, 0\)/,
    );
    expect(sql).toMatch(
      /too_hard_dislikes\s*=\s*greatest\(exercise_reaction_counts\.too_hard_dislikes\s*\+\s*t_delta, 0\)/,
    );
  });

  it('the auditing guard is status=live only, and never touches hidden_at/hidden_by', () => {
    expect(sql).toMatch(
      /update public\.exercises set status='auditing' where id=target and status='live';/,
    );
    expect(sql).not.toMatch(/hidden_at\s*=/);
    expect(sql).not.toMatch(/hidden_by\s*=/);
  });

  it('the config table admits exactly one row', () => {
    expect(sql).toMatch(/id\s+boolean\s+primary key default true check \(id\)/);
    expect(sql).toMatch(
      /insert into public\.exercise_moderation_config \(id\) values \(true\) on conflict do nothing;/,
    );
  });

  it('the threshold is read from the config table at trigger time, not hardcoded', () => {
    expect(sql).toMatch(
      /select audit_dislike_threshold into threshold from public\.exercise_moderation_config;/,
    );
  });

  it('enables row level security on all three new tables', () => {
    expect(sql).toMatch(/alter table public\.exercise_reactions\s+enable row level security;/);
    expect(sql).toMatch(
      /alter table public\.exercise_reaction_counts\s+enable row level security;/,
    );
    expect(sql).toMatch(
      /alter table public\.exercise_moderation_config enable row level security;/,
    );
  });

  it('creates no policy at all — service_role only, via BYPASSRLS', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('grants the service_role explicit table access on all three tables (the 0002 lesson)', () => {
    expect(sql).toMatch(/grant select on table public\.exercise_reactions to service_role;/);
    expect(sql).toMatch(
      /grant insert, update, delete on table public\.exercise_reactions to service_role;/,
    );
    expect(sql).toMatch(
      /grant select on table public\.exercise_reaction_counts to service_role;/,
    );
    expect(sql).toMatch(
      /grant insert, update, delete on table public\.exercise_reaction_counts to service_role;/,
    );
    expect(sql).toMatch(
      /grant select on table public\.exercise_moderation_config to service_role;/,
    );
    expect(sql).toMatch(
      /grant insert, update, delete on table public\.exercise_moderation_config to service_role;/,
    );
  });

  it('never grants anything to anon or authenticated', () => {
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });

  it('cascades on the referenced exercise and user', () => {
    expect(sql).toMatch(/references public\.exercises\(id\) on delete cascade/);
    expect(sql).toMatch(/references auth\.users\(id\)\s+on delete cascade/);
  });
});
