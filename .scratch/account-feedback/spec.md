# Account feature feedback

Status: ready-for-agent

Follow-ups to the Account feature after a hands-on review. Decided in a grilling session; see ADR-0008 for the Security Rules change.

## Changes

### 1. Welcome: name field help text
Replace "Creates your Account, so your Club can add you by your Account ID and you'll see Sessions live." with:
"We'll use it to create your Account. Your Club can then add you by your Account ID, and you'll see Sessions live."

### 2. Home: tell the avatar and the BrandMark apart
Both are off-white discs on court green. The avatar (with initials) becomes a see-through dark-green disc with an off-white ring and off-white initials; the BrandMark stays the only solid disc. The no-Account avatar (dashed, person icon) must still read as different from the signed-in one.

### 3. Clubs: "This device only" as a badge
A small neutral outlined badge in the line with the player count ("8 players · [This device only]").

### 4. New club: the signed-in Account is on the roster from the start
When signed in (a Shared club will be created), the form starts with one Club player row for the Account: its Name, Intermediate, linked to the Account as Organizer. Name and Skill are editable; no Remove (the only Organizer). Under it the linked line: "🔗 <accountId> · You" and the Role (Organizer, can't be changed while the only Organizer). The backend creates the club with that row as given (no longer always the Account's Name + Intermediate). Signed out (Local club): unchanged, no row.

### 5. New club: link Accounts on creation (ADR-0008)
New club supports the same `@` linking as Edit club (below). The Club and every link are written in one batch. The Security Rules let a new Club's first batch link other Accounts, with each link checked as any later link is (Account ID reserved by that uid; lists after the batch agree with the links). The creator must be an Organizer.

### 6. Edit club: session links in one row
"Open active session" / "New session" and "Sessions" in one row of two equal columns; detail text may wrap. A single card fills the full width.

### 7. Edit club / New club: link an Account from the name field
For Organizers of a Shared club (or a signed-in New club), online:
- The name field's placeholder is "Name or @Account ID". The "Link Account" button and the separate Account ID field go away.
- Text that **starts with** `@` is treated as an Account ID. While typing: "Checking…", and problems under the field ("That doesn't look like an Account ID, such as roy-7k3f." once complete/after Save, "No Account has that Account ID.", "That Account is already on this roster.", "Linking an Account needs a connection.").
- On an exact match the field's text is replaced right away by the Account's Name, and the linked line appears under the field: "🔗 Linked to <accountId>".
- The name stays editable after linking; the link stays. When the row's name differs from the Account's Name, the linked line shows the Account's Name too.
- A link that isn't saved yet has an ✕ on the linked line: removes the link and clears the field. Saved links: as today (remove the row; Unlink when the Account no longer exists).
- Local club, Player Role, or no Backend: `@` is an ordinary character; no linked line.
- Saved links show the linked line as today (Account ID, Account Name when different, "You" badge, "This Account no longer exists.", "The only Organizer.", Role messages).

### 8. Role dropdown styled like Skill
The Role dropdown lives on the linked line, right-aligned, same style and width as the Skill dropdown (plain bordered select, no Organizer tint), sitting directly under Skill so Roles line up in a column. A new link starts as Player.

### 9. Totals: add Courts, 2×2
Ended session and Session summary totals gain **Courts**: the number of distinct Courts with at least one Ended match (derived from stored Ended matches; works for existing Ended sessions). Layout is a 2×2 grid at every width, also in the shared image: Matches · Players / Courts · Duration.

## E2E workflows

- `club-edit` (local fake Backend, both mobile projects): Edit club session links row — New session and Sessions open the right screens from the single row.
- `e2e/emulator/` (two people): Organizer types `@<their Account ID>` in a name field on Edit club → name replaced by the Account's Name, "Linked to" line shown, Role set, Save → the other person sees the Club.
- `e2e/emulator/`: New club with the creator's own row pre-filled plus an `@`-linked second Account, Save once → both see the Club; Roles as chosen.
- `e2e/emulator/`: undo an unsaved link with ✕ → field cleared, Save keeps the row unlinked (or blocked as empty name).
- Welcome, Home avatar, Clubs badge, Totals: None — copy and visual changes, plus pure domain logic (Courts total) covered by unit tests.
