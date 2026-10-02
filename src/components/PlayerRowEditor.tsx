import { useId } from "react";
import type { SkillLevel } from "../domain/types.ts";
import { CloseIcon } from "./icons.tsx";
import { NAME_ERROR_MESSAGE, type NameErrorCode } from "./nameErrors.ts";
import { SkillSelect } from "./SkillSelect.tsx";

export interface PlayerDraft {
  name: string;
  skill: SkillLevel;
}

export interface PlayerRowEditorProps {
  value: PlayerDraft;
  onChange: (value: PlayerDraft) => void;
  onRemove: () => void;
  error?: NameErrorCode | null;
  autoFocus?: boolean;
  /** Enter in the name field (e.g. move on to the next player). */
  onEnter?: () => void;
}

/** One editable player: name + Skill level + Remove. Used for Club rosters. */
export function PlayerRowEditor({
  value,
  onChange,
  onRemove,
  error = null,
  autoFocus = false,
  onEnter,
}: PlayerRowEditorProps) {
  const nameId = useId();
  const errorId = useId();
  const displayName = value.name.trim();

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor={nameId} className="sr-only">
          Player name
        </label>
        <input
          id={nameId}
          type="text"
          className={`input min-w-0 flex-1 text-base ${error ? "input-error" : ""}`}
          value={value.name}
          placeholder="Name"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus a freshly added row
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          onKeyDown={(event) => {
            if (onEnter && event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onEnter();
            }
          }}
        />
        <SkillSelect
          className="w-[8.75rem] shrink-0"
          label={displayName ? `Skill level for ${displayName}` : "Skill level"}
          hideLabel
          value={value.skill}
          onChange={(skill) => onChange({ ...value, skill })}
        />
        <button
          type="button"
          className="btn btn-ghost btn-square shrink-0 text-base-content/70 hover:text-error"
          aria-label={displayName ? `Remove ${displayName}` : "Remove player"}
          onClick={onRemove}
        >
          <CloseIcon className="size-6" />
        </button>
      </div>
      {error ? (
        <p id={errorId} className="pl-1 text-sm font-semibold text-error">
          {NAME_ERROR_MESSAGE[error]}
        </p>
      ) : null}
    </div>
  );
}
