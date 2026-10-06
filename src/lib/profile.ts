/**
 * Profile normalization (Login step 1b: user menu in the header).
 *
 * Three sign-in methods (Google, email + password, magic link) shape a
 * Supabase `User` differently: Google populates `user_metadata` with
 * OAuth-provider fields (`full_name`/`name`, `picture`), while a
 * password/magic-link account carries no metadata at all. `toProfile` is the
 * ONE place that difference is resolved into a shape every reader (the
 * `/api/me` endpoint, the `UserMenu` island) can treat identically — same
 * reasoning as `getPlan` in `src/lib/access.ts`: pure, zero-I/O, and the one
 * spot a future field (a real uploaded avatar, a display-name preference)
 * changes.
 */
import type { User } from '@supabase/supabase-js';
import { getPlan, type Plan } from './access';
import { hasRole } from './roles';
import { getPendingModerationCount } from './activities/moderation';
import { DISPLAY_NAME_METADATA_KEY } from './displayName';

/** The normalized shape every signed-in-aware surface reads. */
export interface Profile {
  name: string;
  email: string;
  avatarUrl: string | null;
  initials: string;
  plan: Plan;
  /** PR E, "Moderation": drives the header's "Moderación" link. */
  isModerator: boolean;
  /**
   * The moderator queue's total pending count (revisions awaiting review +
   * activities hidden by reports) — the badge next to "Moderación". Always
   * `0` for a non-moderator, without even querying it (see below).
   */
  moderationPendingCount: number;
}

/** The local part of an email address, or the whole string if there is no `@`. */
function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * Resolve a display name: the visitor's OWN choice ({@link DISPLAY_NAME_METADATA_KEY},
 * Perfil page, T3 — see `./displayName.ts`'s own header for why that key
 * and its validation live in a separate, zero-import module) first, then
 * Google's `full_name`, then `name` (also
 * Google — some flows populate this one instead), then the email local part
 * for an account with no metadata at all (email + password, magic link).
 *
 * EXPORTED (not just `toProfile`'s private helper): the desk hub's greeting
 * ("desktop" redesign PART 3, `/[lang]/ingles/index.astro`) needs only the
 * NAME, synchronously — `toProfile` additionally awaits `getPlan`/`hasRole`/
 * `getPendingModerationCount`, three round trips the greeting has no use
 * for. Pure/zero-I/O, same posture as every other export in this file.
 */
export function nameFrom(user: User): string {
  const meta = user.user_metadata ?? {};
  const displayName = meta[DISPLAY_NAME_METADATA_KEY];
  if (typeof displayName === 'string' && displayName.trim() !== '') {
    return displayName.trim();
  }
  const fullName = meta.full_name;
  if (typeof fullName === 'string' && fullName.trim() !== '') {
    return fullName.trim();
  }
  const name = meta.name;
  if (typeof name === 'string' && name.trim() !== '') {
    return name.trim();
  }
  return emailLocalPart(user.email ?? '');
}

/**
 * Resolve an avatar URL: Supabase's own `avatar_url`, then Google's
 * `picture`, kept ONLY when it is an `https:` URL.
 *
 * The scheme check is not decoration — `avatarUrl` ends up in an `<img src>`
 * with no further validation downstream, so a `javascript:` or plain `http:`
 * value (mixed content, and a lever an attacker-controlled OAuth profile
 * could pull) is refused here rather than trusted to render harmlessly.
 */
function avatarFrom(user: User): string | null {
  const meta = user.user_metadata ?? {};
  const avatarUrl = meta.avatar_url;
  const picture = meta.picture;
  const candidate =
    typeof avatarUrl === 'string' && avatarUrl !== ''
      ? avatarUrl
      : typeof picture === 'string' && picture !== ''
        ? picture
        : null;
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate).protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Initials from a display name: the first letter of the first word, plus the
 * first letter of the last word when there is more than one — `Juan Carlos
 * Perez` reads as `JP`, skipping the middle name, the same shorthand most
 * avatar chips use. A single-word name (the common case for an email-derived
 * fallback) yields one letter, not two, since there is no second word to draw
 * from.
 */
function initialsFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const first = words[0].charAt(0);
  const last = words[words.length - 1].charAt(0);
  const initials = words.length === 1 ? first : `${first}${last}`;
  return initials.toUpperCase();
}

/**
 * Normalize a server-verified Supabase `User` into the shape the header's
 * account chip and `/api/me` both read.
 *
 * `plan` now requires a round trip through {@link getPlan} (`user_subscriptions`,
 * service-role client), so this is `async` — every caller/test awaits it.
 *
 * @param user - `Astro.locals.user`, already non-null at the call site.
 */
export async function toProfile(user: User): Promise<Profile> {
  const name = nameFrom(user);
  const isModerator = await hasRole(user.id, 'moderator');
  return {
    name,
    email: user.email ?? '',
    avatarUrl: avatarFrom(user),
    initials: initialsFrom(name),
    plan: await getPlan(user),
    isModerator,
    // Never queried for a non-moderator — no point paying for a count
    // nobody's UI will ever show.
    moderationPendingCount: isModerator ? await getPendingModerationCount() : 0,
  };
}
