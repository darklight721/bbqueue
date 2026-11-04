# Spec: Join link

Status: done
Depends on: club-page, accounts

Screens (new): `/join/:token` (Join page).
Screens (changed): `/clubs/:clubId` (Club page: Join link card for Organizers), `/clubs` (Clubs page: Have a Join link?).

Vocabulary: **Join link**, **Claim**, **Club player**, **Shared club**, **Organizer**, **Player** (the Role), **Account**, **Account ID** (GLOSSARY.md). Don't call the Join link an invite. Claiming isn't "joining" or "connecting" (the app's own copy may say "join": see Claim in the glossary).

Decided in a grilling session (2026-11-03). Storage and Security Rules: ADR-0010.

## Why

Today only an Organizer links an Account to a Club player: the person sends their `@Account ID`, and the Organizer types it on Players Edit mode. For a whole club that's a lot of back and forth. With a Join link the Organizer posts one link in the group chat, and each person links themselves to their own Club player by name.

## Join link card (Club page)

- Shown only to Organizers of a Shared club, under the Players section. Hidden in Players Edit mode. A Player (the Role) and Local clubs never see it.
- Heading "Join link". Text: "Anyone with this link can link their Account to an unlinked player and see the club."
- **Share link**: opens the share sheet (`navigator.share`) with the link. With no share sheet (desktop), copies the link and shows "Link copied". The first Share on a Club creates its Join link, which needs a connection. After that, Share works offline because the link is already known.
- **Reset link**: confirm "Reset the Join link? The old link stops working. People already linked stay linked." Reset makes a new link and the old one stops working at once. Needs a connection (disabled offline, as other roster changes are).
- A Club with no Join link yet shows only Share link (no Reset).

## Join page `/join/:token`

- Opens straight away, without Welcome or the install hint, even on a device that has never opened the app. It shows no Back to anything inside the app, only a way Home.
- Court-green card (as on the Club page): the caption "Welcome to", then the Club name, large and uppercase. No pill (spec: join-page-welcome).
- No roster is shown. Nobody holding the link can see the Club's players.
- No install hint on this page. The Account page still has one.

### With an Account on this device

1. If the Account's Name matches a Club player (see Matching): go to **Confirm**.
2. Otherwise: **Your name in <Club>** step.

### Without an Account

1. **Your name** field and **Continue** (same checks as the Welcome name form).
2. A match: **Confirm**. On Yes, the Account is created with that name and then claims the Club player.
3. No match: the **Your name in <Club>** step. The Account will be created with the name from step 1, not the name that matched.
- No Account is created unless a claim is about to happen.

### Your name in <Club>

- Field "Your name in Thursday Smashers" and **Find me**. Only finds a Club player, never renames the Account.
- A match: **Confirm**.
- No match: "No one called Sammy in Thursday Smashers. Ask an Organizer to add you, then open this link again." and **Try another name** (clears the field).

### Confirm (bottom sheet)

- "You're Alex in Thursday Smashers?" then "You'll be linked as a Player and see the club and its sessions."
- **Yes, that's me**: claims. **I go by another name**: closes the sheet and goes to the Your name in <Club> step. Closing the sheet (✕, Escape, backdrop) does the same as I go by another name.
- Always asked, even when the Account's Name matched exactly: the club's "Alex" may be a different Alex.

### Matched, but already linked

- "Alex is already linked to an Account. If that's not you, ask an Organizer to unlink it." and **Try another name**.

### After a claim

- The Club page opens and replaces `/join/…` in history (Back doesn't return to the Join page). The Club is in the Clubs list and the claimer's row shows "You". The claim gave them the Player Role, which an Organizer can change later.

### Matching

- A name matches a Club player when they're equal under `joinNameKey` (`src/domain/joinLink.ts`): `namesEqual` (`src/domain/validation.ts`), ignoring case and extra spaces, with letters compared in one Unicode form (NFC) and a lower case that doesn't depend on the device's language. Nothing fuzzy: "Jo" doesn't match "Joanne", and "Zoë" doesn't match "Zoe". Club player names are unique within a Club, so at most one Club player matches.

### Dead ends

- Link reset, unknown, or its Club deleted: "This Join link doesn't work any more. Ask an Organizer for a new one." and **Go to Home**.
- The Account on this device is already on the Club (linked to any row): go straight to the Club page (replace).
- Offline: "Connect to the internet to join this club." Retries when back online. When the device thinks it is online but the server can't be reached, it retries by itself with growing pauses and offers **Try again**.
- Someone else claimed the same Club player first: the sheet closes with "Alex was just linked to another Account." and **Try another name**.
- Claiming needs the app's Backend. A build with no Backend shows the "doesn't work" message.

### Installed app on iPhone and iPad

On iOS a link tapped in another app always opens in the browser, which has its own storage, separate from the installed app.

- On the Join page in an iOS browser (not the installed app), one muted line under the card: "Using BBQueue from your Home Screen? Copy this link and paste it there." with **Copy link**. Uses the same iOS detection as the install hint (`installHint.ts`). Not on Android, desktop or the installed app.
- Clubs page: **Have a Join link?** (next to Add club, for anyone with an Account, every platform). Opens a bottom sheet with one field, "Paste the Join link", and **Open**. It accepts a full Join link or just its token and goes to `/join/:token`. Anything else shows "That isn't a Join link."

## Security and storage (summary; ADR-0010)

- A Join link is `/join/<token>`, with a long random token. The Club keeps its current token. A Join record named by the token holds the Club's id and name and a hashed index of its Club players' names: a link holder can check a name but can't list the roster.
- Every write that adds, renames, removes, links or unlinks a Club player, or renames the Club, keeps the Join record current in the same batch.
- The Security Rules let an Account that's not on the Club link itself only to an unlinked Club player, only as Player, and only with the Club's current token.
- Known consequence: after an Organizer Unlinks a wrong claim, the same person can claim that row again until the link is reset. The fix is Reset link.

## Out of scope (later)

- Adding yourself as a new Club player through the link, approved by an Organizer (next feature).
- Personal links for one Club player, links that expire, fuzzy matching or a pick list.
- An install hint on the Join page.
- Telling Organizers when someone claims.

## E2E workflows

Single device (`chromium-mobile`, `webkit-mobile`), new `e2e/join-link.spec.ts`, against the local fake Backend:
1. An Organizer's Club page shows the Join link card. Share link copies the link where there's no share sheet ("Link copied"). Reset link asks first, and the old link then shows "doesn't work". A Player doesn't see the card. It's hidden in Players Edit mode.
2. No Account: open a Join link on a fresh device, which skips Welcome. Type a matching name, confirm, and the Club page opens with "You". Back doesn't return to the Join page. The Account has that name.
3. No Account, no match: type your own name, then a different matching "name in <Club>", confirm. The Account has the first name and the claimed row has the second.
4. With an Account whose Name matches: Confirm shows straight away. "I go by another name" leads to the Your name in <Club> step.
5. No match on the second name: the "Ask an Organizer" message, Try another name works, and no Account was created (reload: Welcome still shows on `/`).
6. Matched but already linked: the "already linked" message.
7. Already on the Club: the Join link opens the Club page.
8. Unknown token: the "doesn't work" message and Go to Home.
9. Clubs page: Have a Join link? accepts a pasted link and opens the Join page, and refuses something else.
10. iOS browser (`webkit-mobile`): the "Using BBQueue from your Home Screen?" line and Copy link. Not shown on `chromium-mobile`.

Two people (`chromium-mobile-emulator`, `webkit-mobile-emulator`), new `e2e/emulator/join-link.spec.ts`:
11. An Organizer shares a Join link. A second person with no Account opens it, claims, and sees the Club and its Active session. The Organizer sees them linked as a Player on Players Edit mode.
12. Two people claim the same name: the second gets "just linked to another Account".
13. After Reset link the old link no longer works for a third person.

Rules: `pnpm test:firebase` covers the rules in ADR-0010 (see issue 01).
