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

/** The normalized shape every signed-in-aware surface reads. */
export interface Profile {
  name: string;
  email: string;
  avatarUrl: string | null;
  initials: string;
  plan: Plan;
}

/** The local part of an email address, or the whole string if there is no `@`. */
function emailLocalPart(email: string): string {
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * Resolve a display name: Google's `full_name`, then `name` (also Google —
 * some flows populate this one instead), then the email local part for an
 * account with no metadata at all (email + password, magic link).
 */
function nameFrom(user: User): string {
  const meta = user.user_metadata ?? {};
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
  return {
    name,
    email: user.email ?? '',
    avatarUrl: avatarFrom(user),
    initials: initialsFrom(name),
    plan: await getPlan(user),
  };
}
