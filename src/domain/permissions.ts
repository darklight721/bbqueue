import { accountIdsEqual } from "./accountId.ts";
import { applyClubChange, roleInClub, type ClubChange } from "./clubChanges.ts";
import type { ActiveSession, Club, ClubPlayer, Role } from "./types.ts";

/**
 * What an Account may do in a Club (GLOSSARY: Role, Organizer, Player). `accountId` is the viewing
 * Account's ID, or null/undefined without an Account. A Local club has no Roles: whoever holds the
 * device may do everything. The Security Rules (`firestore.rules`) enforce the same on the server.
 */
export type Viewer = string | null | undefined;

const isShared = (club: Club) => club.kind === "shared";

function isOrganizer(club: Club, viewer: Viewer): boolean {
  return !!viewer && roleInClub(club, viewer) === "organizer";
}

/** Change the Club's name and roster. */
export function canEditClub(club: Club, viewer: Viewer): boolean {
  return !isShared(club) || isOrganizer(club, viewer);
}

/** Link Accounts to Club players and change Roles. */
export function canChangeRoles(club: Club, viewer: Viewer): boolean {
  return isShared(club) && isOrganizer(club, viewer);
}

export function canStartSession(club: Club, viewer: Viewer): boolean {
  return canEditClub(club, viewer);
}

/** Take over an Active session as its Session host: Organizers of a Shared club. */
export function canTakeOver(club: Club, viewer: Viewer): boolean {
  return isShared(club) && isOrganizer(club, viewer);
}

export function canDeleteClub(club: Club, viewer: Viewer): boolean {
  return canEditClub(club, viewer);
}

/**
 * Delete an Ended session. `club` is the Club it belongs to as this device knows it, or null (no
 * Club, or a Club not on the device). No Club or a Local club: whoever holds the device. A Shared
 * club: only an Organizer, by their Role now (not whether they hosted it).
 */
export function canDeleteEndedSession(club: Club | null, viewer: Viewer): boolean {
  return !club || canEditClub(club, viewer);
}

/** The Club player row linked to `viewer`, if any. */
export function ownRow(club: Club, viewer: Viewer): ClubPlayer | null {
  if (!viewer) return null;
  return (
    club.players.find((player) => player.link && accountIdsEqual(player.link.accountId, viewer)) ??
    null
  );
}

/** How many of the rows (a Club's players, or a form's rows) are linked as Organizer. */
export function organizerCount(club: { players: readonly { link?: { role: Role } }[] }): number {
  return club.players.filter((player) => player.link?.role === "organizer").length;
}

/** The rule every Shared club keeps: at least one Organizer. */
export function hasOrganizer(club: Club): boolean {
  return organizerCount(club) > 0;
}

/** Whether `viewer` may leave the Club: they need a linked row, and can't be the last Organizer. */
export function leaveClubProblem(
  club: Club,
  viewer: Viewer,
): "not-linked" | "last-organizer" | null {
  const row = ownRow(club, viewer);
  if (!row) return "not-linked";
  return row.link?.role === "organizer" && organizerCount(club) <= 1 ? "last-organizer" : null;
}

export type ClubChangeProblem =
  /** `viewer` may not make this change. */
  | "forbidden"
  /** It would leave the Club without an Organizer. */
  | "last-organizer"
  /** The Account is already linked to another Club player in this Club. */
  | "already-linked"
  /** The Club player doesn't exist. */
  | "not-found";

/**
 * Why `viewer` can't make `change` to `club`, or null when they can. Organizers may do anything
 * as long as an Organizer is left; everyone else may only unlink themselves (leave).
 */
export function clubChangeProblem(
  club: Club,
  viewer: Viewer,
  change: ClubChange,
): ClubChangeProblem | null {
  if (!isShared(club)) return null;

  const playerId =
    "playerId" in change ? change.playerId : change.type === "addPlayer" ? change.player.id : null;
  const target = playerId ? club.players.find((player) => player.id === playerId) : undefined;
  const leaving =
    change.type === "unlink" &&
    !!target?.link &&
    !!viewer &&
    accountIdsEqual(target.link.accountId, viewer);

  if (!leaving && !isOrganizer(club, viewer)) return "forbidden";
  if (change.type !== "rename" && change.type !== "addPlayer" && !target) return "not-found";

  const link =
    change.type === "link"
      ? change.link
      : change.type === "addPlayer"
        ? change.player.link
        : undefined;
  if (link) {
    const taken = club.players.some(
      (player) =>
        player.id !== playerId &&
        player.link &&
        accountIdsEqual(player.link.accountId, link.accountId),
    );
    if (taken) return "already-linked";
  }

  if (hasOrganizer(club) && !hasOrganizer(applyClubChange(club, change))) return "last-organizer";
  return null;
}

/**
 * Whether `viewer` runs this Active session (ADR-0007). The device's own Session (a Local club or
 * no Club, `shared` null) is always run by whoever holds the device; a Shared club's Session only
 * by its Session host. Everyone else sees it read-only.
 */
export function isSessionHost(shared: ActiveSession | null, viewer: Viewer): boolean {
  if (!shared) return true;
  return !!viewer && accountIdsEqual(shared.hostAccountId, viewer);
}
