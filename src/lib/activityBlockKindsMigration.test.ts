import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0022_activity_block_kinds.sql` — see
 * `activityModerationMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * Owner decision (2026-10-19, followed up 2026-10-20): hide the "Varios
 * juegos" FILTER OPTION from the community `?tipo=` filter, offering one
 * option per remaining activity type (Worksheet + each quiz template mold)
 * instead. This migration adds the `block_kinds` derived column — one entry
 * per block, mold-aware — and threads it through `approve_activity_revision`
 * as a NEW trailing parameter, dropping the old 5-arg overload first —
 * Postgres `create or replace function` does not replace a function whose
 * argument list changed shape, it adds an overload, so the stale 5-arg
 * signature must be dropped explicitly.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0022_activity_block_kinds.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0022_activity_block_kinds.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it("adds block_kinds as a not-null text[] defaulting to '{}'", () => {
    expect(sql).toMatch(
      /alter table public\.activities add column block_kinds text\[\] not null default '\{\}';/,
    );
  });

  it('indexes block_kinds with a GIN index, same as block_types', () => {
    expect(sql).toMatch(
      /create index activities_block_kinds_idx\s+on public\.activities using gin \(block_kinds\);/,
    );
  });

  it('drops the stale 5-arg approve_activity_revision overload before recreating it', () => {
    expect(sql).toMatch(
      /drop function if exists public\.approve_activity_revision\(uuid, uuid, jsonb, text\[\], int\);/,
    );
  });

  it('backfills block_kinds for already-published activities from their published revision', () => {
    // Without this, every existing row keeps the step-1 default (`'{}'`)
    // until its NEXT approval — both the "Varios juegos" exclusion and the
    // new per-kind filter would stay stale for an existing activity until
    // someone edits and resubmits it, which is not what the owner asked
    // for.
    expect(sql).toMatch(/update public\.activities a\s*set block_kinds = coalesce\(\(/);
    expect(sql).toMatch(/from public\.activity_revisions r,\s*jsonb_array_elements\(r\.blocks\) as b/);
    expect(sql).toMatch(/where r\.id = a\.published_revision_id/);
    expect(sql).toMatch(/when b->>'type' = 'worksheet' then 'worksheet'/);
    // The app never writes `template: null` — a mold-less ("Básico") quiz
    // block simply omits the key, so `coalesce(b->>'template', 'basic')`
    // lands on `'basic'` for it, exactly like `blocks.ts`'s own `blockKind`.
    expect(sql).toMatch(/else coalesce\(b->>'template', 'basic'\)/);
    expect(sql).toMatch(/where a\.published_revision_id is not null;/);
  });

  describe('approve_activity_revision() with p_block_kinds', () => {
    it('is SECURITY DEFINER with a pinned search_path, taking the new trailing parameter', () => {
      expect(sql).toMatch(
        /create or replace function public\.approve_activity_revision\(\s*p_revision uuid,\s*p_reviewer uuid,\s*p_blocks jsonb,\s*p_block_types text\[\],\s*p_block_count int,\s*p_block_kinds text\[\]\s*\)\s*returns void/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('still locks the revision row and requires pending_review', () => {
      expect(sql).toMatch(/where id = p_revision\s*for update;/);
      expect(sql).toMatch(/if v_status <> 'pending_review' then/);
    });

    it('still supersedes the previously approved revision for the same activity, excluding itself', () => {
      expect(sql).toMatch(
        /set status = 'superseded'\s*where activity_id = v_activity_id\s*and status = 'approved'\s*and id <> p_revision;/,
      );
    });

    it('publishes the activity, including the new block_kinds column', () => {
      expect(sql).toMatch(/published_revision_id = p_revision,/);
      expect(sql).toMatch(/block_types\s*=\s*p_block_types,/);
      expect(sql).toMatch(/block_count\s*=\s*p_block_count,/);
      expect(sql).toMatch(/block_kinds\s*=\s*p_block_kinds,/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role, on the new 6-arg signature', () => {
      const revokeIdx = sql.indexOf(
        'revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) from public;',
      );
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });
});
