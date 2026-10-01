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

export interface ClubPlayer {
  id: string;
  name: string;
  skill: SkillLevel;
}

export interface Club {
  id: string;
  name: string;
  players: ClubPlayer[];
}

export interface SessionPlayer {
  id: string;
  name: string;
  skill: SkillLevel;
  /** Link back to the Club player this was snapshotted from; null for Guests not saved to the Club. */
  clubPlayerId: string | null;
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
  pointSystem: PointSystem;
  plannedHours: number;
  startedAt: number;
  players: SessionPlayer[];
  courts: Court[];
  matches: Match[];
  queues: Queue[];
  /** playerId → epoch ms of the last Streak reset caused by Sitting out. */
  streakResetAt: Record<string, number>;
}

export interface TopWinner {
  place: number;
  name: string;
  skill: SkillLevel;
  wins: number;
  played: number;
}

export interface SessionSummary {
  sessionName: string;
  totalMatches: number;
  totalPlayers: number;
  startedAt: number;
  endedAt: number;
  topWinners: TopWinner[];
}
