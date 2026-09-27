/**
 * Access model for gated sections (Login step 1).
 *
 * The site is becoming a Wordwall-style platform: Libros and Noticias stay
 * PUBLIC, while Inglés (`/[lang]/ingles/**`) and Cursos (`/[lang]/cursos/**`,
 * no pages yet — the rule is reserved ahead of them) require a signed-in
 * visitor today, and will require an active paid subscription later.
 *
 * Kept as two pure, zero-I/O functions so the gate is unit-testable without a
 * request/response round trip, and so the single spot a future subscription
 * check replaces is obvious rather than scattered across every gated route.
 */
import type { User } from '@supabase/supabase-js';

/** Section slugs that require login (and later, a subscription). */
const GATED_SECTIONS = ['ingles', 'cursos'] as const;

/**
 * Does this path belong to a gated section?
 *
 * True for `/<lang>/ingles`, `/<lang>/cursos`, and anything nested under
 * either — the third path segment (`pathname.split('/')[2]`) names the
 * section, and the lang segment before it is never inspected: this predicate
 * does not care whether the lang is valid, only whether the section is
 * gated. A section name that merely starts with `ingles`/`cursos`
 * (`/es/inglesx`) does not match, because the split compares the whole
 * segment, not a prefix.
 *
 * @param pathname - A request path, e.g. `/es/ingles/A1/present-simple`.
 */
export function requiresLogin(pathname: string): boolean {
  const section = pathname.split('/')[2];
  return (GATED_SECTIONS as readonly string[]).includes(section ?? '');
}

/**
 * The plans a signed-in visitor may be on.
 *
 * A union of one value today, kept as a type rather than a literal `'free'`
 * scattered at call sites so a future `'premium'` tier is ONE addition here,
 * not a search-and-replace across every reader of {@link getPlan}.
 */
export type Plan = 'free';

/**
 * Which plan a signed-in visitor is on.
 *
 * Mirrors {@link isEntitled}'s reasoning: today entitlement and plan are both
 * trivial (every signed-in visitor gets the same answer), and both are pure,
 * one-line functions precisely so the day a real subscription lookup lands,
 * only this body changes — callers (`toProfile`, in particular) never do.
 *
 * @param user - A signed-in caller. Callers only ever have a plan once
 *   signed in, so this takes the user directly rather than `| null` like
 *   {@link hasAccess} — resolve "no plan, they're anonymous" at the call
 *   site instead of overloading this return type with that case.
 */
export function getPlan(user: Pick<User, 'id'>): Plan {
  void user;
  return 'free';
}

/**
 * The one function body a future subscription check replaces.
 *
 * Today: signed in is the whole entitlement. Tomorrow: signed in AND an
 * active paid subscription. Every caller of {@link hasAccess} stays
 * unchanged when that day comes — only this body's `return` changes, to a
 * lookup keyed on `user.id`.
 */
function isEntitled(user: Pick<User, 'id'> | null): boolean {
  return user !== null;
}

/**
 * May this visitor see this path?
 *
 * A public section is always accessible, signed in or not. A gated section
 * defers to {@link isEntitled}.
 *
 * @param user - The server-verified caller from `Astro.locals.user`, or
 *   `null` for an anonymous visitor.
 * @param pathname - The request path being checked.
 */
export function hasAccess(
  user: Pick<User, 'id'> | null,
  pathname: string,
): boolean {
  if (!requiresLogin(pathname)) {
    return true;
  }
  return isEntitled(user);
}
