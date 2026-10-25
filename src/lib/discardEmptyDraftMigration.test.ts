import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0023_discard_empty_draft.sql` — see
 * `activityModerationMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0023_discard_empty_draft.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0023_discard_empty_draft.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('discard_empty_draft()', () => {
    it('has the exact signature, returning text', () => {
      expect(sql).toMatch(
        /create or replace function public\.discard_empty_draft\(\s*p_activity uuid,\s*p_author uuid,\s*p_expected_revision uuid,\s*p_expected_blocks jsonb\s*\)\s*returns text/,
      );
    });

    it('is SECURITY DEFINER with a pinned search_path', () => {
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('is not declared STABLE — it mutates data', () => {
      expect(sql).not.toMatch(/\bstable\b/);
    });

    it('locks the owner+draft activity row before anything else', () => {
      expect(sql).toMatch(
        /where id = p_activity\s*and author_id = p_author\s*and status = 'draft'\s*for update;/,
      );
    });

    it("returns 'not_found' when the locked select misses", () => {
      expect(sql).toMatch(/if not found then\s*return 'not_found';\s*end if;/);
    });

    it('reads the latest revision by created_at desc, limit 1', () => {
      expect(sql).toMatch(
        /from public\.activity_revisions\s*where activity_id = p_activity\s*order by created_at desc\s*limit 1;/,
      );
    });

    it('compares both the revision id AND the exact blocks — two distinct-from checks', () => {
      const matches = sql.match(/is distinct from/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
      expect(sql).toMatch(/v_revision_id is distinct from p_expected_revision/);
      expect(sql).toMatch(/v_revision_blocks is distinct from p_expected_blocks/);
    });

    it("returns 'changed' when either comparison drifted", () => {
      expect(sql).toMatch(/return 'changed';/);
    });

    it("flips the activity to status = 'removed' and stamps updated_at, only once both match", () => {
      expect(sql).toMatch(/set status\s*=\s*'removed',\s*updated_at\s*=\s*now\(\)\s*where id = p_activity;/);
      expect(sql).toMatch(/return 'removed';/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role, in order', () => {
      const revokePublicIdx = sql.indexOf(
        'revoke all on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) from public;',
      );
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) to service_role;',
      );
      expect(revokePublicIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokePublicIdx).toBeLessThan(revokeAnonIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*to anon/i);
      expect(sql).not.toMatch(/grant.*to authenticated/i);
    });
  });
});
