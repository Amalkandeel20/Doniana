// Generates clearly-labelled placeholder images (public/placeholders/*.svg).
// Replace them by uploading real photos in /admin (services & portfolio) or by swapping the files
// referenced in src/lib/placeholders.ts — no code changes needed.
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("../public/placeholders/", import.meta.url);
mkdirSync(out, { recursive: true });

const brow = `<path d="M-120 18 C -60 -40, 60 -46, 130 -6 C 70 -26, -40 -24, -120 18 Z" fill="none" stroke="#6b5a4e" stroke-width="2.2"/>
  <path d="M-100 12 C -40 -30, 50 -34, 112 -8" fill="none" stroke="#6b5a4e" stroke-width="1" opacity=".6"/>`;
const ring = `<circle cx="0" cy="0" r="46" fill="none" stroke="#b08a5a" stroke-width="2.4"/>
  <circle cx="0" cy="-46" r="7" fill="#b08a5a"/>`;
const spark = `<path d="M0 -40 L6 -6 L40 0 L6 6 L0 40 L-6 6 L-40 0 L-6 -6 Z" fill="none" stroke="#44594b" stroke-width="2"/>`;

const files = [
  ["hero", 1600, 1000, brow, "#efe4da", "#e2c9c4"],
  ["brows", 1200, 900, brow, "#e9ddd2", "#d9c3b3"],
  ["piercing", 1200, 900, ring, "#f0e2df", "#dcbfbb"],
  ["service-brows", 800, 600, brow, "#f3ebe2", "#e6d6c8"],
  ["service-piercing", 800, 600, ring, "#f3e3e0", "#e2c9c4"],
  ["portfolio-1", 900, 1125, brow, "#ece2d8", "#d9c6b5"],
  ["portfolio-2", 900, 1125, ring, "#f3e3e0", "#e0c4c0"],
  ["portfolio-3", 900, 1125, spark, "#e4e9e2", "#c9d4c8"],
  ["portfolio-4", 900, 1125, brow, "#f1e5dc", "#e3cfc2"],
  ["portfolio-5", 900, 1125, ring, "#efe0dc", "#d8bab5"],
  ["portfolio-6", 900, 1125, spark, "#ebe4da", "#d6cbbb"],
];

for (const [name, w, h, motif, from, to] of files) {
  const label = "#6b5a4e";
  const scale = Math.min(w, h) / 320;
  writeFileSync(
    new URL(`${name}.svg`, out),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Placeholder image — replace with a real photo">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <g transform="translate(${w / 2} ${h / 2 - 20 * scale}) scale(${scale})">${motif}</g>
  <text x="50%" y="${h - 48 * scale}" text-anchor="middle" font-family="Georgia, serif" font-size="${11 * scale}" letter-spacing="${3 * scale}" fill="${label}" opacity=".9">PLACEHOLDER · صورة مؤقتة</text>
</svg>
`,
  );
}
console.log(`wrote ${files.length} placeholders`);
