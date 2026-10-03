import {
  collection,
  deleteDoc,
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
import { creatorPlayer } from "../domain/clubChanges.ts";
import { newId } from "../domain/ids.ts";
import type { Account, Club, ClubPlayer, SkillLevel } from "../domain/types.ts";
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
      await settle(deps.online, deleteDoc(playerRef(clubId, playerId)));
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
      throw new BackendError("failed", undefined, { cause: error });
    }
    return;
  }
  write.catch((error: unknown) => console.error("Queued write failed", error));
}

function toRecord(player: ClubPlayer): DocumentData {
  return {
    name: player.name,
    skill: player.skill,
    ...(player.link ? { link: { accountId: player.link.accountId, role: player.link.role } } : {}),
  };
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
