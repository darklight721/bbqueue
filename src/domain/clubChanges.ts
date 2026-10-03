import { accountIdsEqual } from "./accountId.ts";
import { normalizeName } from "./validation.ts";
import {
  DEFAULT_SKILL,
  type Account,
  type AccountLink,
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
  | { type: "removePlayer"; playerId: string }
  /** Link a row to an Account (or link it to a different one). */
  | { type: "link"; playerId: string; link: AccountLink }
  | { type: "setRole"; playerId: string; role: Role }
  /** Unlink a row from its Account. The row stays; this is also how an Account leaves. */
  | { type: "unlink"; playerId: string };

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

function mapPlayer(club: Club, playerId: string, change: (player: ClubPlayer) => ClubPlayer): Club {
  return {
    ...club,
    players: club.players.map((player) => (player.id === playerId ? change(player) : player)),
  };
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
    case "link":
      return mapPlayer(club, change.playerId, (player) => ({ ...player, link: change.link }));
    case "setRole":
      return mapPlayer(club, change.playerId, (player) =>
        player.link ? { ...player, link: { ...player.link, role: change.role } } : player,
      );
    case "unlink":
      return mapPlayer(club, change.playerId, ({ link: _link, ...player }) => player);
  }
}

/** The changes that turn `before` into `after`: name, rows added, edited (changed fields only), linked, unlinked and removed. */
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
    if (player.link && !old.link) {
      changes.push({ type: "link", playerId: player.id, link: player.link });
    } else if (player.link && old.link) {
      if (!accountIdsEqual(player.link.accountId, old.link.accountId)) {
        changes.push({ type: "link", playerId: player.id, link: player.link });
      } else if (player.link.role !== old.link.role) {
        changes.push({ type: "setRole", playerId: player.id, role: player.link.role });
      }
    } else if (!player.link && old.link) {
      changes.push({ type: "unlink", playerId: player.id });
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

/**
 * `changes` in an order that keeps a Club's "at least one Organizer" rule true at every step:
 * making Organizers first, ordinary edits next, and demoting, unlinking or removing last. Without
 * this, handing the Club to someone else and stepping down in one Save would fail on the way.
 */
export function inSafeOrder(changes: readonly ClubChange[]): ClubChange[] {
  const rank = (change: ClubChange): number => {
    switch (change.type) {
      case "link":
        return change.link.role === "organizer" ? 0 : 1;
      case "addPlayer":
        return change.player.link?.role === "organizer" ? 0 : 1;
      case "setRole":
        return change.role === "organizer" ? 0 : 2;
      case "unlink":
      case "removePlayer":
        return 2;
      default:
        return 1;
    }
  };
  return changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => rank(a.change) - rank(b.change) || a.index - b.index)
    .map(({ change }) => change);
}
