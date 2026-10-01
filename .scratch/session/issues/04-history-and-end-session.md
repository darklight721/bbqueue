# 04 — History + End session

Status: done
Blocked by: 01
Spec: ../spec.md (sections 5, 6)

## Scope

- **History**: collapsible and collapsed by default, newest first. Each entry shows "Match #n · Court N", both Teams with Skill levels, the score or "No score", and the duration.
- **End session**:
  - Asks for confirmation, mentioning any matches in progress ("N matches in progress will be ended without a score.").
  - Then runs engine `endSession`, saves with `setSummary`, deletes the Session with `setSession(null)` and navigates to `/session/summary`.

## Acceptance

- After ending a scored match and an unscored one, History shows both entries in the right order with the correct details.
- End session with an Active match: the confirm mentions it, then the app lands on `/session/summary` and storage has a summary and no Session.
