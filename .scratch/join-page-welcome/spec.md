# Spec: Join page — a welcome, and what linking gets you

Status: done
Depends on: join-link

Screens (changed): `/join/:token` (Join page).

Vocabulary per `GLOSSARY.md`: **Join link**, **Claim**, **Club player**, **Player** (the Role), **Account**, **Ended session**. The app's copy may say "join"; Claim stays the term everywhere else. No new terms.

Decided in a grilling session (2026-11-04).

## Problem

The Join page is bare. Someone arriving from a group chat, maybe with no idea what BBQueue is, gets a pill, the Club name and a name field. Nothing welcomes them or says what happens next or what they'll get.

## The card

- The "Join club" pill goes. On a court-green card, the pill is used only on the Session pages (Session summary, Ended session, court cards).
- In its place, the caption "Welcome to" (`CourtCardCaption`) above the Club name. The Club name is unchanged.
- Shown wherever the card is shown today.

## The explanation

Under the card, above the name field:

> **What happens next**
> Find your name on the club's list and it becomes yours. No sign-up needed.
>
> **Then you can**
> - Follow sessions live: courts, lineups and who's up next
> - Look back at past sessions
> - See your own stats, including matches you've already played

- Shown only with the two name steps: Your name and Your name in <Club>, including while Confirm is open over them.
- Not shown on no-match, already-linked, just-claimed, loading, failed, offline or a dead end. Those show only their own message.
- An Account whose Name matches goes straight to Confirm, with no form behind it, so there's no explanation either. The Confirm sheet's text doesn't change.
- The iOS "Using BBQueue from your Home Screen?" line stays directly under the card, above the explanation.
- It says what a Player can do, not what they can't. Asking to sit out or leave during a Session is left out on purpose: it isn't what brings someone in.

## Unchanged

- The page title "Join link", the name steps, Confirm, matching and the dead ends.
- No roster is shown. Nothing new is read from the Backend, and the Join record and Security Rules don't change.

## Out of scope (later)

- Total players and number of Ended sessions on the card. A link holder can't read the Club, so these would have to be kept on the Join record, with a rules change. Dropped for now.

## E2E workflows

None new — copy and layout only, on steps the Join link workflows already drive. Which steps show the explanation is covered by component tests. The existing workflows must keep passing with "Welcome to" in place of "Join club" (see issue 01).
