# 04 Matches and Win rate on roster rows

Status: ready-for-agent
Blocked by: 03
Spec: ../spec.md (Club page → Players, Domain)

## What

- Domain (`src/domain/playRecord.ts`): one pure function giving, for every Club player of a Club, their Ended matches played and Win rate in one pass over the Ended sessions, built on the Play record code. Unit tests: Club players with no Ended match, only unscored matches (Win rate "none"), older Ended sessions without `clubPlayerId` adding nothing, agreement with `clubPlayRecord` totals.
- Roster rows (outside Edit mode) get a second muted line, only for Club players with at least one Ended match: "12 matches · 58%"; with no win or loss yet, "3 matches". Use the Stats page's Win rate formatting.
- Check it on a long roster (30+ Club players). If the list looks crowded, flag it rather than squeeze more in; the spec allows dropping the line.

## E2E workflows

`e2e/club-page.spec.ts`, on chromium-mobile and webkit-mobile:
9. A Club player with Ended matches shows "N matches · W%" on their row; one who never played shows no second line.
