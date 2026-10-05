import { useId } from "react";
import type { SkillLevel } from "../domain/types.ts";
import { CloseIcon } from "./icons.tsx";
import { NAME_ERROR_MESSAGE, type NameErrorCode } from "./nameErrors.ts";
import { SkillSelect } from "./SkillSelect.tsx";

/** Width of the Skill level column; lines below a row (e.g. a Role) use it to line up. */
export const ROW_SELECT_COLUMN = "w-[8.75rem] shrink-0";
/** Width of the Remove column (a 48px square button, or its empty space). */
export const ROW_ACTION_COLUMN = "w-12 shrink-0";

export interface PlayerDraft {
  name: string;
  skill: SkillLevel;
}

export interface PlayerRowEditorProps {
  value: PlayerDraft;
  onChange: (value: PlayerDraft) => void;
  /** Leave out to hide the Remove button (e.g. for the Organizer row of a Shared club). */
  onRemove?: () => void;
  error?: NameErrorCode | null;
  autoFocus?: boolean;
  /** Enter in the name field (e.g. move on to the next player). */
  onEnter?: () => void;
  onBlur?: () => void;
  /** With no Remove button, still leave its space so this row lines up with the others. */
  keepRemoveSpace?: boolean;
  /** The name field also takes an `@Account ID`: says so, and leaves the text uncorrected. */
  linkable?: boolean;
  /** Mark the name field as having a problem explained elsewhere (see `describedBy`). */
  invalid?: boolean;
  /** Id of a message about the name field shown outside this component. */
  describedBy?: string;
}

/** One editable player: name + Skill level + Remove. Used for Club rosters. */
export function PlayerRowEditor({
  value,
  onChange,
  onRemove,
  error = null,
  autoFocus = false,
  onEnter,
  onBlur,
  keepRemoveSpace = false,
  linkable = false,
  invalid = false,
  describedBy,
}: PlayerRowEditorProps) {
  const nameId = useId();
  const errorId = useId();
  const displayName = value.name.trim();
  const flagged = !!error || invalid;
  const describedByIds = [error ? errorId : null, describedBy ?? null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={nameId} className="sr-only">
          Player name
        </label>
        <input
          id={nameId}
          type="text"
          className={`input min-w-0 flex-1 text-base ${flagged ? "input-error" : ""}`}
          value={value.name}
          placeholder={linkable ? "Name or @Account ID" : "Name"}
          autoComplete="off"
          autoCapitalize="words"
          // An Account ID typed here mustn't be "corrected" into a word.
          autoCorrect={linkable ? "off" : undefined}
          spellCheck={linkable ? false : undefined}
          enterKeyHint="next"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus a freshly added row
          autoFocus={autoFocus}
          aria-invalid={flagged ? true : undefined}
          aria-describedby={describedByIds || undefined}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (onEnter && event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        <SkillSelect
          className={ROW_SELECT_COLUMN}
          label={displayName ? `Skill level for ${displayName}` : "Skill level"}
          hideLabel
          value={value.skill}
          onChange={(skill) => onChange({ ...value, skill })}
        />
        {onRemove ? (
          <button
            type="button"
            className="btn btn-ghost btn-square shrink-0 text-base-content/70 hover:text-error"
            aria-label={displayName ? `Remove ${displayName}` : "Remove player"}
            onClick={onRemove}
          >
            <CloseIcon className="size-6" />
          </button>
        ) : keepRemoveSpace ? (
          // Same width as Remove, so Skill levels stay lined up down the roster.
          <span aria-hidden="true" className={ROW_ACTION_COLUMN} />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="pl-1 text-sm font-semibold text-error">
          {NAME_ERROR_MESSAGE[error]}
        </p>
      ) : null}
    </div>
  );
}
