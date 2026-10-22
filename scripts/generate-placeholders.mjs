// Generates clearly-labelled placeholder images (public/placeholders/*.svg).
// Replace them by uploading real photos in /admin (services & portfolio) or by swapping the files
// referenced in src/lib/placeholders.ts — no code changes needed.
import { mkdirSync, writeFileSync } from "node:fs";

const out = new URL("../public/placeholders/", import.meta.url);
mkdirSync(out, { recursive: true });

const brow = `<path d="M-120 18 C -60 -40, 60 -46, 130 -6 C 70 -26, -40 -24, -120 18 Z" fill="none" stroke="#c9b38a" stroke-width="2.2"/>
  <path d="M-100 12 C -40 -30, 50 -34, 112 -8" fill="none" stroke="#c9b38a" stroke-width="1" opacity=".6"/>`;
const ring = `<circle cx="0" cy="0" r="46" fill="none" stroke="#c9b38a" stroke-width="2.4"/>
  <circle cx="0" cy="-46" r="7" fill="#c9b38a"/>`;
const spark = `<path d="M0 -40 L6 -6 L40 0 L6 6 L0 40 L-6 6 L-40 0 L-6 -6 Z" fill="none" stroke="#c9b38a" stroke-width="2"/>`;

const files = [
  ["hero", 1200, 1500, brow, "#0a0a0a", "#1c1a17"],
  ["brows", 1200, 900, brow, "#141210", "#2a2520"],
  ["piercing", 1200, 900, ring, "#0e0e0e", "#26221d"],
  ["service-brows", 800, 600, brow, "#f2ece3", "#e6dac3"],
  ["service-piercing", 800, 600, ring, "#f2ece3", "#e6dac3"],
  ["portfolio-1", 900, 1125, brow, "#1a1714", "#2f2922"],
  ["portfolio-2", 900, 1125, ring, "#efe8dd", "#ddd0bb"],
  ["portfolio-3", 900, 1125, spark, "#151515", "#2b2723"],
  ["portfolio-4", 900, 1125, brow, "#ebe3d6", "#d8c8ae"],
  ["portfolio-5", 900, 1125, ring, "#121110", "#29241f"],
  ["portfolio-6", 900, 1125, spark, "#f1ebe2", "#e0d3bf"],
];

for (const [name, w, h, motif, from, to] of files) {
  const dark = from.startsWith("#1") || from.startsWith("#0");
  const label = dark ? "#e6dac3" : "#75603c";
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
