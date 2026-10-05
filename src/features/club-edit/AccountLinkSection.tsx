import { useId } from "react";
import { LinkIcon, WarningIcon } from "../../components/icons.tsx";
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
 * The line under a linked Club player row, for Organizers: the Account ID on one line, and under
 * it "You" on your own row or Unlink on anyone else's; then the Role, which sits under the Skill
 * level so Roles line up down the roster. Unlink takes back a link that isn't saved yet (offline
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
  const roleId = useId();
  const who = playerName.trim() || "this player";
  const gone = state.exists === false;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1">
          {/* Fills the column, so its edges match the name field above; as tall as the Role
              select beside it (daisyUI's field height), both lines inside. Content is inset like
              the name field's text. */}
          <div
            className={`flex h-[calc(var(--size-field,0.25rem)*10)] w-full min-w-0 flex-col justify-center rounded-field px-3 text-sm leading-5 ${
              gone
                ? "bg-error/10 text-error"
                : state.isYou
                  ? "bg-primary/10 text-base-content/85"
                  : "bg-base-200 text-base-content/80"
            }`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
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
            {/* Under the Account ID, past the icon. */}
            <span className="flex min-h-6 items-center pl-5.5">
              {state.isYou ? (
                <span className="text-xs font-semibold text-primary">You</span>
              ) : (
                <button
                  type="button"
                  className={`-mx-1 inline-flex min-h-6 items-center rounded-selector px-1 text-xs font-semibold underline decoration-current/40 underline-offset-2 hover:decoration-current disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50 ${
                    gone ? "text-error" : "text-base-content/65 hover:text-error"
                  }`}
                  onClick={state.saved ? onUnlink : onUndo}
                  disabled={state.saved && !online}
                >
                  Unlink <span className="sr-only">{who}</span>
                </button>
              )}
            </span>
          </div>
        </div>
        <div className={ROW_SELECT_COLUMN}>
          {/* An Account that no longer exists has no Role to pick; the column stays for alignment. */}
          {gone ? null : (
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
      {/* Helper lines start where the chip's content and the name field's text do. */}
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
