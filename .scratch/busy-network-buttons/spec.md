# Busy state on buttons that wait for the server

Status: ready-for-agent

## Problem

Some buttons in a Shared club, or on an Account, wait for the server before their action finishes. Some of them show nothing while they wait, so a person can't tell that anything is happening, and three of them only change their label. Offline handling already exists (`useOnline`, `OfflineNote`, disabled buttons), so this change only covers the time spent waiting while online.

## Scope

Server-required actions only. The Session host's changes during a Session (local-first, ADR-0007), Local clubs, Sessions with no Club, ending a Shared club's Session (the app doesn't wait for the server) and Session summary share (local) are **out**. Asking to sit out, be back in or leave the Session is **out** too, because it already switches to "Waiting for host".

| Button | Where | Busy label |
|---|---|---|
| Continue (create Account) | `src/features/account/CreateAccountForm.tsx` | already done ("Creating your Account…") |
| Save (rename Account) | `src/features/account/AccountSettingsScreen.tsx` | already has a spinner; add "Saving…" label |
| Delete session (Ended session) | `src/features/past-sessions/EndedSessionScreen.tsx` | already done ("Deleting…") |
| Take over | `src/features/session/TakeOver.tsx` | "Taking over…" + spinner |
| Make shared club | `src/features/club-edit/MakeShared.tsx` | "Sharing…" + spinner |
| Delete Account (dialog confirm) | `src/features/account/DeleteAccount.tsx` | "Deleting…" + spinner |
| Save (Club edit) | `src/features/club-edit/ClubEditScreen.tsx` | "Saving…" + spinner |
| Start session (Shared club) | `src/features/new-session/NewSessionScreen.tsx` | "Starting…" + spinner |
| Delete club (confirm) | `src/features/club-edit/ClubEditScreen.tsx` | "Deleting…" + spinner, in the dialog |
| Leave club (confirm) | `src/features/club-edit/ClubEditScreen.tsx`, `ClubReadOnly.tsx` (Player) | "Leaving…" + spinner, in the dialog |

## Decisions

1. **Look**: daisyUI `loading loading-spinner loading-sm` (aria-hidden) before an "…ing" label, as on Delete session today. The spinner takes the place of any leading icon.
2. **Timing**: busy as soon as the button is pressed, with no delay.
3. **While busy**: the button can't be pressed again (`disabled`, or `aria-disabled` where focus has to stay put, as in CreateAccountForm) and has `aria-busy`. Buttons next to it that would conflict are disabled too (e.g. Add player beside Save). Back (TopBar) does nothing while an action that navigates on success is pending. Form fields are read-only while Club edit is saving.
4. **Confirm dialogs (Delete club, Leave club)**: the dialog stays open while the action runs. Its confirm button shows the busy state, Cancel is disabled, and Escape and the backdrop do nothing. This is how Delete Account behaves today. The dialog closes on success (the screen navigates away) and on failure (the existing error appears on the screen).
5. **Errors**: existing error messages are unchanged. After a failure the button goes back to its normal state.
6. Local-only paths (a Local club's Save, starting a Session with a Local club or no Club) finish synchronously and show no busy state.

## E2E workflows

None. The local fake Backend answers instantly, so the e2e tests can't reliably see the busy state. Vitest covers it per button by holding the Backend promise open (see `src/features/past-sessions/EndedSessionDelete.test.tsx`, "shows it's busy while the server answers…"): busy label, disabled, `aria-busy`, conflicting buttons disabled, and the normal state again after a failure.
