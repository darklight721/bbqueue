import type { Session } from "../types.ts";

/** What the Courts section tells the organiser when few players are Spare (see GLOSSARY: Spare players). */
export type SpareNotice = {
  /** "courts" = 2+ Courts, "one-court" = 1 Court. */
  kind: "courts" | "one-court";
  /** Session players not removed and not Sitting out. */
  players: number;
  /** All Courts in the Session, Idle or Busy. */
  courts: number;
  /** players - 4 * courts (0..2 for "courts", 0..1 for "one-court"). */
  spare: number;
  /** `${players}/${courts}`: used to remember a dismissal. */
  key: string;
};

/**
 * Spare players: Session players not removed and not Sitting out, minus 4 × Courts (Idle or Busy).
 * Negative when there are fewer than 4 players per Court.
 */
export function sparePlayers(session: Session): number {
  return countPlayers(session) - 4 * session.courts.length;
}

/** Session players not removed and not Sitting out. */
export function countPlayers(session: Session): number {
  return session.players.filter((player) => !player.removed && !player.sittingOut).length;
}

export function spareNotice(session: Session): SpareNotice | null {
  const courts = session.courts.length;
  if (courts === 0) return null;
  const players = countPlayers(session);
  const spare = players - 4 * courts;
  const limit = courts === 1 ? 1 : 2;
  if (spare < 0 || spare > limit) return null;
  return {
    kind: courts === 1 ? "one-court" : "courts",
    players,
    courts,
    spare,
    key: `${players}/${courts}`,
  };
}

export function spareNoticeText(notice: SpareNotice): string {
  const { players, courts, spare } = notice;
  if (notice.kind === "one-court") {
    const sits = spare === 0 ? "nobody sits out each match" : `only ${spare} sits out each match`;
    return `${players} players on 1 court: ${sits}, so players will often play several matches in a row. Add players to give everyone more rests.`;
  }
  const sits =
    spare === 0 ? "nobody sits out" : spare === 1 ? "only 1 sits out" : `only ${spare} sit out`;
  const fewer = courts - 1;
  return `${players} players on ${courts} courts: ${sits} while every court is playing, so players will often play several matches in a row and keep meeting the same people. Use ${fewer} ${fewer === 1 ? "court" : "courts"} or add players.`;
}
