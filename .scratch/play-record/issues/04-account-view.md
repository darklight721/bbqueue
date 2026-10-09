# 04 Account view and "Your stats" entry

Status: done
Blocked by: 03
Spec: ../spec.md (Account view, Entry points)

## What

- Route `/account/stats`, reusing the screen from 03 with `accountPlayRecord`. Session rows and Partners show their Club name when the view spans more than one Club.
- With no linked Club player row, show only the explanation. Without an Account, go back to `/account`.
- On `AccountSettingsScreen`, add a "Your stats" row in the Account panel, under the Account ID.
- Back: returns to `/account`.

## E2E workflows

`e2e/play-record.spec.ts`, on chromium-mobile and webkit-mobile:
3. Account page → Your stats → the Account view combines two Clubs → Back returns to the Account page.
