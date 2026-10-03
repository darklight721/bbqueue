# 03: Avatar + Account settings

**What to build:** Home shows an avatar in the top-right corner: the Account's initials, or a default icon with no Account. Tapping it opens Account settings, which shows:
- the name, editable in place
- the Account ID, with a copy button
- with no Account, "Add your name", which creates one

After an Account is created, the app asks the browser to keep its data. In iOS Safari, when the app isn't installed, it shows a gentle "Add to Home Screen to keep your Account" hint. Delete Account comes later, in 11.

Spec: `.scratch/accounts/spec.md` (stories 5, 8–11).

**Blocked by:** 02 (Firebase setup + Welcome + create Account)

**Status:** ready-for-agent

- [ ] Domain function for initials (first letters of the first two words), unit-tested, including one-word and accented names
- [ ] Avatar on Home, with initials or a default icon, that links to Account settings
- [ ] Account settings: editing the name in place saves to the server and the device, and checks the name is valid (same rules as other name fields). The Account ID never changes.
- [ ] Copy Account ID, with feedback that it was copied
- [ ] "Add your name" when there's no Account creates one (needs a connection)
- [ ] Asks the browser to keep the app's data after an Account is created
- [ ] iOS Safari "Add to Home Screen" hint when the app isn't installed; it can be dismissed
- [ ] Back from Account settings returns to Home

## E2E workflows

- With an Account: Home avatar shows initials → Account settings → rename in place → initials update → still renamed after a reload.
- Copy Account ID shows confirmation.
- Skipped earlier: default avatar → Account settings → "Add your name" → Account created → initials shown.
