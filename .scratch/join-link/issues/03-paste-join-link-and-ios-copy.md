# 03 Have a Join link? on Clubs, and the iOS copy line on the Join page

Status: ready-for-agent
Spec: ../spec.md
Blocked by: 02

## What

- `src/features/clubs/ClubsScreen.tsx`: **Have a Join link?** next to Add club, for anyone with an Account. Opens a bottom sheet (`Modal`, title takes focus as in `NewClubSheet`) with "Paste the Join link" and **Open**. Accepts a full Join link (any origin, path `/join/<token>`) or a bare token. Goes to `/join/:token`. Anything else shows "That isn't a Join link." A pure parser with unit tests.
- Join page: in an iOS browser that isn't the installed app (reuse `shouldOfferInstallHint` from `src/features/account/installHint.ts`, `"ios"`), a muted line under the card, "Using BBQueue from your Home Screen? Copy this link and paste it there.", with **Copy link** (clipboard, then "Link copied").

## E2E workflows

Spec workflows 9 (both single-device projects) and 10 (`webkit-mobile` shows the line, `chromium-mobile` doesn't) in `e2e/join-link.spec.ts`.
