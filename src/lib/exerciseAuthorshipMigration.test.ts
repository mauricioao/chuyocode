import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0007_exercise_authorship.sql`
 * (design.md §3, tasks 5.10/5.11).
 *
 * SQL cannot be executed in this environment — there is no live Postgres to
 * run migrations against. This mirrors `src/astroConfig.test.ts`'s pattern: a
 * raw-text assertion against the file itself is the only thing that can catch
 * a regression in CI, and it is crude but correct for the failure modes that
 * matter most here (see each test's comment for why).
 *
 * The file lives under `src/lib/` rather than beside the migration because
 * `vitest.config.ts` only collects `src/**` and `tests/unit/**`.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0007_exercise_authorship.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0007_exercise_authorship.sql', () => {
  it('T8 — declares `visible` as GENERATED ALWAYS ... STORED, never VIRTUAL', () => {
    // `information_schema.columns.is_generated` reports `ALWAYS` for BOTH
    // STORED and VIRTUAL and cannot distinguish them (design.md §3,
    // "Verifying STORED"). The only reliable proof is the catalog query this
    // migration's own PR body must paste (`pg_attribute.attgenerated = 's'`),
    // which cannot run here — so this test instead guards the SOURCE TEXT
    // that produces that catalog row: a generated column declared STORED is
    // what makes a direct `UPDATE ... SET visible = …` fail with
    // "column \"visible\" can only be updated to DEFAULT" at the database,
    // which is what task 5.1 (T8) exercises against a real database.
    expect(sql).toMatch(
      /generated always as \(status in \('live', 'auditing'\) and hidden_at is null\) stored/,
    );
    expect(sql).not.toMatch(/generated always as \([^)]*\)\s+virtual/i);
  });

  it('T8 corollary — never uses `add column ... generated` without STORED', () => {
    // Omitting STORED is a syntax error on the Postgres versions this project
    // targets (owner prereq 5), but a version drift could make the omission
    // silently default to VIRTUAL instead — the exact failure design.md §3
    // calls out. Every `generated always as` in this file must end in
    // `stored` on the same logical statement.
    const generatedColumnKeywords = [
      ...sql.matchAll(/generated always as \([^;]*?\)\s*(stored|virtual)/gis),
    ].map((match) => match[1]?.toLowerCase());
    expect(generatedColumnKeywords.length).toBeGreaterThan(0);
    for (const keyword of generatedColumnKeywords) {
      expect(keyword).toBe('stored');
    }
  });

  it('rejects a hidden row unless hidden_at AND hidden_by are both set, and only from live/auditing', () => {
    expect(sql).toMatch(/constraint exercises_hidden_pair/);
    expect(sql).toMatch(
      /\(hidden_at is null and hidden_by is null\)\s*\n\s*or \(hidden_at is not null and hidden_by is not null\s*\n\s*and status in \('live', 'auditing'\)\)/,
    );
  });

  it('constrains status to exactly the five lifecycle values', () => {
    expect(sql).toMatch(
      /check \(status in \('draft', 'live', 'auditing', 'needs_work', 'removed'\)\)/,
    );
  });

  it('backfills status from `published` BEFORE dropping the column', () => {
    const backfillIndex = sql.indexOf("set status = case when published then 'live' else 'draft' end");
    const dropIndex = sql.indexOf('drop column published');
    expect(backfillIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(-1);
    expect(backfillIndex).toBeLessThan(dropIndex);
  });

  it('adds status NULLABLE before backfilling it (no default that could mask a forgotten value)', () => {
    const addColumnIndex = sql.indexOf('add column status text');
    const backfillIndex = sql.indexOf("set status = case when published");
    const notNullIndex = sql.indexOf('alter column status set not null');
    expect(addColumnIndex).toBeGreaterThan(-1);
    expect(backfillIndex).toBeGreaterThan(addColumnIndex);
    expect(notNullIndex).toBeGreaterThan(backfillIndex);
    // No inline default alongside the initial ADD COLUMN.
    expect(sql).not.toMatch(/add column status text default/);
  });

  it('drops the old partial index explicitly, never via `drop column ... cascade`', () => {
    expect(sql).not.toMatch(/drop column published cascade/i);
    expect(sql).toMatch(/drop index if exists public\.exercises_level_focus_published_idx/);
    const dropIndexIndex = sql.indexOf('drop index if exists public.exercises_level_focus_published_idx');
    const dropColumnIndex = sql.indexOf('drop column published');
    expect(dropIndexIndex).toBeGreaterThan(-1);
    expect(dropIndexIndex).toBeLessThan(dropColumnIndex);
  });

  it('creates the replacement partial index on the visible predicate', () => {
    expect(sql).toMatch(
      /create index exercises_level_focus_visible_idx\s*\n\s*on public\.exercises \(level, focus\) where visible;/,
    );
  });

  it('gives updated_by an ON DELETE SET NULL action (0003 left it with none)', () => {
    expect(sql).toMatch(
      /foreign key \(updated_by\) references auth\.users\(id\) on delete set null;/,
    );
  });

  it('gives hidden_by and author_id an ON DELETE SET NULL action too', () => {
    expect(sql).toMatch(/hidden_by\s+uuid\s+references auth\.users\(id\) on delete set null/);
    expect(sql).toMatch(/author_id\s+uuid\s+references auth\.users\(id\) on delete set null/);
  });

  it('ships the whole migration as one transaction', () => {
    const beginCount = (sql.match(/^begin;$/gm) ?? []).length;
    const commitCount = (sql.match(/^commit;$/gm) ?? []).length;
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
  });

  it('ships the rollback as a commented block, not executable SQL', () => {
    const rollbackHeadingIndex = sql.indexOf('ROLLBACK');
    expect(rollbackHeadingIndex).toBeGreaterThan(-1);
    const afterHeading = sql.slice(rollbackHeadingIndex);
    // Every non-blank line after the ROLLBACK heading is a SQL comment.
    const codeLines = afterHeading
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of codeLines) {
      expect(line.startsWith('--')).toBe(true);
    }
  });
});
