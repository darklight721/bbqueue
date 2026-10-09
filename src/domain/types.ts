/** Shared domain types. Vocabulary per GLOSSARY.md; storage per ADR-0001/0002. */

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export const SKILL_LEVELS: readonly SkillLevel[] = ["beginner", "intermediate", "advanced"];

export const SKILL_VALUE: Record<SkillLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

export const SKILL_LABEL: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export const DEFAULT_SKILL: SkillLevel = "intermediate";

export type PointSystem = 21 | 31;

/** What an Account may do in a Shared club (GLOSSARY: Role). */
export type Role = "organizer" | "player";

/** A Club player's link to an Account. Only linked Club players have a Role. */
export interface AccountLink {
  accountId: string;
  role: Role;
}

export interface ClubPlayer {
  id: string;
  name: string;
  skill: SkillLevel;
  /** The Account this Club player is, with its Role in the Club; absent when not linked. */
  link?: AccountLink;
}

/** Local club: only on this device. Shared club: kept on the server (ADR-0006). */
export type ClubKind = "local" | "shared";

export interface Club {
  id: string;
  name: string;
  kind: ClubKind;
  players: ClubPlayer[];
}

export interface SessionPlayer {
  id: string;
  name: string;
  skill: SkillLevel;
  /** Link back to the Club player this was snapshotted from; null for Guests not saved to the Club. */
  clubPlayerId: string | null;
  /**
   * The Account the Club player was linked to when the Session started (ADR-0002: a snapshot,
   * later unlinking or relinking doesn't change it). Absent for Guests and unlinked Club players.
   */
  accountId?: string;
  sittingOut: boolean;
  /** Removed players stay in the Session for history lookups but are hidden from lists. */
  removed: boolean;
  /** Epoch ms. */
  joinedAt: number;
}

export type Team = [playerId: string, playerId: string];

export interface Lineup {
  teams: [Team, Team];
}

export interface Court {
  id: string;
  number: number;
  lineup: Lineup | null;
  activeMatchId: string | null;
}

export interface Match {
  id: string;
  /** 1-based sequence of Ended matches, assigned when the Match ends; null while active. */
  number: number | null;
  courtNumber: number;
  teams: [Team, Team];
  /** Free players not in this Match when it started (used for Streak / Rest). */
  freeAtStart: string[];
  startedAt: number;
  /** Session's Point system when the Match started (ADR-0004). */
  target: PointSystem;
  endedAt: number | null;
  /** null = ended without a Score (or still active). */
  score: [number, number] | null;
  status: "active" | "ended";
}

export type QueueSlot = string | null;

export interface Queue {
  id: string;
  slots: [[QueueSlot, QueueSlot], [QueueSlot, QueueSlot]];
}

export interface Session {
  id: string;
  name: string;
  clubId: string | null;
  /** The Club's name as it was at Start; null when the Session has no Club. */
  clubName: string | null;
  pointSystem: PointSystem;
  plannedHours: number;
  startedAt: number;
  players: SessionPlayer[];
  courts: Court[];
  matches: Match[];
  queues: Queue[];
  /** playerId → epoch ms of the last Streak reset caused by Sitting out. */
  streakResetAt: Record<string, number>;
  /**
   * Ids of the Players' requests (ADR-0007) that were applied to this copy, newest last, so a
   * request is applied once and only marked `applied` on the server once a copy that holds its id
   * has been uploaded. Absent until a request is applied.
   */
  appliedRequestIds?: string[];
}

/**
 * The Active session of a Shared club as the server has it (ADR-0007): the Session host's whole
 * copy of the Session, who the host is, and when the last upload reached the server.
 */
export interface ActiveSession {
  clubId: string;
  session: Session;
  /** The Account ID of the Session host: the Organizer who started the Session (or took it over). */
  hostAccountId: string;
  hostName: string;
  /** Epoch ms of the host's last upload, by the server's clock. */
  updatedAt: number;
}

/** What a Player may ask the Session host for, for their own Session player. */
export type SessionRequestKind = "sit-out" | "back-in" | "leave";

export type SessionRequestStatus = "pending" | "applied" | "skipped";

/**
 * A Player's request to the Session host (ADR-0007): to switch their own Sitting out on or off,
 * or to leave. It waits ("Waiting for host") until the host's device applies it or skips it.
 */
export interface SessionRequest {
  id: string;
  clubId: string;
  /** The Session the request was made in; a request for another Session is skipped. */
  sessionId: string;
  /** The requester's own Session player. */
  sessionPlayerId: string;
  /** The requester's Account ID: the host checks it against the Account copied onto the Session player. */
  accountId: string;
  kind: SessionRequestKind;
  status: SessionRequestStatus;
  /** Epoch ms by the server's clock; requests are applied in this order. */
  createdAt: number;
}

/** One row of an Ended session's Standings: a player who played at least one match, with their place. */
export interface StandingsEntry {
  place: number;
  /** The Session player's id within the Ended session. */
  playerId: string;
  /** The Club player this row is, or null (Guest, no Club, or an Ended session from before the id was kept). */
  clubPlayerId: string | null;
  name: string;
  skill: SkillLevel;
  wins: number;
  losses: number;
  played: number;
}

/** A Standings entry on the Top winners podium (place 3 or better, at least one win). */
export type TopWinner = StandingsEntry;

/** A Session player kept in an Ended session (ADR-0005). */
export interface EndedSessionPlayer {
  id: string;
  name: string;
  skill: SkillLevel;
  /**
   * The Club player this Session player was copied from; null for Guests not saved to the Club
   * and for Sessions with no Club. Ended sessions kept before this was added lack it and read as null.
   */
  clubPlayerId: string | null;
}

/** An Ended match kept in an Ended session (ADR-0005). */
export interface EndedSessionMatch {
  number: number;
  courtNumber: number;
  teams: [Team, Team];
  target: PointSystem;
  startedAt: number;
  endedAt: number;
  score: [number, number] | null;
}

/** A Session that was ended and kept, slimmed down for storage (ADR-0005). */
export interface EndedSession {
  /** The Session's id. */
  id: string;
  name: string;
  clubId: string | null;
  /** The Club's name as it was at Start; null when the Session had no Club. */
  clubName: string | null;
  /** Point system at the moment the Session ended. */
  pointSystem: PointSystem;
  startedAt: number;
  endedAt: number;
  /** Only Session players who played at least one Ended match. */
  players: EndedSessionPlayer[];
  /** Ended matches only, oldest first. */
  matches: EndedSessionMatch[];
}

export interface SessionSummary {
  sessionName: string;
  totalMatches: number;
  totalPlayers: number;
  /** Distinct Courts with at least one Ended match. */
  totalCourts: number;
  startedAt: number;
  endedAt: number;
  topWinners: TopWinner[];
}

/** A person's identity in the app (GLOSSARY: Account). Bound to the device it was created on. */
export interface Account {
  /** The short, readable, never-changing Account ID, e.g. `roy-7k3f`. */
  accountId: string;
  name: string;
}
