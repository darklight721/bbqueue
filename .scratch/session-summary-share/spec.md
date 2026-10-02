# Spec: Share the Session summary as an image

Status: done
Depends on: session-summary

Screen: `/sessions/:id/summary` (`src/features/session-summary/`)

## Branding

- The hero gets a row at the top, above the "Session summary" pill: a small `BrandMark` disc and the "BBQueue" wordmark (volt "BBQ" + line-coloured "ueue", the same as the home hero).
- It shows on the page and in the image.

## Bottom actions

- **Share summary**: the primary (filled) button.
- **Home**: secondary, below Share. It still links to `/`.
- Available for every Ended session: straight after End session and from the ended-sessions list.

## Image

- Covers the whole summary (hero, Totals, Top winners), not just the part on screen. The bottom action buttons are not included.
- Always laid out at phone width (about 400 CSS px) and rendered at 3× resolution, so it looks the same from any device.
- Uses the theme currently showing (light/dark), so it matches what the user saw.
- Entrance animations are skipped during capture, so nothing is caught half-faded.
- Made on the device with no network, so it works offline.
- File name: `bbqueue-<session-name-slug>-<YYYY-MM-DD>.png` (the date the Session started).
- A small footer at the bottom of the image only (not shown on the page) with the app link `darklight721.github.io/bbqueue`, so people who see the image can find the app.

## Share behaviour

- If `navigator.canShare({ files })` is true: open the native share sheet with the PNG. If the user cancels the sheet (AbortError), stay silent.
- Otherwise: download the PNG.
- While the image is being made, the button shows that it's busy and is disabled.
- If it fails: show a short, non-blocking error ("Couldn't create the image").

## Acceptance

- Unit: the Share button and Home link are present. When sharing is supported, Share calls `navigator.share` with one PNG file. When it isn't, it falls back to a download. Cancelling the share sheet shows no error.
- e2e: clicking Share produces a PNG download (Chromium headless has no file share). The captured element does not contain the action buttons.
- The logo row and the "BBQueue" wordmark appear in the hero.
