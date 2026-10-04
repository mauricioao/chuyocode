import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0019_billing_foundation.sql` — see
 * `userSubscriptionsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * Same security posture as every table since `exercise_likes` (the 0002
 * lesson): RLS must be ON, with NO anon-facing policy, and the `service_role`
 * GRANTs must exist explicitly — BYPASSRLS does not imply a table-level GRANT.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0019_billing_foundation.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0019_billing_foundation.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('never grants anything to anon or authenticated', () => {
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });

  it('creates no policy at all — service_role only, via BYPASSRLS', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  describe('user_subscriptions linkage', () => {
    it('adds the provider linkage columns', () => {
      expect(sql).toMatch(/add column provider\s+text/);
      expect(sql).toMatch(/add column provider_ref\s+text/);
      expect(sql).toMatch(/add column provider_customer_ref\s+text/);
    });

    it('extends status to include trialing without dropping the existing vocabulary', () => {
      expect(sql).toMatch(
        /check \(status in \('active','trialing','canceled','past_due'\)\)/,
      );
    });

    it('adds provider_event_at to guard against applying an out-of-order webhook delivery', () => {
      expect(sql).toMatch(/add column provider_event_at\s+timestamptz/);
    });

    it('drops the old status check before re-adding it (idempotent re-run safety)', () => {
      expect(sql).toMatch(/drop constraint if exists user_subscriptions_status_check;/);
    });

    it('uniques (provider, provider_ref) only where provider_ref is set', () => {
      expect(sql).toMatch(
        /create unique index user_subscriptions_provider_ref_key\s+on public\.user_subscriptions \(provider, provider_ref\)\s+where provider_ref is not null;/,
      );
    });
  });

  describe('course_purchases linkage', () => {
    it('uniques (provider, provider_ref) only where provider_ref is set', () => {
      expect(sql).toMatch(
        /create unique index course_purchases_provider_ref_key\s+on public\.course_purchases \(provider, provider_ref\)\s+where provider_ref is not null;/,
      );
    });

    it('does not re-declare the provider/provider_ref columns (already added in 0017)', () => {
      expect(sql).not.toMatch(/alter table public\.course_purchases add column/);
    });
  });

  describe('billing_events', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(/alter table public\.billing_events enable row level security;/);
    });

    it('grants the service_role explicit table access (the 0002 lesson)', () => {
      expect(sql).toMatch(/grant select on table public\.billing_events to service_role;/);
      expect(sql).toMatch(
        /grant insert, update, delete on table public\.billing_events to service_role;/,
      );
    });

    it('uniques (provider, event_id) — one ledger row per provider event', () => {
      expect(sql).toMatch(
        /constraint billing_events_provider_event_key unique \(provider, event_id\)/,
      );
    });

    it('defaults received_at to now(), not null', () => {
      expect(sql).toMatch(/received_at\s+timestamptz\s+not null default now\(\)/);
    });

    it('leaves occurred_at and processed_at nullable', () => {
      expect(sql).not.toMatch(/occurred_at\s+timestamptz\s+not null/);
      expect(sql).not.toMatch(/processed_at\s+timestamptz\s+not null/);
    });

    it('defaults id to a generated uuid primary key', () => {
      expect(sql).toMatch(/id\s+uuid\s+primary key default gen_random_uuid\(\)/);
    });
  });
});
