import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase/firestore";
import { creatorPlayer, type ClubChange } from "../domain/clubChanges.ts";
import { clubChangeProblem, ownRow } from "../domain/permissions.ts";
import { newId } from "../domain/ids.ts";
import type { Account, AccountLink, Club, ClubPlayer, Role, SkillLevel } from "../domain/types.ts";
import { normalizeName } from "../domain/validation.ts";
import { BackendError, type OnlineSource, type Unsubscribe } from "./backend.ts";
import type { SharedClubsApi } from "./simulatedClubs.ts";

const MAX_LISTEN_RETRIES = 6;

/**
 * Shared clubs on Firestore:
 * - `clubs/{clubId}`: `{ name, memberAccountIds, organizerAccountIds, createdAt }`. The two arrays
 *   are an index derived from the rows' links, so an Account can list its Clubs (array-contains)
 *   and Security Rules can tell who may read and write. They are kept in step with the rows.
 * - `clubs/{clubId}/players/{clubPlayerId}`: `{ name, skill, link?: { accountId, role } }`. One
 *   record per Club player, so the most recent change to a row wins.
 *
 * Writes go through Firestore's offline queue: they show up in listeners at once and sync later.
 */
export function createFirebaseClubs(
  db: Firestore,
  deps: {
    online: OnlineSource;
    getAccount(): Promise<Account | null>;
    observeAccount(listener: (account: Account | null) => void): Unsubscribe;
  },
): SharedClubsApi {
  const clubRef = (clubId: string) => doc(db, "clubs", clubId);
  const playersRef = (clubId: string) => collection(db, "clubs", clubId, "players");
  const playerRef = (clubId: string, playerId: string) =>
    doc(db, "clubs", clubId, "players", playerId);

  async function requireAccount(): Promise<Account> {
    const account = await deps.getAccount();
    if (!account) throw new BackendError("no-account");
    return account;
  }

  /** Fails with `not-found` when the Club is known not to exist. Unknown (offline, uncached) passes. */
  async function requireClub(clubId: string): Promise<void> {
    // Offline there is nothing to check against: the write waits in the queue, and the
    // server has the last word. (Reading the cache here can stall in some browsers.)
    if (!deps.online.get()) return;
    let snapshot: DocumentSnapshot;
    try {
      snapshot = await getDoc(clubRef(clubId));
    } catch {
      try {
        snapshot = await getDocFromCache(clubRef(clubId));
      } catch {
        return;
      }
    }
    if (!snapshot.exists()) throw new BackendError("not-found");
  }

  /** The Club and its rows as the server has them (or the cache, offline). */
  async function loadClub(clubId: string): Promise<Club> {
    try {
      const [club, rows] = await Promise.all([
        getDoc(clubRef(clubId)),
        getDocs(playersRef(clubId)),
      ]);
      if (!club.exists()) throw new BackendError("not-found");
      return {
        id: clubId,
        name: String(club.data().name ?? ""),
        kind: "shared",
        players: rows.docs.map((row) => toClubPlayer(row.id, row.data())),
      };
    } catch (error) {
      // A Club you can't read is, as far as you can tell, not there.
      const mapped = toBackendError(error);
      throw mapped.code === "forbidden"
        ? new BackendError("not-found", undefined, { cause: error })
        : mapped;
    }
  }

  /**
   * Make one change that touches who is linked to the Club: the row and the Club's member and
   * Organizer lists go out in one batch, so they never disagree. Checks the rules of the domain
   * first for a plain message; Security Rules check the same on the server.
   */
  async function changeLinks(clubId: string, change: ClubChange): Promise<void> {
    if (!deps.online.get()) throw new BackendError("offline");
    const viewer = await requireAccount();
    const club = await loadClub(clubId);
    const problem = clubChangeProblem(club, viewer.accountId, change);
    if (problem) throw new BackendError(problem);

    const batch = writeBatch(db);
    const lists = (accountId: string, role: Role | null) => ({
      memberAccountIds: role
        ? arrayUnion(accountId.toLowerCase())
        : arrayRemove(accountId.toLowerCase()),
      organizerAccountIds:
        role === "organizer"
          ? arrayUnion(accountId.toLowerCase())
          : arrayRemove(accountId.toLowerCase()),
    });
    const existing = (playerId: string) => club.players.find((player) => player.id === playerId);

    switch (change.type) {
      case "addPlayer":
        batch.set(playerRef(clubId, change.player.id), toRecord(change.player));
        if (change.player.link) {
          batch.update(
            clubRef(clubId),
            lists(change.player.link.accountId, change.player.link.role),
          );
        }
        break;
      case "link": {
        const old = existing(change.playerId)?.link;
        if (old && old.accountId.toLowerCase() !== change.link.accountId.toLowerCase()) {
          batch.update(clubRef(clubId), lists(old.accountId, null));
        }
        batch.update(playerRef(clubId, change.playerId), { link: toLink(change.link) });
        batch.update(clubRef(clubId), lists(change.link.accountId, change.link.role));
        break;
      }
      case "setRole": {
        const link = existing(change.playerId)?.link;
        if (!link) throw new BackendError("not-found");
        batch.update(playerRef(clubId, change.playerId), { "link.role": change.role });
        batch.update(clubRef(clubId), lists(link.accountId, change.role));
        break;
      }
      case "unlink": {
        const link = existing(change.playerId)?.link;
        if (!link) return;
        batch.update(playerRef(clubId, change.playerId), { link: deleteField() });
        batch.update(clubRef(clubId), lists(link.accountId, null));
        break;
      }
      case "removePlayer": {
        const link = existing(change.playerId)?.link;
        batch.delete(playerRef(clubId, change.playerId));
        if (link) batch.update(clubRef(clubId), lists(link.accountId, null));
        break;
      }
      default:
        throw new Error(`Not a link change: ${change.type}`);
    }
    await settle(deps.online, batch.commit());
  }

  /** The Account's own spelling of its ID, or `unknown-account`. */
  async function knownAccountId(accountId: string): Promise<string> {
    const account = await lookup(accountId);
    if (!account) throw new BackendError("unknown-account");
    return account.accountId;
  }

  async function lookup(accountId: string): Promise<Account | null> {
    if (!deps.online.get()) throw new BackendError("offline");
    try {
      const reservation = await getDoc(doc(db, "accountIds", accountId.trim().toLowerCase()));
      if (!reservation.exists()) return null;
      const account = (await getDoc(doc(db, "accounts", String(reservation.data().uid)))).data();
      if (!account || typeof account.accountId !== "string" || typeof account.name !== "string") {
        return null;
      }
      return { accountId: account.accountId, name: account.name };
    } catch (error) {
      throw toBackendError(error);
    }
  }

  return {
    observeSharedClubs(listener) {
      let stopClubs: Unsubscribe = () => {};
      let watching: string | null | undefined;
      const stopAccount = deps.observeAccount((account) => {
        // The Account record changes now and then (its name); that's no reason to start over.
        const accountId = account?.accountId.toLowerCase() ?? null;
        if (accountId === watching) return;
        watching = accountId;
        stopClubs();
        stopClubs = accountId ? watchClubs(accountId) : () => {};
        if (!accountId) listener([]);
      });

      function watchClubs(accountId: string): Unsubscribe {
        const members = query(
          collection(db, "clubs"),
          where("memberAccountIds", "array-contains", accountId.toLowerCase()),
        );
        const clubs = new Map<
          string,
          { name: string; players: ClubPlayer[] | null; stop: Unsubscribe }
        >();

        function emit() {
          // Report only once every Club's rows are in, or a half-loaded list would look like
          // "my Clubs are gone" (and wipe the copy cached on the device).
          for (const club of clubs.values()) if (!club.players) return;
          const ready: Club[] = [];
          for (const [id, club] of clubs) {
            if (club.players)
              ready.push({ id, name: club.name, kind: "shared", players: club.players });
          }
          listener(ready);
        }

        /**
         * Watch one Club's rows. A Club that was just created is on this device before it is on the
         * server, and the server refuses to list the rows of a Club it doesn't know yet, so a
         * refused listener is tried again shortly instead of giving up.
         */
        function watchPlayers(
          clubId: string,
          entry: { players: ClubPlayer[] | null; stop: Unsubscribe },
          attempt: number,
        ) {
          let retry: ReturnType<typeof setTimeout> | undefined;
          const stop = onSnapshot(
            playersRef(clubId),
            (players) => {
              entry.players = players.docs.map((row) => toClubPlayer(row.id, row.data()));
              emit();
            },
            (error) => {
              if (clubs.get(clubId) !== entry || attempt >= MAX_LISTEN_RETRIES) {
                console.error("Club players listener failed", error);
                // Don't hold up the rest of the list for one Club that won't load.
                if (clubs.get(clubId) === entry) {
                  clubs.delete(clubId);
                  emit();
                }
                return;
              }
              retry = setTimeout(
                () => watchPlayers(clubId, entry, attempt + 1),
                250 * (attempt + 1),
              );
            },
          );
          entry.stop = () => {
            clearTimeout(retry);
            stop();
          };
        }

        const stopMembers = onSnapshot(
          members,
          (snapshot) => {
            const seen = new Set<string>();
            for (const clubDoc of snapshot.docs) {
              seen.add(clubDoc.id);
              const name = String(clubDoc.data().name ?? "");
              const known = clubs.get(clubDoc.id);
              if (known) {
                known.name = name;
                continue;
              }
              const entry = {
                name,
                players: null as ClubPlayer[] | null,
                stop: () => {},
              };
              clubs.set(clubDoc.id, entry);
              watchPlayers(clubDoc.id, entry, 0);
            }

            for (const [id, club] of clubs) {
              if (seen.has(id)) continue;
              club.stop();
              clubs.delete(id);
            }
            emit();
          },
          (error) => console.error("Clubs listener failed", error),
        );

        return () => {
          stopMembers();
          for (const club of clubs.values()) club.stop();
          clubs.clear();
        };
      }

      return () => {
        stopAccount();
        stopClubs();
      };
    },

    async createSharedClub(input) {
      const account = await requireAccount();
      const name = normalizeName(input.name);
      if (name === "") throw new BackendError("invalid-name");
      const players = [creatorPlayer(account, newId()), ...input.players];
      const accountId = account.accountId.toLowerCase();

      const batch = writeBatch(db);
      batch.set(clubRef(input.id), {
        name,
        memberAccountIds: [accountId],
        organizerAccountIds: [accountId],
        createdAt: serverTimestamp(),
      });
      for (const player of players) batch.set(playerRef(input.id, player.id), toRecord(player));
      await settle(deps.online, batch.commit());
      return { id: input.id, name, kind: "shared", players };
    },

    async renameSharedClub(clubId, name) {
      const trimmed = normalizeName(name);
      if (trimmed === "") throw new BackendError("invalid-name");
      await requireClub(clubId);
      await settle(deps.online, updateDoc(clubRef(clubId), { name: trimmed }));
    },

    async deleteSharedClub(clubId) {
      await requireClub(clubId);
      const batch = writeBatch(db);
      for (const row of (await getDocs(playersRef(clubId))).docs) batch.delete(row.ref);
      batch.delete(clubRef(clubId));
      await settle(deps.online, batch.commit());
    },

    async addClubPlayer(clubId, player) {
      if (!deps.online.get()) throw new BackendError("offline");
      if (player.link) {
        const accountId = await knownAccountId(player.link.accountId);
        await changeLinks(clubId, {
          type: "addPlayer",
          player: { ...player, link: { ...player.link, accountId } },
        });
        return;
      }
      await requireClub(clubId);
      await settle(deps.online, setDoc(playerRef(clubId, player.id), toRecord(player)));
    },

    async updateClubPlayer(clubId, playerId, patch) {
      if (Object.keys(patch).length === 0) return;
      await requireClub(clubId);
      await settle(deps.online, updateDoc(playerRef(clubId, playerId), { ...patch }));
    },

    async removeClubPlayer(clubId, playerId) {
      await requireClub(clubId);
      let linked = false;
      try {
        linked = !!toClubPlayer(playerId, (await getDoc(playerRef(clubId, playerId))).data() ?? {})
          .link;
      } catch {
        // Offline with nothing cached: an unlinked row is the usual case.
      }
      // A linked row also changes who is on the Club, which needs the connection and a check.
      if (linked) return changeLinks(clubId, { type: "removePlayer", playerId });
      await settle(deps.online, deleteDoc(playerRef(clubId, playerId)));
    },

    lookupAccount: lookup,

    async linkClubPlayer(clubId, playerId, accountId, role) {
      if (!deps.online.get()) throw new BackendError("offline");
      const known = await knownAccountId(accountId);
      await changeLinks(clubId, { type: "link", playerId, link: { accountId: known, role } });
    },

    setClubPlayerRole: (clubId, playerId, role) =>
      changeLinks(clubId, { type: "setRole", playerId, role }),

    unlinkClubPlayer: (clubId, playerId) => changeLinks(clubId, { type: "unlink", playerId }),

    async leaveClub(clubId) {
      if (!deps.online.get()) throw new BackendError("offline");
      const viewer = await requireAccount();
      const row = ownRow(await loadClub(clubId), viewer.accountId);
      if (!row) throw new BackendError("not-found");
      await changeLinks(clubId, { type: "unlink", playerId: row.id });
    },
  };
}

/**
 * Online, wait for the server so failures (e.g. Security Rules) reach the caller. Offline the
 * write waits in Firestore's queue and never settles until the connection is back, so don't wait.
 */
async function settle(online: OnlineSource, write: Promise<unknown>): Promise<void> {
  if (online.get()) {
    try {
      await write;
    } catch (error) {
      throw toBackendError(error);
    }
    return;
  }
  write.catch((error: unknown) => console.error("Queued write failed", error));
}

const toLink = (link: AccountLink) => ({ accountId: link.accountId, role: link.role });

function toRecord(player: ClubPlayer): DocumentData {
  return {
    name: player.name,
    skill: player.skill,
    ...(player.link ? { link: toLink(player.link) } : {}),
  };
}

/** Firestore errors in the Backend's words. */
function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "permission-denied")
    return new BackendError("forbidden", undefined, { cause: error });
  if (code === "not-found") return new BackendError("not-found", undefined, { cause: error });
  if (code === "unavailable") return new BackendError("offline", undefined, { cause: error });
  return new BackendError("failed", undefined, { cause: error });
}

function toClubPlayer(id: string, data: DocumentData): ClubPlayer {
  const link = data.link as { accountId?: unknown; role?: unknown } | undefined;
  const player: ClubPlayer = {
    id,
    name: String(data.name ?? ""),
    skill: (data.skill as SkillLevel) ?? "intermediate",
  };
  if (
    link &&
    typeof link.accountId === "string" &&
    (link.role === "organizer" || link.role === "player")
  ) {
    player.link = { accountId: link.accountId, role: link.role };
  }
  return player;
}
