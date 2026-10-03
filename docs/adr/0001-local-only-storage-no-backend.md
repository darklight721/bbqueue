---
status: superseded by ADR-0006 for Shared clubs; still holds without an Account, for Local clubs, and for Sessions with no Club
---

# Local-only storage, no backend

The app runs entirely on one device: Clubs and the single active Session are stored in the browser's localStorage, and the Session is saved on every change (not just on navigation) so it survives tab kills and crashes. There is no server, no accounts and no sync — this keeps the PWA fully offline-capable courtside. Consequence: data is per-device/per-browser, and clearing site data loses it.

Ended sessions are also kept, up to a limit: see ADR-0005.
