import type { BackendErrorCode } from "../../backend/backend.ts";

/**
 * The steps of the Join page (spec: Join link). Pure, so each way through is unit-tested; the
 * screen does the Backend calls and shows the step.
 */

/** Where a name being looked up came from. */
export type LookupFrom =
  /** The Account on this device: its Name, looked up as soon as the page opens. */
  | "account"
  /** No Account: the Your name step, the name the Account will be created with. */
  | "your-name"
  /** The Your name in <Club> step: only finds a Club player, never renames the Account. */
  | "name-in-club";

export type JoinStep =
  /** Finding the Club of the link (and, with an Account, its Name in the Club). */
  | { type: "loading" }
  /** The link doesn't work: reset, unknown, its Club deleted, or no Backend. */
  | { type: "dead" }
  /** Opening the link or looking a name up failed, not for want of a connection. */
  | { type: "failed" }
  | { type: "your-name" }
  | { type: "name-in-club" }
  /** A Club player has `name` and isn't linked: "You're <name> in <Club>?" */
  | { type: "confirm"; name: string; from: LookupFrom }
  | { type: "no-match"; name: string }
  | { type: "already-linked"; name: string }
  /** Someone else Claimed `name` between the lookup and Yes. */
  | { type: "just-claimed"; name: string };

/** What the page does once it knows the link's Club. */
export function firstStep({
  accountName,
  onClub,
}: {
  /** The Name of the Account on this device, or null without one. */
  accountName: string | null;
  /** The Club is on this device already: the Account on it is linked to a row. */
  onClub: boolean;
}): { type: "to-club" } | { type: "look-up"; name: string } | { type: "step"; step: JoinStep } {
  if (onClub) return { type: "to-club" };
  if (accountName !== null) return { type: "look-up", name: accountName };
  return { type: "step", step: { type: "your-name" } };
}

/**
 * The step after looking `name` up. No match from the Account's Name or the Your name step asks
 * for the name in the Club; no match there is the end of the road ("Ask an Organizer").
 */
export function stepAfterLookup(
  from: LookupFrom,
  name: string,
  found: { linked: boolean } | null,
): JoinStep {
  if (!found)
    return from === "name-in-club" ? { type: "no-match", name } : { type: "name-in-club" };
  if (found.linked) return { type: "already-linked", name };
  return { type: "confirm", name, from };
}

/** What a refused Claim of `name` leads to. */
export function afterClaimError(
  code: BackendErrorCode,
  name: string,
):
  | { type: "step"; step: JoinStep }
  /** This Account is on the Club already: its page opens. */
  | { type: "to-club" }
  /**
   * The link stopped working, or an Organizer renamed or removed the row since the lookup: the
   * link says which ({@link stepAfterNameGone}).
   */
  | { type: "check-link" }
  /** Stay on Confirm and say it failed; Yes tries again. Offline, the page says so instead. */
  | { type: "retry"; offline: boolean } {
  switch (code) {
    case "already-claimed":
      return { type: "step", step: { type: "just-claimed", name } };
    case "already-linked":
      return { type: "to-club" };
    case "not-found":
      return { type: "check-link" };
    default:
      return { type: "retry", offline: code === "offline" };
  }
}

/** The step after a Claim of `name` was refused `not-found`, once it is known if the link works. */
export function stepAfterNameGone(linkWorks: boolean, name: string): JoinStep {
  return linkWorks ? { type: "no-match", name } : { type: "dead" };
}
