import { useId } from "react";
import { CloseIcon, LinkIcon, WarningIcon } from "../../components/icons.tsx";
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
  /** A saved link to an Account that no longer exists. */
  onUnlink: () => void;
  /** A link made here and not saved yet: take it back. */
  onUndo: () => void;
}

/**
 * The line under a linked Club player row, for Organizers: the Account ID (and the Account's
 * name when it differs from the row's), You, and the Role, which sits under the Skill level so
 * Roles line up down the roster. A link that isn't saved yet can be taken back with ✕.
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
  const roleId = useId();
  const who = playerName.trim() || "this player";
  const gone = state.exists === false;
  // The Account's own name only when it adds something (it often matches the row's name).
  const accountName =
    state.name && state.name.trim().toLowerCase() !== playerName.trim().toLowerCase()
      ? state.name
      : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
          <span
            className={`inline-flex min-w-0 items-start gap-1.5 rounded-field px-2.5 py-1.5 text-sm leading-5 ${
              gone ? "bg-error/10 text-error" : "bg-base-200 text-base-content/80"
            }`}
          >
            {gone ? (
              <WarningIcon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <LinkIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            )}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {state.saved ? null : "Linked to "}
              <span className={`font-mono font-semibold ${gone ? "line-through" : ""}`}>
                {state.accountId}
              </span>
              {accountName ? <span className="text-base-content/60"> · {accountName}</span> : null}
            </span>
          </span>
          {state.isYou ? (
            <span className="badge shrink-0 badge-sm font-semibold badge-neutral">You</span>
          ) : null}
          {!state.saved && !state.isYou ? (
            <button
              type="button"
              className="btn -ml-1 size-10 shrink-0 btn-circle text-base-content/60 btn-ghost hover:text-error"
              aria-label={`Remove link for ${who}`}
              onClick={onUndo}
            >
              <CloseIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <div className={ROW_SELECT_COLUMN}>
          {gone ? (
            <button
              type="button"
              className="btn w-full border-base-300 btn-outline"
              onClick={onUnlink}
              disabled={!online}
            >
              Unlink <span className="sr-only">{who}</span>
            </button>
          ) : (
            <RoleSelect
              id={roleId}
              who={who}
              value={state.role}
              disabled={!online}
              onChange={onRole}
            />
          )}
        </div>
        {/* Under Remove, so the Role sits right under the Skill level. */}
        <span aria-hidden="true" className={ROW_ACTION_COLUMN} />
      </div>
      {gone ? (
        <p role="alert" className="pl-1 text-sm font-semibold text-error">
          This Account no longer exists.
        </p>
      ) : null}
      {onlyOrganizer && !roleMessage ? (
        <p className="pl-1 text-sm text-base-content/60">The only Organizer.</p>
      ) : null}
      {roleMessage ? (
        <p role="alert" className="pl-1 text-sm font-semibold text-error">
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

/** Player / Organizer, styled like the Skill level select above it. */
function RoleSelect({
  id,
  who,
  value,
  disabled,
  onChange,
}: {
  id: string;
  who: string;
  value: Role;
  disabled: boolean;
  onChange: (role: Role) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Role for {who}
      </label>
      <select
        id={id}
        className="select w-full text-base"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Role)}
      >
        {ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
    </>
  );
}
