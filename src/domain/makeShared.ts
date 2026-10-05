import { creatorPlayer } from "./clubChanges.ts";
import type { Account, Club, ClubPlayer, Session } from "./types.ts";
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
 * A Local club made shared (ticket 10): the Club keeps its id, name and every row, and one row,
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
