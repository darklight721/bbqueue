# UI consistency: collapse toggles, Club in the header

Status: done

## 1. Collapse toggles

Every Show/Hide toggle on a section looks the same: just the chevron on phones, label and chevron from `sm` up. This covers Players, Queues and History in the live Session, and Standings and Matches on an Ended session. Standings and Matches used to show their label on phones too.

- One shared toggle, so the sections can't drift apart again.
- The label stays the accessible name at every width ("Show standings", "Hide matches").
- Standings and Matches use the same section header as the live Session. Their detail now gets cut off rather than wrapping under the title.

## 2. Club in the header

If a page header shows a Club, the page name is the title and the Club is the subtitle.

- Club sessions was the only screen the other way round. Its title is now "Past sessions" and its subtitle is the Club name, with no count: the count is already above the list.
- Its title matches `/sessions`, the same list across every Club. The link on the Club page stays "Sessions".
- Edit players keeps its count ("Club · 3 players"), and the live Session stays as it is.
- The Club page, New session, Stats and Ended session show the Club in the page body, so their headers don't change.

## E2E workflows

- Club page → Sessions: the header shows "Past sessions" with the Club name under it, and Back from an Ended session returns to it. Update `ended-sessions.spec.ts` and `club-page.spec.ts`.
- The collapse toggles need no new workflow: hiding a label on phones is a purely visual change, and the toggles keep their accessible names.
