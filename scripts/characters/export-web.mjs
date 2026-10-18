#!/usr/bin/env node
/**
 * Exports the CHOSEN character-pose masters (processed by `process.mjs` into
 * `../ChuyoCode_others/Personajes/_procesados/`) into the AVIF + WebP set the
 * site actually serves, at `public/images/characters/<character>/`.
 *
 * Deliberately NOT "export every master" — DIRECCION-VISUAL.md names ~40
 * poses across both characters, but only a handful are wired into the UI
 * today (the desk helper's avatar, `GameResult`'s reaction, Paco on the
 * desk, Vanina peeking at the window edge). Shipping the rest would just be
 * dead weight in the public bundle until a caller actually needs them — add
 * a row to `POSES` below and re-run this script when one does.
 *
 *   node scripts/characters/export-web.mjs
 *
 * Each row names a `displayHeightCss` — the tallest CSS height any current
 * call site renders that pose at — and this script resizes by WIDTH (same
 * `pnpm images:optimize` convention the rest of the site's responsive art
 * uses) computed from the MASTER's own aspect ratio against that height, at
 * 1x and 2x pixel density. Alpha (transparent background) is preserved —
 * these composite directly over whatever surface/widget sits behind them,
 * never a flat rectangle.
 *
 * Settings mirror `scripts/optimize-image.mjs` exactly (AVIF quality 50 /
 * WebP quality 76, both effort 6) — same visual target, flat hand-drawn line
 * art, just sourced from the processed PNG masters instead of a single large
 * illustration.
 *
 * MASTERS_ROOT is resolved via `./paths.mjs` (`resolveOthersRoot`): it reads
 * the MAIN checkout's `ChuyoCode_others` sibling from git's common dir, so
 * it still finds the right place when this script runs from a git worktree
 * (see `paths.mjs` for the full resolution order). PUBLIC_ROOT, by contrast,
 * stays relative to THIS script's own `__dirname` on purpose — generated
 * output must land in whichever checkout/worktree you're actually on.
 */
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { resolveOthersRoot } from './paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASTERS_ROOT = join(resolveOthersRoot({ scriptDir: __dirname }), 'Personajes', '_procesados');
const PUBLIC_ROOT = join(__dirname, '..', '..', 'public', 'images', 'characters');

/**
 * The poses actually wired into the UI (keep this list and
 * `src/content/characterPoses.ts`'s own `CHARACTER_POSES` registry in sync —
 * the registry's `displayHeightCss` values below ARE this list, the registry
 * just also carries `flushEdge`/srcset-building concerns the export script
 * does not need).
 */
const POSES = [
  { character: 'vanina', slug: 'avatar', displayHeightCss: 112 }, // desk helper avatar (desk: h-28 = 112px)
  { character: 'paco', slug: 'avatar', displayHeightCss: 112 }, // desk helper avatar fallback-of-fallback parity
  // GameResult (UI round 2, owner feedback): a fixed HEIGHT per breakpoint,
  // `width: auto` — never `object-fit: cover` (that cropped the full-body
  // "celebra" pose's own hands/feet). 176 is the TALLEST CSS height any
  // GameResult breakpoint renders these at (desktop/laptop; phones <=400px
  // render them at 144 instead, downscaled from this same export).
  { character: 'vanina', slug: 'celebra', displayHeightCss: 176 }, // GameResult: perfect
  { character: 'vanina', slug: 'pulgar-arriba', displayHeightCss: 176 }, // GameResult: good ("¡Muy bien!")
  { character: 'vanina', slug: 'casi', displayHeightCss: 176 }, // GameResult: retry ("¡Casi! Sigue practicando")
  { character: 'vanina', slug: 'asoma-izquierda', displayHeightCss: 100 }, // peeking from the exercise window's outer left edge, desktop only
  { character: 'paco', slug: 'sentado-borde', displayHeightCss: 140 }, // sitting on a desk widget's top edge
];

const DENSITIES = [1, 2];

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

for (const { character, slug, displayHeightCss } of POSES) {
  const masterPath = join(MASTERS_ROOT, character, `${slug}.png`);
  const { width: masterWidth, height: masterHeight } = await sharp(masterPath).metadata();
  if (!masterWidth || !masterHeight) throw new Error(`could not read dimensions for ${masterPath}`);

  const outDir = join(PUBLIC_ROOT, character);
  await mkdir(outDir, { recursive: true });

  console.log(`${character}/${slug}.png (${masterWidth}×${masterHeight}) ->`);
  for (const density of DENSITIES) {
    const targetHeight = displayHeightCss * density;
    // Height-driven resize (never a pre-computed width): sharp derives the
    // exact matching width from the master's own aspect ratio, so there is
    // no rounding drift between the two densities' own ratios.
    const resizedBuffer = await sharp(masterPath)
      .resize({ height: targetHeight, withoutEnlargement: true })
      .toBuffer();
    const { width: outWidth } = await sharp(resizedBuffer).metadata();

    const avifPath = join(outDir, `${slug}-${outWidth}.avif`);
    const webpPath = join(outDir, `${slug}-${outWidth}.webp`);
    await sharp(resizedBuffer).avif({ quality: 50, effort: 6 }).toFile(avifPath);
    await sharp(resizedBuffer).webp({ quality: 76, effort: 6 }).toFile(webpPath);
    console.log(
      `  ${density}x -> ${outWidth}×${targetHeight}  avif ${kb((await stat(avifPath)).size)}  webp ${kb((await stat(webpPath)).size)}`,
    );
  }
}

console.log(`\nWrote ${POSES.length} pose(s) × ${DENSITIES.length} densities to ${PUBLIC_ROOT}`);
