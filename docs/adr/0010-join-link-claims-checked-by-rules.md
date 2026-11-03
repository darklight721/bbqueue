# Join link claims are checked by Security Rules, with a hashed name index

A Join link lets an Account that isn't on a Shared club link itself to one of its Club players. With no server code (ADR-0006), the token is checked by the Security Rules alone. The Club keeps its current `joinToken`. A claim is one batch that writes a claim record under `joinLinks/{token}/claims/{uid}`, adds the link to the row, and adds the uid to `memberUids`. The rules allow the row and Club changes from a non-member only when that claim record exists after the batch under the Club's *current* token, the row had no link, and the Role is Player. Resetting the link just changes `joinToken`, so an old token can't do anything even if its records linger.

Someone holding the link must not be able to list the roster, yet must be able to find their own Club player by name. The Join record therefore keeps a name index of `get`-only entries keyed by a SHA-256 of the token plus the normalised name. The client hashes what was typed and reads one entry, and `list` is refused. The index is derived data, like `memberUids`: every write that adds, renames, removes, links or unlinks a Club player, or renames the Club, updates it in the same batch.

## Considered Options

- **Show the roster on the Join page and let people pick**: rejected in favour of matching by name. Every link holder could read every name.
- **Let non-members read the Club's player rows when they hold a token**: impossible. Firestore rules can't see a token on a read, only the path being read.
- **A Cloud Function to check the token and write the link**: needs the paid Blaze plan (ADR-0006).

## Consequences

- Short names are guessable: someone with the link can try common names. The salt (the token) only stops precomputed tables and matching names across Clubs. That's accepted, because the link is already the secret.
- A client that doesn't update the index (an old cached version) can leave it stale until the next roster write. A stale `linked: false` is caught by the rules (the row must have no link). A stale `linked: true` shows "already linked" until an Organizer saves.
- After an Organizer unlinks a wrong claim, the same person can claim that row again until the link is reset.
