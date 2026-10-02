# BBQ icon: three shuttlecocks on a skewer

Status: done

## Decisions

- **Concept**: three shuttlecocks skewered on one diagonal stick, like a barbecue kebab. Corks point down toward the handle. No flames.
- **Chosen**: Variant 1 (flat, all shuttles facing the same way), with the skewer lengthened on both ends.
- **App icon** (`public/favicon.svg`): rounded-square tile (rx 112 on 512), full-bleed court green `#0b6b45`, white feathers, volt corks and skewer. Art stays inside the 80% maskable safe zone. Single source for every PWA asset; `pwa-assets.config.ts` background is court green.
- **16px favicon**: accepted that it reads as a diagonal green/white/volt stripe; no separate small-size icon.
- **Home hero**: the mark is wrapped in a circle only here: hero b, an off-white (`line`) disc with court-green shuttles and volt corks. Inline `BrandMark` component using theme tokens; sits above the `BBQueue` heading, left-aligned, decorative (`aria-hidden`), first in the rise stagger (0ms).

## Files

- `variant-{1..4}-{tile,hero-a,hero-b}.svg` and `preview.html`: the candidates shown for choosing.
- `build.mjs`: regenerates the variant SVGs.
