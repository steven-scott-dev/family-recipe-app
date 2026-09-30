// Generates PWA PNG icons from public/icon.svg at build time.
// Run automatically via the `prebuild` npm script so the PNGs never need committing.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(join(root, 'public', 'icon.svg'));
const BG = '#0f172a';

async function main() {
  // Standard icons: full-bleed render of the source SVG.
  await sharp(svg).resize(192, 192).png().toFile(join(outDir, 'icon-192.png'));
  await sharp(svg).resize(512, 512).png().toFile(join(outDir, 'icon-512.png'));

  // Maskable icon: artwork inside the inner 80% safe zone on a full-bleed background.
  const inner = await sharp(svg).resize(410, 410).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([{ input: inner, left: 51, top: 51 }])
    .png()
    .toFile(join(outDir, 'icon-maskable-512.png'));

  console.log('PWA icons generated in public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
