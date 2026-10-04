/**
 * Turns one large source image (PNG/JPG, e.g. an AI-generated illustration)
 * into the responsive AVIF + WebP set the site serves through `<picture>`.
 *
 *   pnpm images:optimize <input> <outDir> <name> <width> [<width>…]
 *
 * Example (the home's Inglés banner, desktop art):
 *   pnpm images:optimize ../ChuyoCode_others/Ingles/banner/banner-desktop.jpg \
 *     public/images/home/ingles-banner ingles-banner-v1-desktop 960 1440 1920 2752
 *
 * Writes `<name>-<width>.avif` and `<name>-<width>.webp` per width (never
 * upscaling past the source) and prints each file's size. Settings: AVIF
 * quality 50 / WebP quality 76, both effort 6 — visually clean on flat,
 * hand-drawn illustrations with paper grain, at a fraction of the JPG weight.
 * Metadata is stripped (sharp's default), which also drops any generator tags.
 *
 * Bump the `-v<n>` in `<name>` when replacing an image so browsers and the CDN
 * never serve the old file under the same URL.
 */
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const [input, outDir, name, ...rawWidths] = process.argv.slice(2);
const widths = rawWidths.map(Number).filter((w) => Number.isInteger(w) && w > 0);

if (!input || !outDir || !name || widths.length === 0) {
  console.error('Usage: pnpm images:optimize <input> <outDir> <name> <width> [<width>…]');
  process.exit(1);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

await mkdir(outDir, { recursive: true });
const { width: sourceWidth, height: sourceHeight } = await sharp(input).metadata();
console.log(`${input}: ${sourceWidth}×${sourceHeight}, ${kb((await stat(input)).size)}`);

for (const width of widths) {
  const resized = sharp(input).resize({ width, withoutEnlargement: true });
  const avif = join(outDir, `${name}-${width}.avif`);
  const webp = join(outDir, `${name}-${width}.webp`);
  await resized.clone().avif({ quality: 50, effort: 6 }).toFile(avif);
  await resized.clone().webp({ quality: 76, effort: 6 }).toFile(webp);
  console.log(`  ${width}w  avif ${kb((await stat(avif)).size)}  webp ${kb((await stat(webp)).size)}`);
}
