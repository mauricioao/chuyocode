# How to publish a news article (`noticia`) — brief for an AI model

This document is self-contained. It tells you exactly how to create and publish
a `news` document in the ChuyoCode Sanity project through the Sanity MCP tools,
without needing to explore the codebase first.

If you only need the field reference, skip to **§3**. If you need the full
step-by-step process, read from the top.

---

## 1. Resource identity (use these exact values)

| Key | Value |
|---|---|
| `projectId` | `z9wkqssq` |
| `dataset` | `production_` (note the trailing underscore — it is literally the dataset name, not a typo) |
| `workspaceName` | `chuyocode-studio` (NOT `default` — passing `default` or omitting it targets the wrong workspace) |
| Studio URL | `https://chuyocode.sanity.studio/` |
| Document `_type` | `news` |

Every MCP call (`query_documents`, `create_documents`, `patch_documents`,
`publish_documents`, `get_schema`, …) needs `resource: { projectId, dataset }`.
Calls that resolve a workspace (`get_schema`, `deploy_schema`, …) also need
`workspaceName: "chuyocode-studio"`.

**Important:** this schema is **Studio-deployed**, not MCP-managed. `get_schema`
works fine (read-only), but `deploy_schema` will refuse. If a schema field
needs to change, that's a code change in `schemas/news.ts` followed by
`pnpm exec sanity deploy` — not something you do through MCP content tools.
That is a different, rarer task than "publish a news article."

---

## 2. The product, in one paragraph

`news` documents are the "noticias" section of the site: bilingual (ES/EN)
articles with a cover image, rich text body, and optional discovery metadata
(featured flag, theme tags, hero art) that let the article also appear as a
home-page hero slide or spotlight card. Spanish (`es`) is always the fallback
language everywhere in the frontend — if `en` is missing, the site silently
shows the Spanish text instead of breaking.

---

## 3. Field reference

All localized fields are objects `{ es: string, en: string }` (or the `array`
equivalent for rich text). **`es` is required in practice** — every frontend
query does `coalesce(field[$lang], field.es, field)`, so a missing `es` value
means the field renders empty for BOTH languages, not just one.

| Field | Type | Required? | Localized? | Notes |
|---|---|---|---|---|
| `title` | object `{es, en}` string | Yes (`es`) | Yes | Also feeds the `slug` source. |
| `slug` | slug | Yes | No | Generated from `title.es`, max 96 chars. Must be unique. |
| `excerpt` | object `{es, en}` text | Recommended | Yes | Short summary shown in cards/lists. |
| `body` | object `{es, en}` Portable Text array | Yes (`es`) | Yes | Main article content. Supports strong/em/code/underline/strike + link annotations. |
| `publishedAt` | datetime | Recommended | No | Defaults to "now" in Studio; set explicitly if backdating. |
| `image` | image (hotspot) | Yes for a real article | No | The card/poster thumbnail used everywhere except the hero slide. |
| `featured` | boolean | No (default `false`) | No | Puts the article in the home hero carousel. |
| `tagline` | object `{es, en}` string | No | Yes | Short editorial phrase for hero/spotlight only. |
| `themes` | array of strings | No | No | Freeform tags that group content into home rows (press Enter per tag in Studio). `recomendados` is currently the one code-reserved special value (`RESERVED_THEMES` in `src/lib/sanity.ts`) — the Studio field description also mentions `mas-vistos` as reserved, but that string has no special handling in code today. Treat `recomendados` as the only functionally special tag. |
| `contentLogo` | image (hotspot) | No | No | Transparent PNG logo shown over the title in the hero carousel. Ignored everywhere else. |
| `heroBackground` | image (hotspot) | No | No | Panoramic hero backdrop. Falls back to `image` if omitted. |
| `sections` | array of `newsSection` objects | No | Partially | See below — this is the "random side image+text block" layout. |

### `sections[]` (the `newsSection` object)

Each item is:

- `image` — image (hotspot). **Shared between languages** — there is only one
  image per section, not one per language.
- `alt` — plain string, optional alt text (defaults to `""` if omitted).
- `body` — object `{es, en}` Portable Text array. **Only this is localized.**

The frontend renders these sections with a per-request random left/right image
side (`src/lib/sections.ts`), purely presentational — you don't choose the
side when authoring.

---

## 4. Step-by-step process

### Step 0 — Check for a slug collision

Slugs must be unique. Before creating, query for an existing document with the
same intended slug:

```groq
*[_type == "news" && slug.current == $slug][0]{ _id }
```

If something comes back, pick a different slug or confirm you're meant to
update that existing document instead (`patch_documents`, not
`create_documents`).

### Step 1 — Handle images first

**No MCP tool in this project uploads a raw image file.**
`dataset_assets_upload` only returns *local Sanity CLI guidance* — it does not
read or upload bytes. Practically, this means:

- If the images already exist as Sanity assets (e.g. reused from another
  article), find their asset `_id` with a GROQ query
  (`*[_type == "sanity.imageAsset"]{_id, url}`) and reference them directly.
- If they are new images, you cannot attach them yourself through MCP. Create
  the text content first (Step 2), leave `image`/`sections[].image`/etc.
  unset or ask the user to upload them in Studio (`https://chuyocode.sanity.studio/`).
  This matches how the previous news article (Claude Opus 5 draft) was done:
  content was created via MCP, and the user attached all four image assets
  manually in Studio afterward.

Never invent an asset `_ref` — an image reference to a non-existent asset ID
breaks the document silently in Studio and fails GROQ image projections.

### Step 2 — Create the draft

Use `create_documents` with `type: "news"`. Omit `_id` (let Sanity generate
one) unless a stable ID is required. Example content shape:

```json
{
  "type": "news",
  "content": {
    "title": { "es": "Título en español", "en": "Title in English" },
    "slug": { "_type": "slug", "current": "mi-slug-unico" },
    "excerpt": { "es": "Resumen corto.", "en": "Short summary." },
    "body": {
      "es": [{ "_type": "block", "children": [{ "_type": "span", "text": "Cuerpo en español." }] }],
      "en": [{ "_type": "block", "children": [{ "_type": "span", "text": "Body in English." }] }]
    },
    "publishedAt": "2026-09-06T12:00:00Z",
    "featured": false,
    "themes": ["inteligencia-artificial"]
  }
}
```

This creates a `drafts.<id>` document — it does **not** appear on the live
site yet (every frontend query filters out `_id in path("drafts.**")`).

If you already have image asset IDs from Step 1, add them as:

```json
"image": { "_type": "image", "asset": { "_type": "reference", "_ref": "image-abc123-1200x800-jpg" } }
```

### Step 3 — Verify the draft

Read it back with `query_documents` (or `get_document`) using
`perspective: "drafts"` and eyeball the localized fields, slug, and any image
references before publishing.

### Step 4 — Publish (only when ready)

```
publish_documents({ resource, ids: ["<the-document-id>"] })
```

Do **not** publish automatically if images are still pending — an unpublished
draft with complete text and missing images is a normal, expected intermediate
state (this is what happened with the Claude Opus 5 article: it was left
unpublished on purpose while the user attached images).

---

## 5. Rules that silently break things

- **Wrong workspace name.** `workspaceName` defaults to `"default"` in most
  MCP tools. This project's workspace is `chuyocode-studio`. Passing the
  default silently resolves against the wrong workspace record.
- **Missing `es` on a localized field.** Every query falls back to `es`, never
  to `en`. An article with only `en` filled in renders empty text for both
  languages on the live site.
- **One image per section, not two.** Don't try to give `sections[].image` a
  per-language value — the schema only has one `image` per section; only
  `body` is split into `es`/`en`.
- **Trying to upload binary images via MCP.** There is no tool for this in
  this project. Reference existing asset IDs or hand off to a human/Studio.
- **Calling `deploy_schema` for a content change.** This project's schema is
  Studio-deployed; `deploy_schema` will refuse. Only touch
  `schemas/news.ts` + `pnpm exec sanity deploy` if you actually need a new
  field, which is a different, much rarer task than authoring an article.
- **Forgetting the draft is invisible.** `create_documents` never publishes.
  If the user says "I don't see the news article," check whether it was ever
  published.

---

## 6. Quick checklist

1. Confirm `projectId: z9wkqssq`, `dataset: production_`, `workspaceName: chuyocode-studio`.
2. Check the slug is unique.
3. Resolve images (reuse existing asset IDs, or defer to Studio upload).
4. `create_documents` with `type: "news"` and at least `title.es`, `slug`, `body.es`.
5. `query_documents` (drafts perspective) to sanity-check the draft.
6. `publish_documents` only once content (and ideally images) are final.
