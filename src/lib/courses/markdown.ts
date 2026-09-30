/**
 * Sanitized Markdown rendering for `text`-kind course lessons
 * (`course_lessons.content.markdown`). Used both server-side (the lesson
 * player, `/[lang]/cursos/[slug]/[lessonId]`) and client-side (the admin
 * editor's live preview in `CourseEditPanel`) — same function, so the
 * preview an author sees while writing is EXACTLY what a visitor gets, not
 * an approximation.
 *
 * `marked` turns Markdown into HTML; `sanitize-html` then strips it down to
 * a small allowlist — no `<script>`, no event handler attributes, no
 * `javascript:` URLs, no raw `<iframe>`/`<style>`/arbitrary HTML a course
 * author (or a compromised admin session) might slip into the source. This
 * is the ONLY path lesson markdown is ever rendered through; nothing else
 * in this codebase calls `marked` directly.
 */
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'a',
  'code',
  'pre',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'img',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  // `target`/`rel` are allowed only because `transformTags` below adds them
  // itself on every link — never because a lesson author supplied them.
  a: ['href', 'title', 'target', 'rel'],
  img: ['src', 'alt', 'title'],
};

/**
 * Renders `markdown` to sanitized HTML, safe to inject with `set:html`
 * (Astro) or `dangerouslySetInnerHTML` (React) — every caller of this
 * function is trusted to do so, and no other rendering path for lesson
 * markdown should exist.
 */
export function renderLessonMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    // Every link opens in a new tab, and never grants the target page
    // `window.opener` — added unconditionally, not left to lesson authors.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}
