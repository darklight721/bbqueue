# Small tweaks: whole hours, queue trash icon

Status: done

## 1. Whole hours

- New session "Hours" stepper: step **1**, min **1**, max 12. A typed decimal rounds to the nearest whole number on blur.
- Engine `MIN_HOURS` = 1 (validation). Already-saved Sessions with half hours are left as they are.

## 2. Remove queue → trash icon

- Replace the "Remove queue" text button in the Queue card header with a trash icon button styled exactly like Remove court (`CourtCard.tsx`: ghost square, `size-11`, `text-base-content/60 hover:text-error`, `TrashIcon size-6`).
- `aria-label="Remove queue N"`, `title="Remove queue"`. No confirm (unchanged).

## Acceptance

- Unit/e2e updated: hours steps 1→2→3, can't go below 1, typing 2.5 commits 3 (rounds). Queue removal is found by its accessible name "Remove queue N".
