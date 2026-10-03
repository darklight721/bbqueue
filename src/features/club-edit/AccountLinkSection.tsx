import { useId } from "react";
import type { Role } from "../../domain/types.ts";
import type { LinkState } from "./linkState.ts";

const PROBLEM_MESSAGE: Partial<Record<LinkState["kind"], string>> = {
  invalid: "That doesn't look like an Account ID, such as roy-7k3f.",
  duplicate: "That Account is already on this roster.",
  unknown: "No Account has that Account ID.",
  offline: "Linking an Account needs a connection.",
};

export interface AccountLinkSectionProps {
  /** The Club player's name, for labels. */
  playerName: string;
  state: LinkState;
  /** The text in the Account ID field (for a row with no link yet). */
  idText: string;
  online: boolean;
  /** Link-less rows: show the problem (after a failed Save) rather than only while typing. */
  showProblem: boolean;
  /** A Role change that was refused, to explain. */
  roleMessage: string | null;
  /** Another Organizer is needed before this one can step down or leave. */
  onlyOrganizer: boolean;
  onIdText: (text: string) => void;
  onRole: (role: Role) => void;
  onUnlink: () => void;
}

const ROLE_LABEL: Record<Role, string> = { organizer: "Organizer", player: "Player" };

/**
 * The part of a Club player row for Organizers of a Shared club: the optional Account ID with its
 * live "✓ Name", and the Role. Linking and Roles need a connection.
 */
export function AccountLinkSection({
  playerName,
  state,
  idText,
  online,
  showProblem,
  roleMessage,
  onlyOrganizer,
  onIdText,
  onRole,
  onUnlink,
}: AccountLinkSectionProps) {
  const idInputId = useId();
  const statusId = useId();
  const roleId = useId();
  const who = playerName.trim() || "this player";

  if (state.kind === "linked") {
    return (
      <div className="flex flex-col gap-1 pl-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm text-base-content/70">
            Account ID <span className="font-mono font-semibold">{state.accountId}</span>
          </span>
          {state.isYou ? (
            <span className="badge badge-sm badge-neutral font-semibold">You</span>
          ) : null}
          <label htmlFor={roleId} className="sr-only">
            Role for {who}
          </label>
          <select
            id={roleId}
            className="select select-sm w-auto"
            value={state.role}
            disabled={!online || state.exists === false}
            onChange={(event) => onRole(event.target.value as Role)}
          >
            <option value="organizer">{ROLE_LABEL.organizer}</option>
            <option value="player">{ROLE_LABEL.player}</option>
          </select>
        </div>
        {onlyOrganizer ? <p className="text-sm text-base-content/70">The only Organizer.</p> : null}
        {roleMessage ? (
          <p role="alert" className="text-sm font-semibold text-error">
            {roleMessage}
          </p>
        ) : null}
        {state.exists === false ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm font-semibold text-error">
              This Account no longer exists.
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onUnlink}
              disabled={!online}
            >
              Unlink {who}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const problem = PROBLEM_MESSAGE[state.kind];
  // Don't scold while someone is still typing a half-finished ID.
  const showMessage =
    problem && (showProblem || state.kind === "unknown" || state.kind === "duplicate");
  const status =
    state.kind === "found"
      ? `✓ ${state.name}`
      : state.kind === "checking"
        ? "Checking…"
        : showMessage
          ? problem
          : null;
  const bad = !!showMessage && state.kind !== "found";

  return (
    <div className="flex flex-col gap-1 pl-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idInputId} className="text-sm text-base-content/70">
          Account ID <span className="text-base-content/50">(optional)</span>{" "}
          <span className="sr-only">for {who}</span>
        </label>
        <input
          id={idInputId}
          type="text"
          className={`input input-sm w-44 font-mono ${bad ? "input-error" : ""}`}
          value={idText}
          placeholder="roy-7k3f"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={!online}
          aria-invalid={bad ? true : undefined}
          aria-describedby={status ? statusId : undefined}
          onChange={(event) => onIdText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {state.kind === "found" ? (
          <>
            <label htmlFor={roleId} className="sr-only">
              Role for {who}
            </label>
            <select
              id={roleId}
              className="select select-sm w-auto"
              value={state.role}
              onChange={(event) => onRole(event.target.value as Role)}
            >
              <option value="player">{ROLE_LABEL.player}</option>
              <option value="organizer">{ROLE_LABEL.organizer}</option>
            </select>
          </>
        ) : null}
      </div>
      {status ? (
        <p
          id={statusId}
          role="status"
          className={`text-sm font-semibold ${bad ? "text-error" : state.kind === "found" ? "text-success" : "text-base-content/70"}`}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
}
