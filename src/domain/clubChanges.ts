import { accountIdsEqual } from "./accountId.ts";
import { normalizeName } from "./validation.ts";
import {
  DEFAULT_SKILL,
  type Account,
  type Club,
  type ClubPlayer,
  type Role,
  type SkillLevel,
} from "./types.ts";

/**
 * One change to a Shared club. Each Club player row and the Club name are separate records on the
 * server, so each change touches one thing and the most recent change to a row wins.
 */
export type ClubChange =
  | { type: "rename"; name: string }
  | { type: "addPlayer"; player: ClubPlayer }
  | { type: "updatePlayer"; playerId: string; patch: ClubPlayerPatch }
  | { type: "removePlayer"; playerId: string };

export interface ClubPlayerPatch {
  name?: string;
  skill?: SkillLevel;
}

/** The Club player row a Shared club's creator starts with: the Account itself, as Organizer. */
export function creatorPlayer(account: Account, id: string): ClubPlayer {
  return {
    id,
    name: account.name,
    skill: DEFAULT_SKILL,
    link: { accountId: account.accountId, role: "organizer" },
  };
}

/** The Role `accountId` has in `club`, or null when no Club player is linked to it. */
export function roleInClub(club: Club, accountId: string): Role | null {
  const row = club.players.find(
    (player) => player.link && accountIdsEqual(player.link.accountId, accountId),
  );
  return row?.link?.role ?? null;
}

/** Apply one change. Changes to rows or Clubs that no longer exist are ignored. */
export function applyClubChange(club: Club, change: ClubChange): Club {
  switch (change.type) {
    case "rename":
      return { ...club, name: change.name };
    case "addPlayer":
      return club.players.some((player) => player.id === change.player.id)
        ? club
        : { ...club, players: [...club.players, change.player] };
    case "updatePlayer":
      return {
        ...club,
        players: club.players.map((player) =>
          player.id === change.playerId ? { ...player, ...change.patch } : player,
        ),
      };
    case "removePlayer":
      return { ...club, players: club.players.filter((player) => player.id !== change.playerId) };
  }
}

/** The changes that turn `before` into `after`: name, rows added, edited (changed fields only) and removed. */
export function diffClub(before: Club, after: Club): ClubChange[] {
  const changes: ClubChange[] = [];
  if (normalizeName(before.name) !== normalizeName(after.name)) {
    changes.push({ type: "rename", name: normalizeName(after.name) });
  }
  const beforeById = new Map(before.players.map((player) => [player.id, player]));
  const afterIds = new Set(after.players.map((player) => player.id));
  for (const player of before.players) {
    if (!afterIds.has(player.id)) changes.push({ type: "removePlayer", playerId: player.id });
  }
  for (const player of after.players) {
    const old = beforeById.get(player.id);
    if (!old) {
      changes.push({ type: "addPlayer", player });
      continue;
    }
    const patch: ClubPlayerPatch = {};
    if (normalizeName(old.name) !== normalizeName(player.name)) {
      patch.name = normalizeName(player.name);
    }
    if (old.skill !== player.skill) patch.skill = player.skill;
    if (Object.keys(patch).length > 0) {
      changes.push({ type: "updatePlayer", playerId: player.id, patch });
    }
  }
  return changes;
}
