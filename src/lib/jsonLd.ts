/**
 * Safe JSON-LD serialization (SEO basics pass).
 *
 * `JSON.stringify` alone is not safe to inject into a `<script>` element: a
 * string VALUE containing the literal sequence `</script` (case-insensitive)
 * would close the script tag early and let whatever follows parse as raw
 * HTML — an injection vector if that value ever comes from Sanity content
 * (a book description, an article excerpt). Escaping the forward slash in
 * that one sequence (`<\/script`) neutralizes it without changing the JSON's
 * meaning: a backslash-escaped `/` is valid JSON and parses back to a plain
 * `/`. The same fix most JSON-LD guides (and React/Next's own `dangerouslySetInnerHTML`
 * docs) apply.
 */

/**
 * Serialize `data` to a JSON string safe to inject via
 * `<script type="application/ld+json" set:html={...}>`.
 */
export function toJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/<\/script/gi, '<\\/script');
}
