/**
 * Why was this visitor sent to the sign-in page?
 *
 * Walkthrough finding (`RECORRIDO-2026-10-15.md`, Media): a guest who taps
 * "Imprimir" lands on `/auth/entrar` with no explanation, unlike the catalog
 * (`practice.guestBanner`/`guestInvite` in `@lib/i18n`), which always tells a
 * guest what an account gives them. This maps the already-validated `next`
 * query param (see `@lib/authRedirect`'s `safeNextPath` — this function never
 * sees an unvalidated value from a real request) to one of a small, fixed set
 * of reasons the page can render as a short line above the form.
 *
 * Pure and zero-I/O on purpose, same reasoning as `safeNextPath`: it is
 * tested directly against a table of inputs rather than through a
 * Request/Response round trip.
 */
import { isValidLang, type Lang } from './i18n';

/** One of the fixed reasons the sign-in page can explain itself with. */
export type SignInReasonKey = 'imprimir' | 'crear' | 'misActividades' | 'desk';

/** `/<lang>/ingles/actividades/<id>/imprimir` — print an activity. */
const IMPRIMIR_PATTERN = /^\/ingles\/actividades\/[^/]+\/imprimir$/;

/** `/<lang>/crear` or `/<lang>/crear/<id>` — the activity editor. */
const CREAR_PATTERN = /^\/crear(?:\/.*)?$/;

/** `/<lang>/mis-actividades` and anything nested under it. */
const MIS_ACTIVIDADES_PATTERN = /^\/mis-actividades(?:\/.*)?$/;

/** The bare Inglés desk hub, `/<lang>/ingles` with or without a trailing slash. */
const DESK_PATTERN = /^\/ingles\/?$/;

/**
 * Resolve the reason a visitor was redirected to sign-in, from the `next`
 * path the sign-in page received.
 *
 * `lang` is the CURRENT page's locale, not reparsed from `nextPath`: a
 * `next` whose own locale segment does not match it is treated the same as
 * any other path this function does not recognize (`null`) rather than
 * localizing a line for a destination the visitor is not actually on. This
 * also means a malformed, foreign, or otherwise unsafe `nextPath` — one that
 * never made it past `safeNextPath` — simply fails every pattern below and
 * returns `null`; nothing here needs to re-validate it.
 *
 * @param nextPath - The `next` query value, ideally already run through
 *   `safeNextPath`. Anything that is not a `/<lang>/...` string is `null`.
 * @param lang - The sign-in page's own locale.
 */
export function signInReason(
  nextPath: string | null | undefined,
  lang: Lang,
): SignInReasonKey | null {
  if (typeof nextPath !== 'string' || !isValidLang(lang)) {
    return null;
  }

  // Drop the query string and fragment: a reason is decided by the
  // destination's PATH, never by its params (and never rendered verbatim —
  // see this module's header).
  const pathname = nextPath.split(/[?#]/)[0] ?? '';
  const segments = pathname.split('/');

  // `['', '<lang>', ...rest]` — a same-site path always starts with '/'.
  if (segments[0] !== '' || segments[1] !== lang) {
    return null;
  }

  const rest = `/${segments.slice(2).join('/')}`;

  if (IMPRIMIR_PATTERN.test(rest)) {
    return 'imprimir';
  }
  if (CREAR_PATTERN.test(rest)) {
    return 'crear';
  }
  if (MIS_ACTIVIDADES_PATTERN.test(rest)) {
    return 'misActividades';
  }
  if (DESK_PATTERN.test(rest)) {
    return 'desk';
  }

  return null;
}
