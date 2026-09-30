import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0017_courses.sql` — see
 * `userSubscriptionsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * Same security posture as every table since `exercise_likes` (the 0002
 * lesson): RLS must be ON, with NO anon-facing policy, and the `service_role`
 * GRANTs must exist explicitly — BYPASSRLS does not imply a table-level GRANT.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0017_courses.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0017_courses.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  for (const table of ['courses', 'course_modules', 'course_lessons', 'course_purchases']) {
    describe(table, () => {
      it('enables row level security', () => {
        expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`));
      });

      it('grants the service_role explicit table access (the 0002 lesson)', () => {
        expect(sql).toMatch(new RegExp(`grant select on table public\\.${table} to service_role;`));
        expect(sql).toMatch(
          new RegExp(`grant insert, update, delete on table public\\.${table} to service_role;`),
        );
      });
    });
  }

  it('creates no policy at all — service_role only, via BYPASSRLS', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('never grants anything to anon or authenticated', () => {
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });

  describe('courses', () => {
    it('constrains slug to kebab-case', () => {
      expect(sql).toMatch(/slug\s+text\s+not null unique check \(slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'\)/);
    });

    it('caps title and subtitle length', () => {
      expect(sql).toMatch(/title\s+text\s+not null check \(char_length\(title\) <= 120\)/);
      expect(sql).toMatch(/char_length\(subtitle\) <= 200/);
    });

    it('constrains level to the CEFR vocabulary, nullable', () => {
      expect(sql).toMatch(/level is null or level in \('A1','A2','B1','B2','C1','C2'\)/);
    });

    it('constrains status to draft/published/archived, defaulting to draft', () => {
      expect(sql).toMatch(/status\s+text\s+not null default 'draft' check \(status in \('draft','published','archived'\)\)/);
    });

    it('defaults included_in_premium to true, not null', () => {
      expect(sql).toMatch(/included_in_premium\s+boolean\s+not null default true/);
    });

    it('allows price_cents to be null (not sold individually) but never negative', () => {
      expect(sql).toMatch(/price_cents\s+integer\s+check \(price_cents is null or price_cents >= 0\)/);
    });
  });

  describe('course_modules', () => {
    it('cascades when the parent course is deleted', () => {
      expect(sql).toMatch(/course_id\s+uuid\s+not null references public\.courses\(id\) on delete cascade/);
    });

    it('deferrable-uniques (course_id, position) so a transaction can reorder modules', () => {
      expect(sql).toMatch(
        /constraint course_modules_course_position_key unique \(course_id, position\) deferrable initially immediate/,
      );
    });
  });

  describe('course_lessons', () => {
    it('cascades when the parent module is deleted', () => {
      expect(sql).toMatch(/module_id\s+uuid\s+not null references public\.course_modules\(id\) on delete cascade/);
    });

    it('constrains kind to text/video/activity', () => {
      expect(sql).toMatch(/kind\s+text\s+not null check \(kind in \('text','video','activity'\)\)/);
    });

    it('defaults content to an empty jsonb object, not null', () => {
      expect(sql).toMatch(/content\s+jsonb\s+not null default '\{\}'::jsonb/);
    });

    it('defaults is_preview to false, not null', () => {
      expect(sql).toMatch(/is_preview\s+boolean\s+not null default false/);
    });

    it('deferrable-uniques (module_id, position) so a transaction can reorder lessons', () => {
      expect(sql).toMatch(
        /constraint course_lessons_module_position_key unique \(module_id, position\) deferrable initially immediate/,
      );
    });
  });

  describe('course_purchases', () => {
    it('cascades when the user or course is deleted', () => {
      expect(sql).toMatch(/user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/);
      expect(sql).toMatch(/course_id\s+uuid\s+not null references public\.courses\(id\) on delete cascade/);
    });

    it('constrains source to purchase/grant/promo', () => {
      expect(sql).toMatch(/source\s+text\s+not null check \(source in \('purchase','grant','promo'\)\)/);
    });

    it('uniques (user_id, course_id) — one lifetime entitlement per user per course', () => {
      expect(sql).toMatch(/constraint course_purchases_user_course_key unique \(user_id, course_id\)/);
    });

    it('sets granted_by to null on delete, never cascading the acting moderator', () => {
      expect(sql).toMatch(/granted_by\s+uuid\s+references auth\.users\(id\) on delete set null/);
    });
  });
});
