# Spec: Accounts and Shared clubs

Status: ready-for-agent

ADRs: 0006 (Anonymous Accounts and Shared clubs on Firebase), 0007 (One Session host per Active session). ADR-0001 still holds for everything that is not a Shared club. Vocabulary: `GLOSSARY.md` (Account, Account ID, Role, Organizer, Player, Local club, Shared club, Session host).

## Problem Statement

Today BBQueue only runs on one device. The Organizer running a club night is the only person who can see the Courts, Lineups, Standings and past Sessions. Players keep asking "when am I on?" and "who won last week?", and a second Organizer can't help run the night or take over when the first Organizer's phone dies. A Club's roster also lives on one phone, so nobody else can keep it up to date.

## Solution

People can create an **Account** by entering only a name. Each Account gets a readable, never-changing **Account ID**. Clubs created while signed in are **Shared clubs**, kept on a server. An Organizer can add another Account to a Shared club by entering its Account ID on a Club player row and giving it a **Role**: **Organizer** or **Player**.

Everyone in a Shared club sees its Active session live and its Ended sessions:
- One Organizer, the **Session host**, runs the Active session exactly as today, including fully offline. Another Organizer can take over.
- Players can view the Session, and if they're in it, switch their own Sitting out on and off or leave.

Using the app without an Account still does everything it does today, all on the device. A **Local club** stays on the device until an Organizer chooses "Make shared club". A Club screen also gets a "New session" shortcut that fills in its Club and locks it.

## User Stories

### Welcome and Account

1. As a first-time visitor, I want a welcome screen that explains the app and asks for my name, so that I can create an Account in one step.
2. As a first-time visitor, I want to skip entering my name, so that I can use the app straight away without an Account.
3. As a visitor who skipped, I want the welcome screen never to appear again, so that I'm not nagged on every launch.
4. As a first-time visitor who is offline, I want to be told an Account needs a connection and still continue into the app, so that I'm never stuck.
5. As a person who skipped, I want to add my name later from the avatar, so that I can create an Account whenever I'm ready.
6. As an Account holder, I want my Account ID to be short and readable, based on my name (e.g. `roy-7k3f`), so that I can tell it to an Organizer courtside.
7. As an Account holder, I want my Account ID never to change, even if I rename myself, so that Clubs I'm linked to keep working.
8. As anyone on Home, I want an avatar in the top-right corner showing my initials (or a default icon without an Account), so that I can reach my Account settings.
9. As an Account holder, I want to see my name in Account settings and edit it in place, so that I can fix typos.
10. As an Account holder, I want to see my Account ID with a copy button, so that I can send it to an Organizer.
11. As an Account holder on iOS Safari or Android, I want a gentle hint to install the app (Add to Home Screen), so that I get the most out of it and the browser doesn't wipe my Account.
12. As an Account holder, I want to delete my Account, so that my data leaves the server.
13. As an Account holder deleting my Account, I want one confirm dialog listing exactly which Shared clubs and Ended sessions will be deleted, so that nothing surprises me.
14. As the only Organizer of a Shared club that has other Accounts, I want deletion to be blocked with those Clubs named, so that I don't leave a Club with no Organizer.
15. As an Account holder who deletes my Account, I want my Local clubs and Sessions with no Club to stay on the device, so that I don't lose personal history.
16. As a Club player linked to an Account that was deleted, I want to stay on the roster as a plain Club player, so that the Club's history still makes sense.

### Shared clubs and Roles

17. As an Account holder, I want every Club I create to be a Shared club, so that I can add others without an extra step.
18. As the creator of a Shared club, I want to be added to its roster automatically, linked to my Account, as an Organizer, starting at Intermediate, so that I'm set up straight away.
19. As an Organizer adding a Club player, I want an optional Account ID field and a Role picker (Organizer or Player), so that I can give that person access.
20. As an Organizer typing an Account ID, I want to see the Account's name once it's found ("✓ Roy"), so that I know I linked the right person.
21. As an Organizer, I want unknown Account IDs, and Accounts already linked in this Club, to be rejected, so that the roster stays correct.
22. As an Organizer typing an Account ID, I want capitalisation not to matter, so that typing it is forgiving.
23. As an Organizer who is offline, I want the Account ID field and Role changes turned off, with the reason shown, so that I understand why.
24. As an Organizer, I want to change any linked Club player's Role, or remove their row, so that I can manage access.
25. As the last Organizer, I want to be stopped from demoting or removing myself, so that the Club always has an Organizer.
26. As an Account that was added to a Club, I want it to appear in my Clubs list and on Home without accepting anything, so that joining takes no effort.
27. As a Player, I want a read-only view of the Club with a "You" label on my row, so that I can see who's on the roster.
28. As a Player, I don't need to see other people's Account IDs; only Organizers see them.
29. As a Player or Organizer, I want to leave a Club. My row stays on the roster but is no longer linked to me, and I can't leave if I'm the last Organizer.
30. As an Organizer editing a Club while offline, I want name and Skill level changes saved and synced later, so that I can manage the roster courtside. The most recent change to each row wins.
31. As anyone, I want Local clubs labelled "This device only", so that I know who else can see them.

### Make shared club

32. As a signed-in Organizer viewing a Local club, I want "Make shared club", so that I can bring other people in.
33. As that Organizer, I want to pick my own row or "Add me" before sharing, so that I'm the Club's Organizer.
34. As that Organizer, I want a confirm dialog saying that others will see the Club and its Sessions and that this can't be undone, so that I decide knowingly.
35. As that Organizer, I want the Club's Ended sessions, and any Active session of that Club, moved to the server with me as Session host, so that nothing is left behind.
36. As a signed-out person or someone offline, I want "Make shared club" to explain what it needs (an Account, a connection) rather than fail.

### Starting a Session from a Club

37. As an Organizer on a Club screen, I want a "New session" link that opens New session with this Club already chosen and locked, so that I start faster.
38. As an Organizer whose Club already has an Active session, I want that link to say "Open active session" instead, so that I don't start a second one.
39. As a Player, I don't need a New session link on a Club screen.

### Active session of a Shared club

40. As an Organizer, I want to start a Session for a Shared club and become its Session host, so that I can run it as I do today.
41. As the Session host, I want everything to keep working offline, and my latest copy uploaded when I'm back online, so that bad courtside signal never stops play.
42. As anyone in the Club, I want Home to list every Active session I can see (one per Shared club, plus this device's own Session for a Local club or no Club), so that I can open any of them.
43. As a Player or a non-host Organizer, I want to see the Active session live (Courts, Lineups, Queues, Matches, Standings) without being able to change it, so that I know what's happening.
44. As a viewer whose device is offline, I want to see the last copy I received, with how old it is, so that I know it might be out of date.
45. As a Player who is a Session player, I want to switch my own Sitting out on and off, so that I can take a break.
46. As a Player who is a Session player, I want to leave the Session myself, so that I'm not picked after going home.
47. As a Player whose request hasn't been applied yet, I want to see "Waiting for host", so that I know it's queued.
48. As the Session host, I want requests applied in the order they were made, and ones that no longer make sense skipped, so that the Session stays correct.
49. As a Player who left, I need an Organizer to add me back; I can't rejoin myself.
50. As an Account that isn't a Session player in this Session, I want to view it only.
51. As a non-host Organizer, I want "Take over", with a warning that the host's changes that were never uploaded will be lost, so that I can keep the night running if the host's phone dies.
52. As a former Session host, I want my device to turn read-only once someone has taken over, so that two people never run the Session.
53. As the Session host, I want to end the Session as today, so that it becomes an Ended session for everyone in the Club.

### Ended sessions of Shared clubs

54. As anyone in a Shared club, I want to see its Ended sessions in Past sessions and in the Club's sessions list, so that I can look back at results.
55. As anyone in a Shared club, I want Session summaries of Ended sessions, so that I can view and share them as today.
56. As a Club, I want every Ended session kept on the server, with nobody able to delete them and the 50 most recent shown, so that history is stable.
57. As someone using the app without an Account, I want everything to behave exactly as it does today.

## Implementation Decisions

- **Backend:** Firebase, using Firestore plus Anonymous Auth (ADR-0006). There's no server code: everything happens from the app plus Security Rules. The app stays a static SPA on GitHub Pages and keeps working offline.
- **The Backend interface:** one boundary the app talks to, named something like `Backend`. It covers:
  - Accounts: create with a name, rename, delete, look up by Account ID
  - Shared clubs: create, rename, list mine, subscribe to one
  - roster rows: add, edit, remove, link or unlink an Account, set its Role, leave
  - the Active session: publish the host's copy, subscribe, take over
  - Player requests: create, subscribe, mark applied or skipped
  - Ended sessions: publish, list
  - Make shared club

  There are two versions: one using Firebase, and an in-memory one used by component tests and as the agreed contract. UI code never imports Firebase directly.
- **Store:** the existing store (a cache plus subscribers on top of localStorage) stays the one source the UI reads. Shared club data reaches the UI through it: Firebase updates are copied into the store, and edits to Shared clubs go out through `Backend`. Local clubs, Sessions with no Club and the signed-out experience keep today's localStorage path unchanged.
- **Account ID:**
  - Made from a slug of the first word of the name (lowercase ASCII, accents stripped, falling back to `player`), a dash, and 4 characters from an alphabet that leaves out look-alikes (0/o/1/l/i).
  - Compared ignoring case.
  - Reserved in a Firestore transaction on an Account-ID record, so it's unique; the app tries again with new characters if one is taken.
  - Never changes.
- **Records:** at minimum Accounts, Account-ID reservations, Shared clubs, roster rows (each Club player saved separately, so the most recent change to a row wins), the Active session of each Shared club (one record holding the host's copy of the Session plus who the host is), Player requests, and Ended sessions (the existing slimmed shape from ADR-0005; all kept, the 50 most recent per Shared club shown).
- **Domain changes:**
  - A Club gains whether it's Local or Shared.
  - A Club player gains an optional linked Account and, when linked, a Role.
  - A Session player gains the linked Account copied in at Start (snapshots stay snapshots, ADR-0002).
  - An Account's Role in a Club lives only on its linked Club player row; there's no separate list of who has access.
- **Permissions:** pure domain functions decide what an Account may do (edit the Club, change Roles, start a Session, act as Session host, request Sitting out or leaving for itself), plus the "at least one Organizer" rule. The Security Rules enforce the same rules on the server.
- **Session host (ADR-0007):**
  - Only the Session host's device runs engine operations on a Shared club's Active session. After each saved change it uploads its whole Session.
  - Other devices show it read-only.
  - Taking over: a transaction makes the new Organizer the host. The old host's device notices it's no longer host and turns read-only, dropping any changes it never uploaded.
- **Player requests:**
  - Each is a separate record: set Sitting out, clear Sitting out, or leave, for the requester's own Session player, with when it was made.
  - The Session host applies them in order through the existing engine operations, marks each applied or skipped, and skips requests that no longer make sense.
  - Leaving uses the existing "removed" state of a Session player.
- **Active sessions:**
  - At most one per Shared club.
  - At most one on the device for a Local club or no Club (today's single-Session slot).
  - Home lists every Active session the person can see.
- **New session from a Club:** New session accepts a Club in the URL, which locks the Club picker. The Club screen shows "New session" to Organizers, or "Open active session" if the Club already has one.
- **Welcome screen:** a new screen shown on first launch until the person either creates an Account or skips. Skipping is remembered on the device.
- **Avatar and Account settings:** an avatar on Home showing initials (from the first letters of the first two words of the name) or a default icon. A new Account settings screen with in-place name editing, the Account ID with copy, "Add your name" when there's no Account, and Delete Account.
- **Deleting an Account:**
  - A pure domain function works out the plan: which Clubs block deletion, which Shared clubs and Ended sessions will be deleted, and which roster rows will be unlinked.
  - The app carries it out: delete the Shared clubs where this is the only Account, unlink this Account in other Clubs, delete the Account and its Account-ID record, delete the Firebase auth user, and clear Shared club data from the device.
- **Make shared club:**
  - A pure domain function turns a Local club into a Shared club: pick an existing row or add "me", and link it as Organizer.
  - The app uploads the Club, its roster, its Ended sessions and its Active session (if any, with this device as host), keeping the Club's id, then marks it Shared on the device. It can't be undone.
- **Losing an Account on iOS:** ask the browser to keep the app's data (`navigator.storage.persist()`). Show an "Install the app" hint (Add to Home Screen) in iOS Safari and in Android browsers when the app isn't installed. Organizers can unlink a linked Account that no longer exists.
- **Offline behaviour:** Firestore's offline cache and write queue are on. Adding Club player rows, linking Accounts, changing Roles, taking over, Make shared club, creating and deleting an Account all need a connection; their controls are turned off with a reason when offline.

## Testing Decisions

- Good tests check behaviour you can see from outside (domain function results, what's on screen, what reaches the other device), not how it's built.
- **Domain unit tests (Vitest)**, following the existing `src/domain/**` and engine tests:
  - Account ID slug and normalising
  - permission checks, and the "at least one Organizer" rule
  - applying and skipping Player requests through the engine
  - Make shared club converting the roster
  - planning an Account deletion
  - initials for the avatar
- **Component tests (Vitest + Testing Library)** use the in-memory `Backend`, following the existing screen tests.
- **Backend contract tests:** one test suite run against both the in-memory and the Firebase (emulator) version, so they can't drift apart.
- **Security Rules tests** with `@firebase/rules-unit-testing` against the Firestore emulator:
  - Players can't edit the Club or its roster.
  - Only Organizers can link Accounts or change Roles.
  - The last Organizer can't be removed or demoted.
  - Only the Session host writes the Active session.
  - A Player can only create requests for their own Session player.
  - Taking over requires being an Organizer.
  - Account-ID records can't be overwritten.
- **Playwright e2e** against the Firebase emulator, on both projects:
  - Fixtures gain helpers to seed Accounts and Shared clubs into the emulator.
  - Two-person workflows use two browser contexts.
  - One spec file per screen area, named with glossary terms.

## E2E workflows

- **Welcome:** first launch shows the welcome screen. Entering a name creates an Account and lands on Home with initials in the avatar. Skipping lands on Home with the default avatar. After a reload, the welcome screen doesn't come back either way. Offline: continuing without an Account works.
- **Account settings:** avatar → Account settings shows the name and Account ID. Editing the name in place survives a reload. Copy ID. "Add your name" after skipping creates an Account. Delete Account (with a confirm dialog) returns the device to signed-out while Local clubs remain. Delete is blocked while you're the only Organizer of a Club with other Accounts.
- **Shared clubs:**
  - A signed-in person creates a Club and finds themselves on the roster as Organizer.
  - Adding a Club player with a valid Account ID shows "✓ Name", while an unknown ID is rejected.
  - In a second browser context, the linked Account sees the Club and a read-only Club screen with "You".
  - A Player leaves the Club.
  - The last Organizer can't demote themselves.
- **Local clubs:** a signed-out person creates a Club that's labelled "This device only". After signing up it stays Local. Make shared club (pick my row, confirm) makes it Shared, and a second Account can then be linked.
- **New session from a Club:** "New session" on a Club screen opens New session with that Club locked, and starting it works. Once the Club has an Active session, the link reads "Open active session".
- **Shared active session:**
  - The Organizer (host) starts a Session for a Shared club.
  - A Player in a second context sees it on Home and sees a Match start live.
  - The Player switches their own Sitting out on; the host's Lineups stop picking them.
  - The Player leaves the Session.
  - With the host offline, the request shows "Waiting for host" and is applied once the host reconnects.
  - A second Organizer takes over: the old host turns read-only, and the new host can start a Match.
  - The host keeps playing offline and the viewer catches up after the host reconnects.
- **Ended sessions:** the host ends a Session; the Player sees it in Past sessions and the Club's sessions list, and can open its Session summary.
- **Signed-out:** the existing e2e suite still passes with no Account (no regressions).

## Out of Scope

- Email or OAuth sign-in, and linking an email to recover an Account or use it on another device (the first follow-up).
- Any Organizer being able to change the Active session (op-log replay with a seeded random source).
- Turning a Shared club back into a Local club.
- Telling people they were added to a Club; invite links or QR codes.
- Deleting Ended sessions; showing more than 50 per Shared club.
- Syncing Sessions with no Club or Local clubs between devices.
- Server code (Cloud Functions).
- Avatar photos.

## Further Notes

- Firebase's free plan covers the expected usage (a few clubs, weekly nights) without being paused. Re-check limits on the official pricing page when setting up the project.
- The Firebase web config is public by design: Security Rules are the real protection.
- iOS keeps separate storage for the installed Home Screen app and for Safari, so an Account created in Safari doesn't appear in the installed app. The "Install the app" hint should be shown before people get attached to a Safari-only Account.
