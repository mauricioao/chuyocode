---
name: glass-desk-ui
description: "Trigger: any visual/UI work inside the Inglés product (ChuyoCode) — colors, spacing, components, layout, characters (Vanina/Paco), or presentation mode. Load before editing styling, tokens, or character placement under src/components, src/styles, or any [lang]/ingles page."
---

Full written spec (Spanish, canonical): `E:\Mauricio\Freelancer\ChuyoCode_others\docs\DIRECCION-VISUAL.md`. This skill is a map to the code, not a copy of that doc — read it for anything not covered here, especially open questions (§9) and discarded directions (§3.4).

## Two identities — do not mix them

- **Brand** (home, Libros, Noticias, header/footer outside Inglés): black `#000` + yellow `#FACC15`, Raleway, full-bleed cinema feel. **Frozen** — the owner does not want these colors touched.
- **Inglés product** (desk, catalog, practice, editor, level test, presentation): "glass desk with ink" — white/greys, a few pure accents, glass widgets/windows, B&W ink characters. Scoped by `[data-theme="ingles"]` on `<html>` (set by `BaseLayout`'s `theme="ingles"` prop).

Never hardcode a hex or px value for anything that already has a token below — use the token so both themes (and the contrast tests) stay in sync.

## Where tokens live (exact paths)

- `src/styles/global.css` — the `@theme` block: canvas/surface/ink colors, the 6 `--color-tile-*` tray colors, the 5 `--color-pop-*` decorative accents (+ `-deep` text-bearing variants), radii (`--radius-field/card/pill`), shadows (`--shadow-elevation-*`, `--shadow-floating`, `--shadow-glow-*`), the `[data-theme='ingles']` override block (this is where the glass desk's actual values live — canvas `#EEEFF4`, surface `#FFFFFF`, ink `#111215`), and `.ingles-glass` / `.glass-floating` (the ONE glass material recipe: two-stop white gradient, `blur(24px) saturate(170%)`, rim + ring + elevation-2 shadow — never invent a second glass recipe).
- `src/styles/ingles-theme-contrast.test.ts` and `src/styles/tailwind-tokens.test.ts` — guard contrast and token drift; re-run after touching the `[data-theme='ingles']` block.
- `src/components/islands/mechanics/chip.ts` — the one chip/capsule shape shared by match/reorder/groupsort/cloze/drop. `CHIP_MATERIAL` (grey glass rest), `CHIP_PLACED` (white, raised), `stageChipColorClass(index)` (colour-filled variant).
- `src/components/islands/mechanics/palette.ts` — the 6-colour `TILE_COLOR_CLASSES` tray palette, assigned by the item's stable position, never by correctness (red/green stay reserved for ✓/✕).
- `src/content/characters.ts` vs `src/content/characterPoses.ts` — see Characters below; these are two **different** registries, do not confuse them.

## Component rules (full detail: DIRECCION-VISUAL.md §3.3/§3.4)

- Capsule shape: anything touched or floating (buttons, chips, search, tabs, segmented control). Buttons hug their text width, never stretched; heights 28/34/50px.
- Cards/fields: rounded rectangle (~22% of height radius).
- Section titles: normal case, never ALL CAPS. Icons: matte, never glossy.
- **Discarded, do not reintroduce**: light-halo glow behind alerts/cards, glossy icons, stretched buttons, the small "Inglés" label on window title bars, empty-margin windows, the full 12-color iOS palette (kept 5).

## Characters (full detail: DIRECCION-VISUAL.md §4)

- Pure black ink, Open Peeps style: even line weight, white fill, solid black hair, no grey/shading, no color on clothing.
- **Two separate registries, don't collide them**: `src/content/characters.ts` is the OLDER set of 5 Open Peeps bust badges (paco/luna/mia/bruno/tobi, used as content-screen decorations, assets `public/images/characters/<slug>-v2-<width>.{avif,webp}`). `src/content/characterPoses.ts` is the NEW line-art pose registry for **Vanina** (the teacher/helper) and **Paco** (the desk companion) — assets `public/images/characters/<character>/<slug>-<width>.{avif,webp}`, e.g. `vanina/avatar-114.avif`. Adding a new pose call site means adding a row to `scripts/characters/export-web.mjs`'s `POSES` list AND a row in `characterPoses.ts` by hand.
- Source art: originals in `ChuyoCode_others/Personajes/`, processed (chroma-keyed, cropped) in `ChuyoCode_others/Personajes/_procesados/<vanina|paco>/<slug>.png`. Pipeline script: `scripts/characters/process.mjs` (chroma-key + crop) and `scripts/characters/export-web.mjs` (web export).
- **Never shrink a character to fit a box.** Keep the natural aspect ratio and crop (`object-fit: cover` + per-pose `object-position`), showing as much of the figure as fits. A shrunk avatar was rejected by the owner as "imperdonable para un UI".
- Placement must make narrative sense (sitting ON something, peeking FROM an edge) — never floating decoration. Example in code: `src/components/ingles/DeskHelper.astro` (Vanina's avatar + tip bubble, bottom-left on the desk hub) and `DeskWindowManager.astro` (Vanina peeking from the exercise window's left edge, desktop only).
- Cast: **Vanina** = the teacher/helper (reacts on the results screen, peeks from the exercise window). **Paco** = the desk companion (sits on a widget, e.g. `paco/sentado-borde`).

## Reference-first loop (mandatory order)

1. **Get a visual target before writing any code.** Ask the owner, or look in `ChuyoCode_others/propuestas/<name>/index.html` (static HTML mockups) or `ChuyoCode_others/UX/referencias/` (reference screenshots/photos). Do not guess a layout from the spec text alone — that produced the 2026-10-12 rejected placements (character floating on nothing, peek rendered in front of instead of from an edge).
2. Implement against that reference and the existing tokens above.
3. **Screenshot the real result** with Playwright at 375px, 768px and 1280px widths (plus the signed-in desk/exercise window specifically — the no-session flows don't show characters). Also check the living kit, `/[lang]/admin/ui` (`UiReferenceIsland.tsx` — moderators only, every control/state in one place; sign in as a moderator, requires a session).
4. Compare the screenshot against the reference and the admin kit side by side; list concrete differences (spacing, color, radius, character crop/position).
5. Fix and re-screenshot.
6. **Never report a visual change as done without having looked at the screenshot.** Tests passing is not visual verification — see the `chuyo-verify` skill for the full checklist (resolution sizes, where captures are saved).
