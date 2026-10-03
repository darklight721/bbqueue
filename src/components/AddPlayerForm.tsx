import { useId, useRef, useState } from "react";
import { normalizeName, validateName } from "../domain/validation.ts";
import { DEFAULT_SKILL, type SkillLevel } from "../domain/types.ts";
import { PlusIcon } from "./icons.tsx";
import { NAME_ERROR_MESSAGE } from "./nameErrors.ts";
import { SkillSelect } from "./SkillSelect.tsx";

export interface NewPlayer {
  name: string;
  skill: SkillLevel;
  /** Always false when the "Save to club" option is not shown. */
  saveToClub: boolean;
}

export interface AddPlayerFormProps {
  /** Names already taken (case-insensitive duplicate check). */
  existingNames: readonly string[];
  onAdd: (player: NewPlayer) => void;
  /** Show the "Save to club" checkbox (only when there is a Club). Unchecked by default. */
  showSaveToClub?: boolean;
  /** Text on the add button. */
  addLabel?: string;
  autoFocus?: boolean;
}

/**
 * Add one player: name + Skill level (+ optional "Save to club").
 * Not a <form>, so it can sit inside other forms; Enter in the name field adds.
 */
export function AddPlayerForm({
  existingNames,
  onAdd,
  showSaveToClub = false,
  addLabel = "Add",
  autoFocus = false,
}: AddPlayerFormProps) {
  const [name, setName] = useState("");
  const [skill, setSkill] = useState<SkillLevel>(DEFAULT_SKILL);
  const [saveToClub, setSaveToClub] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const errorId = useId();
  const saveId = useId();

  const error = attempted ? validateName(name, existingNames) : null;

  function submit() {
    const problem = validateName(name, existingNames);
    if (problem) {
      setAttempted(true);
      nameRef.current?.focus();
      return;
    }
    onAdd({ name: normalizeName(name), skill, saveToClub: showSaveToClub && saveToClub });
    setName("");
    setSkill(DEFAULT_SKILL);
    setSaveToClub(false);
    setAttempted(false);
    nameRef.current?.focus();
  }

  return (
    // Container query: below 18rem (a 320px phone inside a padded box) the Add button drops its
    // icon so "Save to club" and the button share row 2 without wrapping.
    <div className="@container flex flex-col gap-3">
      {/* Row 1: name (takes the spare width) + Skill level (sized to fit "Intermediate"). */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-sm font-semibold text-base-content/80">
            Player name
          </label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            className={`input w-full text-base ${error ? "input-error" : ""}`}
            value={name}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="done"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- caller opts in
            autoFocus={autoFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {error ? (
            <p id={errorId} className="pl-1 text-sm font-semibold text-error">
              {NAME_ERROR_MESSAGE[error]}
            </p>
          ) : null}
        </div>
        <SkillSelect className="w-[8.75rem] shrink-0" value={skill} onChange={setSkill} />
      </div>

      {/* Row 2: Save to club (when there is a Club) on the left, Add fills the rest of the row */}
      {/* (the whole row when there's no checkbox). Outlined, not solid, so it never competes */}
      {/* with the screen's main action. flex-wrap is only a fallback for wider-than-expected */}
      {/* fonts: if Add can't keep its 7rem basis it drops below and spans the full width. */}
      <div className="flex flex-wrap items-center gap-2">
        {showSaveToClub ? (
          <label
            htmlFor={saveId}
            className="-ml-2 flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-field pr-1 pl-2 whitespace-nowrap"
          >
            <input
              id={saveId}
              type="checkbox"
              className="checkbox shrink-0 checkbox-primary"
              checked={saveToClub}
              onChange={(event) => setSaveToClub(event.target.checked)}
            />
            <span className="text-base">Save to club</span>
          </label>
        ) : null}
        <button
          type="button"
          className="btn grow basis-28 border-base-300 bg-base-100 btn-outline"
          onClick={submit}
        >
          <PlusIcon className="hidden size-5 @min-[18rem]:block" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}
