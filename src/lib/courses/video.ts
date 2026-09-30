/**
 * Turns a stored `video`-kind lesson URL (already validated against the
 * YouTube/Vimeo https allowlist by `createLesson`/`updateLesson`,
 * `@lib/courses/admin`) into a PRIVACY-FRIENDLY embeddable URL for the
 * lesson player: YouTube goes through `youtube-nocookie.com` (no tracking
 * cookie until the visitor actually plays it), Vimeo through its own
 * player domain either way.
 *
 * Deliberately re-parses and re-validates rather than trusting the stored
 * string verbatim — this is the one place that string becomes a live
 * `<iframe src>`, so it fails closed (`null`) on anything that is not
 * EXACTLY one of the four recognized shapes, even though `admin.ts` should
 * never have let anything else through.
 */
export type VideoProvider = 'youtube' | 'vimeo';

export interface VideoEmbed {
  provider: VideoProvider;
  embedUrl: string;
}

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,}$/;
const VIMEO_ID_RE = /^\d+$/;

export function toVideoEmbed(url: string): VideoEmbed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtube.com') {
    const id = parsed.searchParams.get('v');
    if (!id || !YOUTUBE_ID_RE.test(id)) return null;
    return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    if (!id || !YOUTUBE_ID_RE.test(id)) return null;
    return { provider: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (host === 'vimeo.com') {
    const id = parsed.pathname.slice(1).split('/')[0];
    if (!id || !VIMEO_ID_RE.test(id)) return null;
    return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  if (host === 'player.vimeo.com') {
    const match = parsed.pathname.match(/^\/video\/(\d+)$/);
    if (!match) return null;
    return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${match[1]}` };
  }

  return null;
}
