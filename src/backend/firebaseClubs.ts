import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { creatorPlayer } from "../domain/clubChanges.ts";
import { newId } from "../domain/ids.ts";
import type { Account, Club, ClubPlayer, SkillLevel } from "../domain/types.ts";
import { normalizeName } from "../domain/validation.ts";
import { BackendError, browserOnline, type Unsubscribe } from "./backend.ts";
import type { SharedClubsApi } from "./simulatedClubs.ts";

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

  return {
    observeSharedClubs(listener) {
      let stopClubs: Unsubscribe = () => {};
      const stopAccount = deps.observeAccount((account) => {
        stopClubs();
        stopClubs = account ? watchClubs(account.accountId) : () => {};
        if (!account) listener([]);
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
          const ready: Club[] = [];
          for (const [id, club] of clubs) {
            if (club.players)
              ready.push({ id, name: club.name, kind: "shared", players: club.players });
          }
          listener(ready);
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
              const entry = { name, players: null as ClubPlayer[] | null, stop: () => {} };
              clubs.set(clubDoc.id, entry);
              entry.stop = onSnapshot(
                playersRef(clubDoc.id),
                (players) => {
                  entry.players = players.docs.map((row) => toClubPlayer(row.id, row.data()));
                  emit();
                },
                (error) => console.error("Club players listener failed", error),
              );
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
      await settle(batch.commit());
      return { id: input.id, name, kind: "shared", players };
    },

    async renameSharedClub(clubId, name) {
      const trimmed = normalizeName(name);
      if (trimmed === "") throw new BackendError("invalid-name");
      await settle(updateDoc(clubRef(clubId), { name: trimmed }));
    },

    async deleteSharedClub(clubId) {
      const batch = writeBatch(db);
      for (const row of (await getDocs(playersRef(clubId))).docs) batch.delete(row.ref);
      batch.delete(clubRef(clubId));
      await settle(batch.commit());
    },

    async addClubPlayer(clubId, player) {
      if (!browserOnline.get()) throw new BackendError("offline");
      await settle(setDoc(playerRef(clubId, player.id), toRecord(player)));
    },

    async updateClubPlayer(clubId, playerId, patch) {
      if (Object.keys(patch).length === 0) return;
      await settle(updateDoc(playerRef(clubId, playerId), { ...patch }));
    },

    async removeClubPlayer(clubId, playerId) {
      await settle(deleteDoc(playerRef(clubId, playerId)));
    },
  };
}

/**
 * Online, wait for the server so failures (e.g. Security Rules) reach the caller. Offline the
 * write waits in Firestore's queue and never settles until the connection is back, so don't wait.
 */
async function settle(write: Promise<unknown>): Promise<void> {
  if (browserOnline.get()) {
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
