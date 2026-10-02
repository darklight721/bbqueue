// Generates the BBQueue icon candidates in this folder.
// Run: node .scratch/bbq-icon/build.mjs
// Output SVGs are plain, hand-readable markup (no <use>, no rasters, no external refs).

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const C = {
  court: "#0b6b45",
  deep: "#08543a",
  line: "#f7f9f4",
  volt: "#d8f53a",
  ink: "#14201a",
};

// ---------------------------------------------------------------------------
// Geometry. Everything is drawn along a horizontal skewer through (256,256),
// then the whole kebab is turned -45deg so it runs bottom-left -> top-right.
// One shuttle, cork pointing to +x, origin at the cork/feather join:
//   feathers: x = -78 .. 0   (scalloped rim at the open end)
//   cork:     x =   0 .. 36
// ---------------------------------------------------------------------------
const SKIRT =
  "M0 -28L-74 -80Q-82 -60 -74 -40Q-82 -20 -74 0Q-82 20 -74 40Q-82 60 -74 80L0 28Z";
const GROOVES = "M-8 -12L-70 -44M-8 0H-70M-8 12L-70 44M-60 -62V62";
const CORK = "M0 -30H6A30 30 0 0 1 6 30H0Z";
const CHAR = "M9 -20L16 20M22 -18L28 12";

// Junction x for each shuttle. flip = cork points down toward the handle.
const SAME = [
  { x: 105, flip: true },
  { x: -21, flip: true },
  { x: -147, flip: true },
];
// Middle one turned round: feathers meet feathers, corks meet corks.
const ALT = [
  { x: 105, flip: true },
  { x: 33, flip: false },
  { x: -147, flip: true },
];

// Skewer shapes. "reach" = furthest point from the centre (unscaled).
// The long skewer pokes ~18 units further out at each end, so the tile art is
// scaled to keep everything inside the 80% maskable safe circle (r = 204.8).
const SKEWER = {
  short: { line: "M-186 0H184", knob: -191, tip: "M182 -8L203 0L182 8Z", tileScale: 1 },
  long: { line: "M-204 0H202", knob: -209, tip: "M200 -8L221 0L200 8Z", tileScale: 0.915 },
};

const VARIANTS = [
  { n: 1, name: "Flat, same direction", shuttles: SAME, char: false, smoke: false, skewer: SKEWER.long },
  { n: 2, name: "Flat, alternating", shuttles: ALT, char: false, smoke: false, skewer: SKEWER.short },
  { n: 3, name: "Grill marks on the corks", shuttles: SAME, char: true, smoke: false, skewer: SKEWER.short },
  { n: 4, name: "Small smoke wisps", shuttles: SAME, char: false, smoke: true, skewer: SKEWER.short },
];

const THEMES = {
  tile: {
    bg: `<rect width="512" height="512" rx="112" fill="${C.court}"/>`,
    scale: 1,
    feather: C.line,
    groove: C.court,
    cork: C.volt,
    corkStroke: null,
    skewer: C.volt,
    char: C.ink,
    smoke: C.line,
    smokeOpacity: 0.7,
  },
  "hero-a": {
    bg:
      `<circle cx="256" cy="256" r="256" fill="${C.deep}"/>\n` +
      `  <circle cx="256" cy="256" r="238" fill="none" stroke="${C.volt}" stroke-width="8"/>`,
    scale: 0.86,
    feather: C.line,
    groove: C.deep,
    cork: C.volt,
    corkStroke: null,
    skewer: C.volt,
    char: C.ink,
    smoke: C.line,
    smokeOpacity: 0.7,
  },
  "hero-b": {
    bg: `<circle cx="256" cy="256" r="256" fill="${C.line}"/>`,
    scale: 0.86,
    feather: C.court,
    groove: C.line,
    cork: C.volt,
    corkStroke: C.court,
    skewer: C.court,
    char: C.ink,
    smoke: C.court,
    smokeOpacity: 0.55,
  },
};

const r = (v) => Math.round(v * 100) / 100;

function shuttle({ x, flip }, t, v) {
  const tf = flip ? `translate(${x} 0) scale(-1 1)` : `translate(${x} 0)`;
  const cork = t.corkStroke
    ? `<path d="${CORK}" fill="${t.cork}" stroke="${t.corkStroke}" stroke-width="6" stroke-linejoin="round"/>`
    : `<path d="${CORK}" fill="${t.cork}"/>`;
  const char = v.char
    ? `\n      <path d="${CHAR}" stroke="${t.char}" stroke-width="7" stroke-linecap="round"/>`
    : "";
  return `    <g transform="${tf}">
      <path d="${SKIRT}" fill="${t.feather}"/>
      <path d="${GROOVES}" stroke="${t.groove}" stroke-width="7" stroke-linecap="round"/>
      ${cork}${char}
    </g>`;
}

function svg(v, themeKey) {
  const t = THEMES[themeKey];
  const s = t.scale;
  const off = r(256 * (1 - s));
  // The tile is the tightest fit, so only it is shrunk for a longer skewer.
  const ks = themeKey === "tile" ? v.skewer.tileScale : s;
  const kebabTf = ks === 1 ? "translate(256 256) rotate(-45)" : `translate(256 256) scale(${ks}) rotate(-45)`;
  const smokeTf = s === 1 ? "" : ` transform="translate(${off} ${off}) scale(${s})"`;

  const smoke = v.smoke
    ? `
  <!-- smoke -->
  <g${smokeTf} fill="none" stroke="${t.smoke}" stroke-opacity="${t.smokeOpacity}" stroke-width="13" stroke-linecap="round">
    <path d="M186 170C164 150 202 132 182 112S168 90 184 80"/>
    <path d="M132 218C112 198 148 180 128 158S116 134 130 122"/>
  </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- BBQueue icon, variant ${v.n} (${v.name}), ${themeKey} -->
  ${t.bg}
  <g transform="${kebabTf}">
    <!-- skewer: round handle end, pointed tip -->
    <path d="${v.skewer.line}" stroke="${t.skewer}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="${v.skewer.knob}" cy="0" r="11" fill="${t.skewer}"/>
    <path d="${v.skewer.tip}" fill="${t.skewer}"/>
${v.shuttles.map((sh) => shuttle(sh, t, v)).join("\n")}
  </g>${smoke}
</svg>
`;
}

for (const v of VARIANTS) {
  for (const key of Object.keys(THEMES)) {
    writeFileSync(join(here, `variant-${v.n}-${key}.svg`), svg(v, key));
  }
}
console.log("ok");
