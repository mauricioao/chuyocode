/**
 * Redirect guards for the magic-link routes (design §1, threat matrix T1/T2).
 *
 * Both exports are PURE string functions with zero I/O, because both guard a
 * value the ATTACKER chooses: `next` arrives on a URL that anyone can compose
 * and email to anyone else.
 *
 * `safeNextPath` is the open-redirect guard. An open redirect here is worse than
 * the usual kind: the visitor is bounced AFTER the confirm route has signed them
 * in, so a link that looks like ours delivers an authenticated visitor to
 * somebody else's page, primed to trust whatever it says.
 *
 * `stripAuthParams` keeps the single-use magic-link credentials — `token_hash`
 * and the PKCE `code` — out of the `Location` header. A credential that survives
 * into a redirect target is written to browser history and sent in the `Referer`
 * header of the next request the destination page makes — neither of which is a
 * place a session token can be recalled from.
 *
 * Kept in `src/lib/` rather than inside the route files so the rules are unit
 * tested directly instead of through a Request/Response round trip.
 */
import { DEFAULT_LANG } from './i18n';

/**
 * Query parameters that MUST NOT appear in a post-confirm redirect target.
 *
 * `token_hash` and `code` are BOTH credentials, and the list would be wrong
 * with either one missing:
 *  - `token_hash` is what a CUSTOM email template sends, redeemed by `verifyOtp`.
 *  - `code` is what the DEFAULT email template sends under the PKCE flow,
 *    redeemed by `exchangeCodeForSession`. It is a session in one exchange, so
 *    it is exactly as dangerous in a `Location` header, and it is the parameter
 *    the site actually receives today.
 *
 * `type` is not secret, but it is the other half of a replayable confirm URL and
 * it has no meaning anywhere else, so it leaves with its partners.
 */
const STRIPPED_PARAMS = ['token_hash', 'code', 'type'] as const;

/**
 * Query parameter the confirm route appends when a magic link did not verify.
 *
 * It exists because the `user-identity` spec requires a rejected link to invite
 * the visitor to request a new one, and the confirm route is a redirect with no
 * body of its own to say so. The sign-in page reads this marker and renders the
 * invitation.
 *
 * Exported as a constant rather than spelled at both ends: a marker the emitter
 * and the reader disagree about fails silently, showing nothing at all.
 */
export const AUTH_ERROR_PARAM = 'auth';

/** The only failure a visitor can act on: ask for another link. */
export const AUTH_ERROR_LINK_INVALID = 'link-invalid';

/** A path split into the three parts the helpers below rewrite independently. */
interface SplitPath {
  pathname: string;
  query: string;
  fragment: string;
}

/**
 * Split a same-site path into pathname, query and fragment.
 *
 * Hand-rolled rather than delegating to `URL`, because `URL` demands a base and
 * would hand back an absolute string that then has to be taken apart again. The
 * fragment is removed FIRST: `#` may legally contain a `?`, so searching for the
 * query in the whole string would find one inside the fragment.
 */
function splitPath(path: string): SplitPath {
  const hashAt = path.indexOf('#');
  const fragment = hashAt === -1 ? '' : path.slice(hashAt);
  const withoutFragment = hashAt === -1 ? path : path.slice(0, hashAt);

  const queryAt = withoutFragment.indexOf('?');
  return queryAt === -1
    ? { pathname: withoutFragment, query: '', fragment }
    : {
        pathname: withoutFragment.slice(0, queryAt),
        query: withoutFragment.slice(queryAt + 1),
        fragment,
      };
}

/** Reassemble a split path, dropping a `?` that has nothing behind it. */
function joinPath({ pathname, query, fragment }: SplitPath): string {
  return query === ''
    ? `${pathname}${fragment}`
    : `${pathname}?${query}${fragment}`;
}

/**
 * C0 controls and DEL.
 *
 * Browsers STRIP tab, LF and CR from a URL before parsing it, which means a
 * value containing them is not the value the browser will actually resolve:
 * `/<TAB>/evil.com` is resolved as `//evil.com`. Rather than replicate the
 * stripping rules and hope they match, anything in this class is refused —
 * no legitimate path on this site contains one.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A leading `scheme:`, e.g. `https:`, `javascript:`, `data:`. */
const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;

/**
 * How many times the value may be percent-decoded before we give up on it.
 *
 * A well-formed path reaches a fixed point in one or two passes. A value still
 * changing after four is being obfuscated, and a guard that cannot say what a
 * string means must not approve it.
 */
const MAX_DECODE_PASSES = 4;

/**
 * Is this exactly a same-site, same-origin path?
 *
 * Every clause rejects a way of reaching a DIFFERENT ORIGIN from something that
 * still looks like a path:
 *  - a leading `/` is mandatory — `evil.com/x` is a relative reference that some
 *    resolvers treat as a host;
 *  - `//host` is protocol-relative: it keeps our scheme and changes our host;
 *  - `/\host` is the same attack, because the WHATWG URL parser normalises `\`
 *    to `/` for special schemes — so the browser reads it as `//host`;
 *  - a `scheme:` prefix is an absolute URL, and `javascript:`/`data:` are script
 *    execution rather than navigation.
 *
 * The scheme clause is redundant while the leading-slash clause stands, and it
 * is kept deliberately: it names the hazard the task names, and it keeps the
 * function correct if the leading-slash rule is ever relaxed.
 */
function isSameSitePath(value: string): boolean {
  if (value === '') {
    return false;
  }
  if (CONTROL_CHARACTERS.test(value)) {
    return false;
  }
  if (SCHEME_PREFIX.test(value)) {
    return false;
  }
  if (!value.startsWith('/')) {
    return false;
  }

  const second = value[1];
  return second !== '/' && second !== '\\';
}

/**
 * 🔴 VALIDATION RUNS AFTER DECODING, AND AFTER EVERY DECODE, NOT JUST THE FIRST.
 *
 * This is the deliberate decision the guard turns on. Checking only the raw
 * string is the classic bypass: `/%2F%2Fevil.com` shows one harmless leading
 * slash and decodes into `///evil.com`, and `/%252F%252Fevil.com` survives a
 * single decode too. So the value is decoded repeatedly to a fixed point and
 * EVERY form along the way — the raw one included — must independently look
 * like a same-site path.
 *
 * Checking every intermediate form rather than only the endpoints matters
 * because we do not control how many decoders sit between this return value and
 * the browser: the framework, a proxy or a CDN may each decode once. A form that
 * is unsafe at any depth is a form somebody can arrange to have resolved.
 *
 * A value that cannot be decoded at all (`%zz`) is refused for the same reason
 * an over-nested one is: we cannot say what it means.
 */
function isSafeNextPath(raw: string): boolean {
  let current = raw;

  for (let pass = 0; pass <= MAX_DECODE_PASSES; pass += 1) {
    if (!isSameSitePath(current)) {
      return false;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return false;
    }

    if (decoded === current) {
      return true;
    }
    current = decoded;
  }

  return false;
}

/**
 * Resolve an attacker-supplied `next` into a path this site may redirect to.
 *
 * Returns `raw` UNCHANGED when it is a same-site path — the caller asked for a
 * specific destination and re-encoding it here would quietly alter it. Anything
 * else, including an absent or empty value, becomes the default-locale home.
 *
 * The fallback is deliberately a real page rather than an error: a visitor who
 * followed a tampered link has still signed in successfully, and dropping them
 * on the home page costs them one click.
 *
 * @param raw - The `next` query parameter, already decoded once by `URLSearchParams`.
 * @returns A path that is guaranteed to stay on this origin.
 */
export function safeNextPath(raw: string | null | undefined): string {
  const fallback = `/${DEFAULT_LANG}/`;

  if (typeof raw !== 'string') {
    return fallback;
  }

  return isSafeNextPath(raw) ? raw : fallback;
}

/**
 * Remove the magic-link credentials from a redirect target (T2).
 *
 * Applied to the target of the post-confirm 303, so neither `token_hash` nor the
 * PKCE `code` can reach the `Location` header by riding inside `next`. The
 * confirm route builds its target from `next` alone and never from its own URL,
 * so this is the second of two independent barriers rather than the only one.
 *
 * The fragment is preserved and the `?` disappears entirely when stripping
 * empties the query — a dangling `?` is a different URL string, and it would
 * show up in history and in every canonical-link comparison.
 *
 * @param path - A same-site path, normally the output of {@link safeNextPath}.
 * @returns The same path with `token_hash`, `code` and `type` removed.
 */
export function stripAuthParams(path: string): string {
  const parts = splitPath(path);
  if (parts.query === '') {
    return path;
  }

  const params = new URLSearchParams(parts.query);
  for (const name of STRIPPED_PARAMS) {
    // `delete` removes EVERY occurrence, which is what a repeated
    // `?token_hash=a&token_hash=b` requires.
    params.delete(name);
  }

  return joinPath({ ...parts, query: params.toString() });
}

/**
 * Mark a redirect target as "that link did not work, ask for another one".
 *
 * Used only on the confirm route's failure path. Any existing `auth` parameter
 * is replaced rather than appended to, so a crafted `next` cannot smuggle a
 * second value in and decide what the sign-in page says.
 *
 * @param path - A same-site path, normally the output of {@link safeNextPath}.
 */
export function withAuthError(path: string): string {
  const parts = splitPath(path);
  const params = new URLSearchParams(parts.query);
  params.set(AUTH_ERROR_PARAM, AUTH_ERROR_LINK_INVALID);

  return joinPath({ ...parts, query: params.toString() });
}
