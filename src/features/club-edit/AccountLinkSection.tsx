import { useId } from "react";
import { LinkIcon, UnlinkIcon, WarningIcon } from "../../components/icons.tsx";
import { ROW_ACTION_COLUMN, ROW_SELECT_COLUMN } from "../../components/PlayerRowEditor.tsx";
import type { Role } from "../../domain/types.ts";
import { linkProblem, type LinkState } from "./linkState.ts";

type Linked = Extract<LinkState, { kind: "linked" }>;

/** "Checking…" or the problem, under a name field holding an `@Account ID`. */
export function LinkStatus({
  id,
  state,
  complete,
}: {
  id: string;
  state: LinkState;
  complete: boolean;
}) {
  const problem = linkProblem(state, complete);
  return (
    // Always there (if empty), so screen readers hear what changes.
    <p
      id={id}
      role="status"
      className={`pl-1 text-sm ${problem ? "font-semibold text-error" : "text-base-content/70"} ${
        state.kind === "checking" || problem ? "" : "sr-only"
      }`}
    >
      {state.kind === "checking" ? (
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="loading loading-xs loading-spinner" />
          Checking…
        </span>
      ) : (
        problem
      )}
    </p>
  );
}

export interface LinkedLineProps {
  /** The Club player's name, for labels. */
  playerName: string;
  state: Linked;
  online: boolean;
  /** A Role change that was refused, to explain. */
  roleMessage: string | null;
  /** Another Organizer is needed before this one can step down or leave. */
  onlyOrganizer: boolean;
  onRole: (role: Role) => void;
  /** Unlink a saved link (whether or not the Account still exists). */
  onUnlink: () => void;
  /** Unlink a link made here and not saved yet: take it back. */
  onUndo: () => void;
}

/**
 * The line under a linked Club player row, for Organizers: one band holding the Account ID, the
 * Role under the Skill level so Roles line up down the roster, and under Remove either "You" on
 * your own row or Unlink on anyone else's. Unlink takes back a link that isn't saved yet (offline
 * too), or removes a saved one (online only). An Account that no longer exists has no Role.
 */
export function LinkedLine({
  playerName,
  state,
  online,
  roleMessage,
  onlyOrganizer,
  onRole,
  onUnlink,
  onUndo,
}: LinkedLineProps) {
  const who = playerName.trim() || "this player";
  const gone = state.exists === false;

  return (
    <div className="flex flex-col gap-1">
      {/* As tall as a field, so the Role pill fills it; the Account ID is inset like the name
          field's text above. */}
      <div
        className={`flex h-[calc(var(--size-field,0.25rem)*10)] items-center gap-2 rounded-field text-sm ${
          gone
            ? "bg-error/10 text-error"
            : state.isYou
              ? "bg-primary/10 text-base-content/85"
              : "bg-base-200 text-base-content/80"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-3">
          {gone ? (
            <WarningIcon className="size-4 shrink-0" />
          ) : (
            <LinkIcon className="size-4 shrink-0 text-primary" />
          )}
          <span
            title={state.accountId}
            className={`min-w-0 truncate font-mono font-semibold ${gone ? "line-through" : ""}`}
          >
            {state.accountId}
          </span>
        </span>
        <div className={ROW_SELECT_COLUMN}>
          {/* An Account that no longer exists has no Role to pick; the column stays for alignment. */}
          {gone ? null : (
            <RolePill who={who} value={state.role} disabled={!online} onChange={onRole} />
          )}
        </div>
        {/* Under Remove: "You" on your own row (which has no Unlink), so the Account ID keeps
            the room. */}
        {state.isYou ? (
          <span className={`${ROW_ACTION_COLUMN} text-center text-xs font-semibold text-primary`}>
            You
          </span>
        ) : (
          <button
            type="button"
            className={`btn h-[calc(var(--size-field,0.25rem)*10)] min-h-0 shrink-0 btn-ghost px-0 disabled:bg-transparent disabled:opacity-40 ${ROW_ACTION_COLUMN} ${
              gone ? "text-error" : "text-base-content/70 hover:text-error"
            }`}
            aria-label={`Unlink ${who}`}
            onClick={state.saved ? onUnlink : onUndo}
            disabled={state.saved && !online}
          >
            <UnlinkIcon className="size-5" />
          </button>
        )}
      </div>
      {/* Helper lines start where the Account ID's icon and the name field's text do. */}
      {gone ? (
        <p role="alert" className="pl-3 text-sm font-semibold text-error">
          This Account no longer exists.
        </p>
      ) : null}
      {onlyOrganizer && !roleMessage ? (
        <p className="pl-3 text-sm text-base-content/60">The only Organizer.</p>
      ) : null}
      {roleMessage ? (
        <p role="alert" className="pl-3 text-sm font-semibold text-error">
          {roleMessage}
        </p>
      ) : null}
    </div>
  );
}

const ROLES: { value: Role; label: string }[] = [
  { value: "player", label: "Player" },
  { value: "organizer", label: "Organizer" },
];

/**
 * Player | Organizer, a pill like the Skill level picker in a Session player's menu. Each side
 * grows from its label's width, so "Organizer" fits in the narrow Skill level column.
 */
function RolePill({
  who,
  value,
  disabled,
  onChange,
}: {
  who: string;
  value: Role;
  disabled: boolean;
  onChange: (role: Role) => void;
}) {
  const groupName = useId();
  return (
    <div
      role="radiogroup"
      aria-label={`Role for ${who}`}
      className="flex h-[calc(var(--size-field,0.25rem)*10)] gap-0.5 rounded-full bg-base-100 p-0.5"
    >
      {ROLES.map((role) => {
        const on = value === role.value;
        return (
          <label
            key={role.value}
            className={`btn h-full min-h-0 flex-auto rounded-full border-0 px-0 text-[0.8125rem] shadow-none has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-primary ${
              on
                ? "btn-primary has-[:disabled]:opacity-50"
                : "btn-ghost text-base-content/75 has-[:disabled]:text-base-content/40"
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={groupName}
              value={role.value}
              checked={on}
              disabled={disabled}
              onChange={() => onChange(role.value)}
            />
            {role.label}
          </label>
        );
      })}
    </div>
  );
}
