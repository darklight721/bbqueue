import { accountIdsEqual } from "../domain/accountId.ts";
import { applyClubChange, roleInClub } from "../domain/clubChanges.ts";
import { joinNameKey, newJoinToken } from "../domain/joinLink.ts";
import type { Account, Club } from "../domain/types.ts";
import { BackendError, type JoinLinksApi, type OnlineSource } from "./backend.ts";
import type { SimulatedClubsState } from "./simulatedClubs.ts";

/**
 * Join links without a server (ADR-0010). The "server" keeps a Club's current token on the Club
 * itself (`joinToken`), and a name is found straight from its rows: the Firebase version's Join
 * record and hashed name index are derived from the same data, so there is nothing to keep in step.
 */
export function createSimulatedJoinLinks(
  state: SimulatedClubsState,
  getAccount: () => Account | null,
  online: OnlineSource,
  /** The "server" changed: tell this device's observers and the other devices. */
  changed: () => void,
): JoinLinksApi {
  function requireOnline() {
    if (!online.get()) throw new BackendError("offline");
  }

  /** The Club as an Organizer of it sees it, or `not-found` / `forbidden`. */
  function organizersClub(clubId: string): Club {
    const account = getAccount();
    const club = state.loadClubs().find((candidate) => candidate.id === clubId);
    const role = club && account ? roleInClub(club, account.accountId) : null;
    if (!club || !role) throw new BackendError("not-found");
    if (role !== "organizer") throw new BackendError("forbidden");
    return club;
  }

  function setToken(clubId: string, joinToken: string) {
    state.saveClubs(
      state.loadClubs().map((club) => (club.id === clubId ? { ...club, joinToken } : club)),
    );
    changed();
  }

  /** The Club whose current Join link this is, or null. */
  function clubOf(token: string): Club | null {
    return state.loadClubs().find((club) => club.joinToken === token) ?? null;
  }

  const byName = (club: Club, name: string) =>
    club.players.find((player) => joinNameKey(player.name) === joinNameKey(name)) ?? null;

  /** Runs `body`, turning what it throws into a rejection. */
  async function run<T>(body: () => T): Promise<T> {
    return body();
  }

  return {
    getJoinLink: (clubId) =>
      run(() => {
        const club = organizersClub(clubId);
        if (club.joinToken) return club.joinToken;
        requireOnline();
        const token = newJoinToken();
        setToken(clubId, token);
        return token;
      }),

    resetJoinLink: (clubId) =>
      run(() => {
        requireOnline();
        organizersClub(clubId);
        const token = newJoinToken();
        setToken(clubId, token);
        return token;
      }),

    getJoinLinkInfo: (token) =>
      run(() => {
        requireOnline();
        const club = clubOf(token);
        return club ? { clubId: club.id, clubName: club.name } : null;
      }),

    findJoinLinkName: (token, name) =>
      run(() => {
        requireOnline();
        const club = clubOf(token);
        const player = club && byName(club, name);
        return player ? { playerId: player.id, linked: !!player.link } : null;
      }),

    claimClubPlayer: (token, name) =>
      run(() => {
        const account = getAccount();
        if (!account) throw new BackendError("no-account");
        requireOnline();
        const club = clubOf(token);
        if (!club) throw new BackendError("not-found");
        if (
          club.players.some((p) => p.link && accountIdsEqual(p.link.accountId, account.accountId))
        ) {
          throw new BackendError("already-linked");
        }
        const player = byName(club, name);
        if (!player) throw new BackendError("not-found");
        if (player.link) throw new BackendError("already-claimed");
        const claimed = applyClubChange(club, {
          type: "link",
          playerId: player.id,
          link: { accountId: account.accountId, role: "player" },
        });
        state.saveClubs(state.loadClubs().map((other) => (other.id === club.id ? claimed : other)));
        changed();
        return { clubId: club.id };
      }),
  };
}
