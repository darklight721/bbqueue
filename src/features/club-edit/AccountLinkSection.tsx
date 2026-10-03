import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, LinkIcon, WarningIcon } from "../../components/icons.tsx";
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
 * The line under a Club player row for Organizers of a Shared club. A linked row shows a small
 * chip (the Account ID, and the Account's name when it differs) and the Role. A row with no link
 * shows only "Link Account"; the Account ID field, with its live "✓ Name", opens from there.
 * Linking and Roles need a connection.
 */
export function AccountLinkSection(props: AccountLinkSectionProps) {
  if (props.state.kind === "linked") return <LinkedLine {...props} state={props.state} />;
  return <LinkEditor {...props} />;
}

function LinkedLine({
  playerName,
  state,
  online,
  roleMessage,
  onlyOrganizer,
  onRole,
  onUnlink,
}: AccountLinkSectionProps & { state: Extract<LinkState, { kind: "linked" }> }) {
  const roleId = useId();
  const who = playerName.trim() || "this player";
  const gone = state.exists === false;
  // The Account's own name only when it adds something (it often matches the row's name).
  const accountName =
    state.name && state.name.trim().toLowerCase() !== playerName.trim().toLowerCase()
      ? state.name
      : null;

  return (
    <div className="flex flex-col gap-1 pl-1">
      <div className="flex min-h-10 items-center gap-2">
        <span
          className={`inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm ${
            gone ? "bg-error/10 text-error" : "bg-base-200 text-base-content/80"
          }`}
        >
          {gone ? (
            <WarningIcon className="size-4 shrink-0" />
          ) : (
            <LinkIcon className="size-4 shrink-0 text-primary" />
          )}
          {accountName ? <span className="truncate font-semibold">{accountName}</span> : null}
          <span
            className={`truncate font-mono ${accountName ? "text-base-content/60" : "font-semibold"} ${gone ? "line-through" : ""}`}
          >
            {state.accountId}
          </span>
        </span>
        {state.isYou ? (
          <span className="badge badge-sm shrink-0 badge-neutral font-semibold">You</span>
        ) : null}
        <span className="flex-1" />
        {gone ? (
          <button
            type="button"
            className="btn shrink-0 border-base-300 btn-outline btn-sm"
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
            order={["organizer", "player"]}
            onChange={onRole}
          />
        )}
      </div>
      {gone ? (
        <p role="alert" className="text-sm font-semibold text-error">
          This Account no longer exists.
        </p>
      ) : null}
      {onlyOrganizer && !roleMessage ? (
        <p className="text-sm text-base-content/60">The only Organizer.</p>
      ) : null}
      {roleMessage ? (
        <p role="alert" className="text-sm font-semibold text-error">
          {roleMessage}
        </p>
      ) : null}
    </div>
  );
}

function LinkEditor({
  playerName,
  state,
  idText,
  online,
  showProblem,
  onIdText,
  onRole,
}: AccountLinkSectionProps) {
  const idInputId = useId();
  const statusId = useId();
  const roleId = useId();
  const who = playerName.trim() || "this player";
  const [open, setOpen] = useState(false);
  const expanded = open || idText !== "";
  const linkButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  // After "Don't link", put focus back on "Link Account" rather than losing it.
  useEffect(() => {
    if (!expanded && returnFocus.current) {
      returnFocus.current = false;
      linkButton.current?.focus();
    }
  }, [expanded]);

  if (!expanded) {
    return (
      <div className="pl-1">
        <button
          ref={linkButton}
          type="button"
          className="btn -ml-2 h-9 min-h-9 gap-1.5 px-2 text-sm font-semibold text-base-content/65 btn-ghost hover:text-primary"
          disabled={!online}
          onClick={() => setOpen(true)}
        >
          <LinkIcon className="size-4" />
          Link Account <span className="sr-only">for {who}</span>
        </button>
      </div>
    );
  }

  const problem = PROBLEM_MESSAGE[state.kind];
  // Don't scold while someone is still typing a half-finished ID.
  const showMessage =
    problem && (showProblem || state.kind === "unknown" || state.kind === "duplicate");
  const bad = !!showMessage && state.kind !== "found";
  const hasStatus = state.kind === "found" || state.kind === "checking" || !!showMessage;

  return (
    // Indented under the row with a rule, so it reads as part of that Club player.
    <div className="ml-3 flex flex-col gap-1.5 border-l-2 border-base-300 pt-1 pl-3">
      <label htmlFor={idInputId} className="text-sm font-semibold text-base-content/70">
        Account ID <span className="sr-only">for {who}</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          id={idInputId}
          type="text"
          // 16px text: smaller makes iOS zoom in on focus.
          className={`input h-10 min-w-0 flex-1 font-mono text-base ${bad ? "input-error" : ""}`}
          value={idText}
          placeholder="roy-7k3f"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened on purpose with Link Account
          autoFocus={open && idText === ""}
          disabled={!online}
          aria-invalid={bad ? true : undefined}
          aria-describedby={hasStatus ? statusId : undefined}
          onChange={(event) => onIdText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-square shrink-0 text-base-content/60 btn-ghost btn-sm"
          aria-label={`Don't link ${who}`}
          onClick={() => {
            returnFocus.current = true;
            onIdText("");
            setOpen(false);
          }}
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
      {/* Keeps a line for the result so the roster doesn't jump as it changes. */}
      <div className="flex min-h-6 items-center gap-2">
        {state.kind === "found" ? (
          <>
            <p
              id={statusId}
              role="status"
              className="min-w-0 flex-1 truncate text-sm font-semibold text-success"
            >
              ✓ {state.name}
            </p>
            <RoleSelect
              id={roleId}
              who={who}
              value={state.role}
              disabled={false}
              order={["player", "organizer"]}
              onChange={onRole}
            />
          </>
        ) : state.kind === "checking" ? (
          <p
            id={statusId}
            role="status"
            className="flex items-center gap-2 text-sm text-base-content/70"
          >
            <span aria-hidden="true" className="loading loading-xs loading-spinner" />
            Checking…
          </p>
        ) : showMessage ? (
          <p
            id={statusId}
            role="status"
            className={`text-sm font-semibold ${bad ? "text-error" : "text-base-content/70"}`}
          >
            {problem}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Organizer / Player as a small pill; Organizer is tinted so they stand out down the roster. */
function RoleSelect({
  id,
  who,
  value,
  disabled,
  order,
  onChange,
}: {
  id: string;
  who: string;
  value: Role;
  disabled: boolean;
  order: Role[];
  onChange: (role: Role) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Role for {who}
      </label>
      <select
        id={id}
        className={`select w-auto shrink-0 rounded-full pl-3.5 font-semibold select-sm ${
          value === "organizer" ? "border-primary/40 bg-primary/10 text-primary" : ""
        }`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as Role)}
      >
        {order.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
    </>
  );
}
