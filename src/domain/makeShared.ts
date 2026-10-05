import { creatorPlayer } from "./clubChanges.ts";
import { accountIdsEqual } from "./accountId.ts";
import type { Account, Club, ClubPlayer, EndedSession, Session } from "./types.ts";
import { namesEqual } from "./validation.ts";

/** Who the person is on the roster of the Local club they are making shared. */
export type ShareChoice = { type: "row"; rowId: string } | { type: "add-me" };

export type ShareResult =
  | {
      ok: true;
      /** The Shared club: the same id, name and rows, with the chosen row linked as Organizer. */
      club: Club;
      /** The Club player row that is this Account's. */
      meRowId: string;
    }
  | { ok: false; reason: ShareProblem };

export type ShareProblem =
  /** The Club is Shared already. */
  | "already-shared"
  /** The chosen row isn't on the roster. */
  | "row-not-found"
  /** "Add me" would repeat the name of a player already on the roster. */
  | "name-taken";

/**
 * A Local club made shared: the Club keeps its id, name and every row, and one row,
 * the person's own (an existing one, or a new one named after the Account at Intermediate), is
 * linked to their Account as Organizer. Nobody else is linked: that happens afterwards, as for any
 * Shared club. Pure; nothing is saved here.
 */
export function makeSharedClub(
  club: Club,
  choice: ShareChoice,
  account: Account,
  newId: () => string,
): ShareResult {
  if (club.kind === "shared") return { ok: false, reason: "already-shared" };
  // Rows of a Local club are never linked, but a stray link must not survive.
  const rows: ClubPlayer[] = club.players.map(({ link: _link, ...row }) => row);

  if (choice.type === "row") {
    if (!rows.some((row) => row.id === choice.rowId)) return { ok: false, reason: "row-not-found" };
    return {
      ok: true,
      meRowId: choice.rowId,
      club: {
        ...club,
        kind: "shared",
        players: rows.map((row) =>
          row.id === choice.rowId
            ? { ...row, link: { accountId: account.accountId, role: "organizer" } }
            : row,
        ),
      },
    };
  }

  if (rows.some((row) => namesEqual(row.name, account.name))) {
    return { ok: false, reason: "name-taken" };
  }
  const me = creatorPlayer(account, newId());
  return { ok: true, meRowId: me.id, club: { ...club, kind: "shared", players: [...rows, me] } };
}

/**
 * The device's Active session as the Shared club's: the Session player that was the chosen Club
 * player keeps the linked Account (ADR-0002: a snapshot of the link as the Club has it now).
 */
export function sessionForSharing(session: Session, meRowId: string, accountId: string): Session {
  if (!session.players.some((player) => player.clubPlayerId === meRowId)) return session;
  return {
    ...session,
    players: session.players.map((player) =>
      player.clubPlayerId === meRowId ? { ...player, accountId } : player,
    ),
  };
}

export type ShareInputProblem =
  /** The Club to create isn't a Shared club. */
  | "not-shared"
  /** Not exactly one row is linked, as Organizer, to the Account that is making it. */
  | "wrong-link"
  /** An Ended session or the Active session belongs to another Club. */
  | "other-club";

/**
 * What a Backend checks before it makes a Local club shared (see `Backend.makeSharedClub`): the
 * Club is a Shared club with exactly one linked row, the Account's own, as Organizer, and what
 * goes with it belongs to this Club. Null when the input is fine.
 */
export function shareInputProblem(
  input: { club: Club; endedSessions: readonly EndedSession[]; activeSession: Session | null },
  account: Account,
): ShareInputProblem | null {
  const { club, endedSessions, activeSession } = input;
  if (club.kind !== "shared") return "not-shared";
  const linked = club.players.filter((row) => row.link);
  const link = linked[0]?.link;
  if (
    linked.length !== 1 ||
    link?.role !== "organizer" ||
    !accountIdsEqual(link.accountId, account.accountId)
  ) {
    return "wrong-link";
  }
  if (
    endedSessions.some((ended) => ended.clubId !== club.id) ||
    (activeSession && activeSession.clubId !== club.id)
  ) {
    return "other-club";
  }
  return null;
}
