# 03 — Past sessions UI (Home button, list, details)

Status: done
Blocked by: 02
Spec: ../spec.md (Screens)

## Scope

- Home "Past sessions" action (only when ≥ 1 Ended session).
- `PastSessionsScreen` list and `EndedSessionScreen` details, replacing 02's placeholders. Reuse `summaryFormat.ts` helpers and the History row format. Extract a shared row component if that's cleaner, without changing the live History look.
- e2e assertions for the list row and details content.
