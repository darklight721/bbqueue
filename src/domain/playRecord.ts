import { accountIdsEqual } from "./accountId.ts";
import { rankStandings } from "./engine/summary.ts";
import type { Club, EndedSession } from "./types.ts";

/** Fewest Ended matches together (with at least one scored) before a Partner can be the Best partner. */
export const BEST_PARTNER_MIN_TOGETHER = 3;

/** Wins ÷ (wins + losses); null when there is no win or loss (not 0%). Unscored matches don't count. */
export function winRate(wins: number, losses: number): number | null {
  return wins + losses === 0 ? null : wins / (wins + losses);
}

export interface PlayTotals {
  /** Ended matches played, scored or not. */
  played: number;
  wins: number;
  losses: number;
  winRate: number | null;
  /** Ended sessions with at least one Ended match for this person. */
  sessions: number;
}

/** One Ended session in a Play record. */
export interface PlaySessionEntry {
  sessionId: string;
  clubId: string;
  /** The Club's name as at Start; falls back to the Club's current name, then null. */
  clubName: string | null;
  startedAt: number;
  endedAt: number;
  wins: number;
  losses: number;
  played: number;
  winRate: number | null;
  /** Place in that Session's Standings (`rankStandings`). */
  place: number;
}

/** A Partner, identified by Club player row (never a Guest). */
export interface PlayPartner {
  clubId: string;
  clubPlayerId: string;
  name: string;
  /** Ended matches played together as Partners. */
  together: number;
  wins: number;
  losses: number;
  winRate: number | null;
}

export interface PlayRecord {
  /**
   * Current roster name, else the name from the most recent Ended session where they appear;
   * null when neither exists (unknown Club player). For an Account view: the first linked row's name.
   */
  name: string | null;
  totals: PlayTotals;
  /** Newest first (by `endedAt`). */
  sessions: PlaySessionEntry[];
  partners: {
    /** Most Ended matches together. */
    mostFrequent: PlayPartner | null;
    /** Highest Win rate with at least 3 matches together, one scored; null when none qualify. */
    best: PlayPartner | null;
  };
}

/** A Club player row a Play record is about. */
export interface PlayRecordTarget {
  clubId: string;
  clubPlayerId: string;
}

/** 0 or 1: the Team that won a scored match; null for unscored or level scores (as `rankStandings`). */
function winnerIndex(score: [number, number] | null): 0 | 1 | null {
  if (!score || score[0] === score[1]) return null;
  return score[0] > score[1] ? 0 : 1;
}

function rosterName(clubs: readonly Club[], target: PlayRecordTarget): string | null {
  const club = clubs.find((candidate) => candidate.id === target.clubId);
  return club?.players.find((player) => player.id === target.clubPlayerId)?.name ?? null;
}

interface PartnerAcc extends PlayPartner {
  /** `endedAt` of the Ended session `name` came from. */
  nameFrom: number;
}

function compute(
  endedSessions: readonly EndedSession[],
  clubs: readonly Club[],
  targets: readonly PlayRecordTarget[],
): PlayRecord {
  const ids = new Map<string, Set<string>>();
  for (const { clubId, clubPlayerId } of targets) {
    const set = ids.get(clubId) ?? new Set<string>();
    set.add(clubPlayerId);
    ids.set(clubId, set);
  }

  const sessions: PlaySessionEntry[] = [];
  const partners = new Map<string, PartnerAcc>();
  let latestName: { name: string; endedAt: number } | null = null;

  for (const ended of endedSessions) {
    const clubId = ended.clubId;
    const mine = clubId === null ? undefined : ids.get(clubId);
    if (clubId === null || !mine) continue;
    // Older records have no clubPlayerId: they add nothing.
    const myPlayers = ended.players.filter(
      (player) => player.clubPlayerId != null && mine.has(player.clubPlayerId),
    );
    if (myPlayers.length === 0) continue;
    const myIds = new Set(myPlayers.map((player) => player.id));
    const byId = new Map(ended.players.map((player) => [player.id, player]));

    let played = 0;
    let wins = 0;
    let losses = 0;
    for (const match of ended.matches) {
      const side = match.teams[0].some((id) => myIds.has(id))
        ? 0
        : match.teams[1].some((id) => myIds.has(id))
          ? 1
          : null;
      if (side === null) continue;
      played += 1;
      const winner = winnerIndex(match.score);
      const won = winner === side;
      const lost = winner !== null && winner !== side;
      if (won) wins += 1;
      if (lost) losses += 1;

      for (const partnerId of match.teams[side]) {
        if (myIds.has(partnerId)) continue;
        const partner = byId.get(partnerId);
        const partnerClubPlayerId = partner?.clubPlayerId ?? null;
        // Guests have no Play record; the same person's other row isn't a Partner.
        if (!partner || partnerClubPlayerId === null || mine.has(partnerClubPlayerId)) continue;
        const key = `${clubId}\u0000${partnerClubPlayerId}`;
        const acc = partners.get(key) ?? {
          clubId,
          clubPlayerId: partnerClubPlayerId,
          name: partner.name,
          together: 0,
          wins: 0,
          losses: 0,
          winRate: null,
          nameFrom: -Infinity,
        };
        acc.together += 1;
        if (won) acc.wins += 1;
        if (lost) acc.losses += 1;
        if (ended.endedAt >= acc.nameFrom) {
          acc.name = partner.name;
          acc.nameFrom = ended.endedAt;
        }
        partners.set(key, acc);
      }
    }
    if (played === 0) continue;

    const standing = rankStandings(ended).find((entry) => myIds.has(entry.playerId));
    const club = clubs.find((candidate) => candidate.id === clubId);
    sessions.push({
      sessionId: ended.id,
      clubId,
      clubName: ended.clubName ?? club?.name ?? null,
      startedAt: ended.startedAt,
      endedAt: ended.endedAt,
      wins,
      losses,
      played,
      winRate: winRate(wins, losses),
      place: standing?.place ?? 0,
    });
    if (!latestName || ended.endedAt >= latestName.endedAt) {
      latestName = { name: myPlayers[0]!.name, endedAt: ended.endedAt };
    }
  }

  sessions.sort((a, b) => b.endedAt - a.endedAt || a.sessionId.localeCompare(b.sessionId));

  const totals: PlayTotals = {
    played: sessions.reduce((sum, entry) => sum + entry.played, 0),
    wins: sessions.reduce((sum, entry) => sum + entry.wins, 0),
    losses: sessions.reduce((sum, entry) => sum + entry.losses, 0),
    winRate: null,
    sessions: sessions.length,
  };
  totals.winRate = winRate(totals.wins, totals.losses);

  // Current roster name wins over the name in an Ended session.
  const finished: PlayPartner[] = [...partners.values()].map(({ nameFrom: _from, ...partner }) => ({
    ...partner,
    name: rosterName(clubs, partner) ?? partner.name,
    winRate: winRate(partner.wins, partner.losses),
  }));
  const byName = (a: PlayPartner, b: PlayPartner) => a.name.localeCompare(b.name);
  const mostFrequent = [...finished].sort((a, b) => b.together - a.together || byName(a, b))[0];
  const best = finished
    .filter(
      (partner) =>
        partner.together >= BEST_PARTNER_MIN_TOGETHER &&
        partner.wins + partner.losses >= 1 &&
        partner.winRate !== null,
    )
    .sort((a, b) => b.winRate! - a.winRate! || b.together - a.together || byName(a, b))[0];

  const first = targets[0];
  return {
    name: (first && rosterName(clubs, first)) ?? latestName?.name ?? null,
    totals,
    sessions,
    partners: { mostFrequent: mostFrequent ?? null, best: best ?? null },
  };
}

/**
 * Club view: the Play record of one Club player, over the Ended sessions of that Club
 * (matched by `clubPlayerId`; older Ended sessions without it add nothing). `clubs` supplies the
 * current roster names. Only Ended matches count; unscored ones count as played only.
 */
export function clubPlayRecord(
  endedSessions: readonly EndedSession[],
  clubs: readonly Club[],
  clubId: string,
  clubPlayerId: string,
): PlayRecord {
  return compute(endedSessions, clubs, [{ clubId, clubPlayerId }]);
}

/** Club player rows, in every Club of `clubs`, currently linked to the Account (compared ignoring case). */
export function accountPlayRecordTargets(
  clubs: readonly Club[],
  accountId: string,
): PlayRecordTarget[] {
  return clubs.flatMap((club) =>
    club.players
      .filter((player) => player.link && accountIdsEqual(player.link.accountId, accountId))
      .map((player) => ({ clubId: club.id, clubPlayerId: player.id })),
  );
}

/**
 * Account view: the combined Club views of every Club player row currently linked to the Account.
 * Relinking a row moves its history with it. With no linked row the record is empty (`name` null).
 */
export function accountPlayRecord(
  endedSessions: readonly EndedSession[],
  clubs: readonly Club[],
  accountId: string,
): PlayRecord {
  return compute(endedSessions, clubs, accountPlayRecordTargets(clubs, accountId));
}
