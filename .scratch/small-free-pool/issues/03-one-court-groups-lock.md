# Bug: 12, 16 or 20 players on 1 Court lock into fixed groups

Status: needs-triage
Type: task

Vocabulary per `GLOSSARY.md`. Rule order per ADR-0009.

## Problem

On 1 Court, when the number of players is a multiple of 4, the same groups of four play in a fixed cycle. In the sweep only 16–27% of pairs ever shared a Match, and the same four returned on 90% of Matches.

## Cause (traced, `../sweep.test.ts.txt` Section 2)

The Rests in a row rule (ADR-0009 rule 2: Rests in a row ≥ 2 × Courts goes first) is to blame. The four who sat out together reach the limit together and have identical counts, and they are exactly enough to fill the Lineup. So the pick is forced (95–97% of picks), and Fairness and Mixing never get a say.

| Players on 1 Court | Pairs | With the rule switched off |
|---|---|---|
| 8, 9, 10 | 100% | 100% |
| 11 | 96% | 100% |
| 12 | 27% | 100% |
| 13 | 86% | 100% |
| 16 | 20% | 100% |
| 20 | 16% | 100% |

## Needs a decision

Changing this changes the priority order in ADR-0009, so it needs grilling and probably an ADR before implementation. Options to consider:

- Let Mixing choose among players who reach the limit together.
- Only force players in when fewer of them are at the limit than there are places.
- Bring the most-overdue player in first, and let Mixing fill the other places.

The ADR-0009 guarantee to keep is that nobody sits out more than 2 rounds in a row on 1 Court (`simulation.test.ts`, "nobody sits out more than 2 rounds in a row on 1 Court").

## E2E workflows

None — pure domain logic, covered by unit tests and the simulation.
