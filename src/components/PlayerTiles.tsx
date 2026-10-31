import { useId } from "react";
import type { SkillLevel } from "../domain/types.ts";
import { CloseIcon } from "./icons.tsx";
import { SkillBadge } from "./SkillBadge.tsx";

/**
 * One Club player in a two-column picker: the whole tile toggles the checkbox.
 * Name on top (truncated; full name in `title` and the checkbox's accessible name), compact Skill below,
 * then an optional note ("Left earlier", "Name taken"). `disabled` greys it out; say why in `note`.
 */
export function ClubPlayerTile({
  name,
  skill,
  checked,
  onToggle,
  note,
  disabled = false,
}: {
  name: string;
  skill: SkillLevel;
  checked: boolean;
  onToggle: () => void;
  note?: string;
  disabled?: boolean;
}) {
  const nameId = useId();
  const noteId = useId();
  return (
    <label
      title={name}
      className={`flex h-full min-h-14 items-center gap-2.5 rounded-box border-[1.5px] py-2 pr-2 pl-2.5 transition-colors select-none has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        disabled
          ? "cursor-not-allowed border-base-300 bg-base-200/60"
          : checked
            ? "cursor-pointer border-primary bg-primary/10"
            : "cursor-pointer border-base-300 bg-base-100 active:bg-base-200"
      }`}
    >
      <input
        type="checkbox"
        className="checkbox shrink-0 checkbox-primary"
        checked={checked}
        disabled={disabled}
        aria-labelledby={nameId}
        aria-describedby={note ? noteId : undefined}
        onChange={onToggle}
      />
      <span
        className={`flex min-w-0 flex-1 flex-col items-start gap-1 ${disabled ? "opacity-60" : ""}`}
      >
        <span id={nameId} className="max-w-full truncate leading-tight font-semibold">
          {name}
        </span>
        <SkillBadge skill={skill} compact size="sm" />
        {note ? (
          <span id={noteId} className="text-xs leading-tight text-base-content/70">
            {note}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * One Guest in the same two-column grid as Club players: name, compact Skill, an optional status
 * line ("Name taken" / "Saves to club") and a remove ✕ in the top-right corner (44px target).
 */
export function GuestTile({
  name,
  skill,
  saveToClub,
  clash = false,
  onRemove,
}: {
  name: string;
  skill: SkillLevel;
  saveToClub: boolean;
  clash?: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={`relative flex h-full min-h-14 flex-col items-start gap-1 rounded-box border-[1.5px] bg-base-100 py-2 pl-3 ${
        clash ? "border-error" : "border-base-300"
      }`}
    >
      {/* pr keeps the name clear of the ✕; the lines below run under it (the ✕ is only 44px tall). */}
      <span title={name} className="max-w-full truncate pr-11 leading-tight font-semibold">
        {name}
      </span>
      <SkillBadge skill={skill} compact size="sm" />
      {clash ? (
        <span className="pr-2 text-xs leading-tight font-semibold text-error">
          <span aria-hidden="true">Name taken</span>
          <span className="sr-only">Name already used by a Club player</span>
        </span>
      ) : saveToClub ? (
        <span className="pr-2 text-xs leading-tight text-base-content/65">Saves to club</span>
      ) : null}
      <button
        type="button"
        className="btn absolute top-0 right-0 size-11 rounded-box btn-ghost p-0 text-base-content/70 btn-square hover:text-error"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <CloseIcon className="size-5" />
      </button>
    </div>
  );
}
