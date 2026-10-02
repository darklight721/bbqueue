# 02 — `/sessions/*` routes + End session flow

Status: done
Blocked by: 01
Spec: ../spec.md (Routes, End session flow)

## Scope

- `App.tsx` routes per the spec table (`/sessions/new` before `/sessions/:id`). `/sessions/:id` dispatches Active → SessionScreen, Ended → `EndedSessionScreen`, else redirect `/sessions`.
- Placeholder `PastSessionsScreen` (`src/features/past-sessions/PastSessionsScreen.tsx`) and `EndedSessionScreen({ sessionId })` (`src/features/past-sessions/EndedSessionScreen.tsx`) so routes work. Ticket 03 replaces their contents.
- End session flow, Home/NewSession links, SessionScreen safety redirect, summary screen by id.
- Update all unit tests and e2e (`e2e/*.spec.ts`, `e2e/session-helpers.ts`) to the new paths. New e2e for the flow in spec Acceptance (list/details content assertions minimal; 03 extends them).
