import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import { accountIdsEqual, normalizeAccountId } from "../domain/accountId.ts";
import type { ClubChange } from "../domain/clubChanges.ts";
import { clubChangeProblem, ownRow } from "../domain/permissions.ts";
import {
  SKILL_LEVELS,
  type Account,
  type Club,
  type ClubPlayer,
  type Role,
  type SkillLevel,
} from "../domain/types.ts";
import {
  BackendError,
  requireValidName,
  type SharedClubsApi,
  type Unsubscribe,
} from "./backend.ts";
import {
  CACHE_TIMEOUT_MS,
  requireViewer as requireViewerOf,
  retryDelay,
  settle,
  stringList,
  toBackendError,
  toLink,
  toRecord,
  withTimeout,
  type FirebaseDeps,
} from "./firebaseShared.ts";
import { planNewSharedClub } from "./newSharedClub.ts";

/**
 * Shared clubs on Firestore:
 * - `clubs/{clubId}`: `{ name, memberUids, organizerUids, createdAt }`. The two arrays hold the
 * Firebase uids of the linked Accounts and are an index derived from the rows' links, so an
 * Account can list its Clubs (array-contains) and Security Rules can tell who may read and
 * write. They are kept in step with the rows.
 * - `clubs/{clubId}/players/{clubPlayerId}`: `{ name, skill, link?: { accountId, uid, role } }`.
 * One record per Club player, so the most recent change to a row wins. The Account ID is for
 * display and lookup; the uid is the identity, and the rules check that it owns that Account ID.
 *
 * Writes go through Firestore's offline queue: they show up in listeners at once and sync later.
 */
export function createFirebaseClubs(
  db: Firestore,
  deps: FirebaseDeps,
): SharedClubsApi & {
  /** The Club steps of deleting an Account; see `Backend.deleteAccount`. */
  deleteAccountClubs(input: { deleteClubIds: string[]; unlinkClubIds: string[] }): Promise<void>;
} {
  const clubRef = (clubId: string) => doc(db, "clubs", clubId);
  const playersRef = (clubId: string) => collection(db, "clubs", clubId, "players");
  const playerRef = (clubId: string, playerId: string) =>
    doc(db, "clubs", clubId, "players", playerId);

  const requireViewer = () => requireViewerOf(deps);

  /** A record from the server, or from the cache when it can't be reached; null when neither answers. */
  async function readDoc(ref: DocumentReference): Promise<DocumentSnapshot | null> {
    if (deps.online.get()) {
      try {
        return await getDoc(ref);
      } catch {
        // Fall back to the cache.
      }
    }
    try {
      // Reading the cache can stall in some browsers, so don't wait for it for long.
      return await withTimeout(getDocFromCache(ref), CACHE_TIMEOUT_MS);
    } catch {
      return null;
    }
  }

  /** Fails with `not-found` when the Club is known not to exist. Unknown (offline, uncached) passes. */
  async function requireClub(clubId: string): Promise<void> {
    // Offline there is nothing to check against: the write waits in the queue, and the
    // server has the last word.
    if (!deps.online.get()) return;
    const snapshot = await readDoc(clubRef(clubId));
    if (snapshot && !snapshot.exists()) throw new BackendError("not-found");
  }

  /** The Club and its rows as the server has them (or the cache, offline), with who is behind each link. */
  async function loadClub(clubId: string): Promise<LoadedClub> {
    try {
      const [club, rows] = await Promise.all([
        getDoc(clubRef(clubId)),
        getDocs(playersRef(clubId)),
      ]);
      if (!club.exists()) throw new BackendError("not-found");
      const linkUids = new Map<string, string>();
      for (const row of rows.docs) {
        const uid = (row.data().link as { uid?: unknown } | undefined)?.uid;
        if (typeof uid === "string") linkUids.set(row.id, uid);
      }
      return {
        club: {
          id: clubId,
          name: String(club.data().name ?? ""),
          kind: "shared",
          players: rows.docs.map((row) => toClubPlayer(row.id, row.data())),
        },
        linkUids,
        memberUids: stringList(club.data().memberUids),
        organizerUids: stringList(club.data().organizerUids),
      };
    } catch (error) {
      // A Club you can't read is, as far as you can tell, not there.
      const mapped = toBackendError(error);
      throw mapped.code === "forbidden"
        ? new BackendError("not-found", undefined, { cause: error })
        : mapped;
    }
  }

  const lists = (uid: string, role: Role | null) => ({
    memberUids: role ? arrayUnion(uid) : arrayRemove(uid),
    organizerUids: role === "organizer" ? arrayUnion(uid) : arrayRemove(uid),
  });

  /**
   * Make one change that touches who is linked to the Club: the row and the Club's member and
   * Organizer lists go out in one batch, so they never disagree. Checks the rules of the domain
   * first for a plain message; Security Rules check the same on the server. `linkUid` is the uid
   * of the Account a new link points at (for `addPlayer` and `link`).
   */
  async function changeLinks(clubId: string, change: ClubChange, linkUid?: string): Promise<void> {
    if (!deps.online.get()) throw new BackendError("offline");
    const { account: viewer } = await requireViewer();
    const { club, linkUids } = await loadClub(clubId);
    const problem = clubChangeProblem(club, viewer.accountId, change);
    if (problem) throw new BackendError(problem);

    const batch = writeBatch(db);
    const existing = (playerId: string) => club.players.find((player) => player.id === playerId);

    switch (change.type) {
      case "addPlayer":
        batch.set(playerRef(clubId, change.player.id), toRecord(change.player, linkUid));
        if (change.player.link) {
          if (!linkUid) throw new BackendError("failed");
          batch.update(clubRef(clubId), lists(linkUid, change.player.link.role));
        }
        break;
      case "link": {
        if (!linkUid) throw new BackendError("failed");
        const oldUid = existing(change.playerId)?.link ? linkUids.get(change.playerId) : undefined;
        if (oldUid && oldUid !== linkUid) batch.update(clubRef(clubId), lists(oldUid, null));
        batch.update(playerRef(clubId, change.playerId), {
          link: toLink(change.link, linkUid),
        });
        batch.update(clubRef(clubId), lists(linkUid, change.link.role));
        break;
      }
      case "setRole": {
        const uid = linkUids.get(change.playerId);
        if (!existing(change.playerId)?.link || !uid) throw new BackendError("not-found");
        batch.update(playerRef(clubId, change.playerId), { "link.role": change.role });
        batch.update(clubRef(clubId), lists(uid, change.role));
        break;
      }
      case "unlink": {
        const uid = linkUids.get(change.playerId);
        if (!existing(change.playerId)?.link || !uid) return;
        batch.update(playerRef(clubId, change.playerId), { link: deleteField() });
        batch.update(clubRef(clubId), lists(uid, null));
        break;
      }
      case "removePlayer": {
        const uid = linkUids.get(change.playerId);
        batch.delete(playerRef(clubId, change.playerId));
        if (existing(change.playerId)?.link && uid) batch.update(clubRef(clubId), lists(uid, null));
        break;
      }
      default:
        throw new Error(`Not a link change: ${change.type}`);
    }
    await settle(deps.online, batch.commit());
  }

  /**
   * The Account with this Account ID and the uid that owns it, or null. The Account found must
   * have exactly the Account ID that was typed (any capitalisation), so a reservation that points
   * at a different Account never counts.
   */
  async function findAccount(accountId: string): Promise<{ account: Account; uid: string } | null> {
    if (!deps.online.get()) throw new BackendError("offline");
    const wanted = normalizeAccountId(accountId);
    try {
      const reservation = await getDoc(doc(db, "accountIds", wanted));
      const uid = reservation.data()?.uid;
      if (typeof uid !== "string") return null;
      const account = (await getDoc(doc(db, "accounts", uid))).data();
      if (!account || typeof account.accountId !== "string" || typeof account.name !== "string") {
        return null;
      }
      if (normalizeAccountId(account.accountId) !== wanted) return null;
      return { account: { accountId: account.accountId, name: account.name }, uid };
    } catch (error) {
      throw toBackendError(error);
    }
  }

  async function knownAccount(accountId: string): Promise<{ account: Account; uid: string }> {
    const found = await findAccount(accountId);
    if (!found) throw new BackendError("unknown-account");
    return found;
  }

  const api: SharedClubsApi = {
    observeSharedClubs(listener) {
      let stopClubs: Unsubscribe = () => {};
      let watching: string | null | undefined;
      const stopAccount = deps.observeAccount((account) => {
        // The Account record changes now and then (its name); that's no reason to start over.
        const uid = account ? deps.currentUid() : null;
        if (uid === watching) return;
        watching = uid;
        stopClubs();
        stopClubs = uid ? watchClubs(uid) : () => {};
        if (!uid) listener([]);
      });

      function watchClubs(uid: string): Unsubscribe {
        const members = query(collection(db, "clubs"), where("memberUids", "array-contains", uid));
        interface Entry {
          name: string;
          /** The Club's rows as last heard; null until they have loaded once. */
          players: ClubPlayer[] | null;
          /** The Club's own record has a change that the server hasn't confirmed yet. */
          pending: boolean;
          stop: Unsubscribe;
          /** Try the rows listener again now, if it is waiting to. */
          retryNow: () => void;
        }
        const clubs = new Map<string, Entry>();
        let stopped = false;
        let reported = false;

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

        /** Whether the server says this Club isn't mine (any more): it is gone or I was taken off it. */
        async function clubIsGone(clubId: string): Promise<boolean> {
          if (!deps.online.get()) return false;
          try {
            return !(await getDocFromServer(clubRef(clubId))).exists();
          } catch (error) {
            return (error as { code?: unknown } | null)?.code === "permission-denied";
          }
        }

        /**
         * Watch one Club's rows. A Club that was just created is on this device before it is on the
         * server, and the server refuses to list the rows of a Club it doesn't know yet. That ends
         * the listener, and nothing wakes it again when the Club's write lands, so a refused
         * listener is tried again, with growing pauses (and at once when the Club's own record is
         * confirmed), for as long as the Club is on the list. Until it works the Club keeps the
         * rows it last had and is never dropped from the list.
         *
         * Only a Club the server has confirmed and still refuses is dropped: that is how this
         * device hears that an Organizer took the Account off the Club, which the Clubs listener
         * doesn't report.
         */
        function watchPlayers(clubId: string, entry: Entry) {
          let attempt = 0;
          let retry: ReturnType<typeof setTimeout> | undefined;
          let waiting = false;
          let stopSnapshot: Unsubscribe = () => {};
          const listen = () => {
            clearTimeout(retry);
            waiting = false;
            stopSnapshot = onSnapshot(
              playersRef(clubId),
              (players) => {
                attempt = 0;
                entry.players = players.docs.map((row) => toClubPlayer(row.id, row.data()));
                emit();
              },
              (error) => {
                if (clubs.get(clubId) !== entry) return;
                void (async () => {
                  if (!entry.pending && (await clubIsGone(clubId))) {
                    if (clubs.get(clubId) !== entry) return;
                    entry.stop();
                    clubs.delete(clubId);
                    emit();
                    return;
                  }
                  if (clubs.get(clubId) !== entry) return;
                  console.warn("Club players listener failed, trying again", error);
                  waiting = true;
                  retry = setTimeout(listen, retryDelay(attempt++));
                })();
              },
            );
          };
          entry.stop = () => {
            clearTimeout(retry);
            stopSnapshot();
          };
          entry.retryNow = () => {
            if (waiting) listen();
          };
          listen();
        }

        function handleMembers(snapshot: QuerySnapshot) {
          let changed = false;
          const seen = new Set<string>();
          for (const clubDoc of snapshot.docs) {
            seen.add(clubDoc.id);
            const name = String(clubDoc.data().name ?? "");
            const pending = clubDoc.metadata.hasPendingWrites;
            const known = clubs.get(clubDoc.id);
            if (known) {
              if (known.name !== name) changed = true;
              known.name = name;
              const confirmed = known.pending && !pending;
              known.pending = pending;
              if (confirmed) known.retryNow();
              continue;
            }
            const entry: Entry = {
              name,
              players: null,
              pending,
              stop: () => {},
              retryNow: () => {},
            };
            clubs.set(clubDoc.id, entry);
            watchPlayers(clubDoc.id, entry);
            changed = true;
          }

          for (const [id, club] of clubs) {
            if (seen.has(id)) continue;
            club.stop();
            clubs.delete(id);
            changed = true;
          }
          if (changed || !reported) {
            reported = true;
            emit();
          }
        }

        // The Clubs listener ends when it fails, so it is started again with growing pauses. It
        // also hears about metadata changes, to learn when a new Club's write reaches the server.
        let membersAttempt = 0;
        let membersRetry: ReturnType<typeof setTimeout> | undefined;
        let stopMembers: Unsubscribe = () => {};
        const listenMembers = () => {
          stopMembers = onSnapshot(
            members,
            { includeMetadataChanges: true },
            (snapshot) => {
              membersAttempt = 0;
              handleMembers(snapshot);
            },
            (error) => {
              if (stopped) return;
              console.warn("Clubs listener failed, trying again", error);
              membersRetry = setTimeout(listenMembers, retryDelay(membersAttempt++));
            },
          );
        };
        listenMembers();

        return () => {
          stopped = true;
          clearTimeout(membersRetry);
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
      const { account, uid } = await requireViewer();
      const name = requireValidName(input.name);
      const planned = planNewSharedClub(account, input.players);

      // Resolve every Account the roster links to its uid first, so nothing is written when one
      // is unknown. The creator's own row is theirs already.
      const players: ClubPlayer[] = [];
      const linkUids = new Map<string, string>();
      for (const player of planned) {
        if (!player.link) {
          players.push(player);
        } else if (accountIdsEqual(player.link.accountId, account.accountId)) {
          players.push(player);
          linkUids.set(player.id, uid);
        } else {
          const found = await knownAccount(player.link.accountId);
          players.push({ ...player, link: { ...player.link, accountId: found.account.accountId } });
          linkUids.set(player.id, found.uid);
        }
      }

      const memberUids = new Set([uid]);
      const organizerUids = new Set([uid]);
      for (const player of players) {
        const linkedUid = linkUids.get(player.id);
        if (!player.link || !linkedUid) continue;
        memberUids.add(linkedUid);
        if (player.link.role === "organizer") organizerUids.add(linkedUid);
      }

      const batch = writeBatch(db);
      batch.set(clubRef(input.id), {
        name,
        memberUids: [...memberUids],
        organizerUids: [...organizerUids],
        createdAt: serverTimestamp(),
      });
      for (const player of players) {
        batch.set(playerRef(input.id, player.id), toRecord(player, linkUids.get(player.id)));
      }
      await settle(deps.online, batch.commit());
      return { id: input.id, name, kind: "shared", players };
    },

    async renameSharedClub(clubId, name) {
      const trimmed = requireValidName(name);
      await requireClub(clubId);
      await settle(deps.online, updateDoc(clubRef(clubId), { name: trimmed }));
    },

    async deleteSharedClub(clubId) {
      await requireClub(clubId);
      await requireViewer();
      await deleteWholeClub(clubId);
    },

    async addClubPlayer(clubId, player) {
      if (!deps.online.get()) throw new BackendError("offline");
      requireValidName(player.name);
      if (player.link) {
        const { account, uid } = await knownAccount(player.link.accountId);
        await changeLinks(
          clubId,
          {
            type: "addPlayer",
            player: { ...player, link: { ...player.link, accountId: account.accountId } },
          },
          uid,
        );
        return;
      }
      await requireClub(clubId);
      await settle(deps.online, setDoc(playerRef(clubId, player.id), toRecord(player)));
    },

    async updateClubPlayer(clubId, playerId, patch) {
      if (Object.keys(patch).length === 0) return;
      if (patch.name !== undefined) requireValidName(patch.name);
      await requireClub(clubId);
      await settle(deps.online, updateDoc(playerRef(clubId, playerId), { ...patch }));
    },

    async removeClubPlayer(clubId, playerId) {
      await requireClub(clubId);
      // Online this reads the server, offline the cache (nothing cached: an unlinked row is the
      // usual case).
      const row = await readDoc(playerRef(clubId, playerId));
      const linked = !!row?.exists() && !!toClubPlayer(playerId, row.data() ?? {}).link;
      // A linked row also changes who is on the Club, which needs the connection and a check.
      if (linked) return changeLinks(clubId, { type: "removePlayer", playerId });
      await settle(deps.online, deleteDoc(playerRef(clubId, playerId)));
    },

    async lookupAccount(accountId) {
      return (await findAccount(accountId))?.account ?? null;
    },

    async linkClubPlayer(clubId, playerId, accountId, role) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await knownAccount(accountId);
      await changeLinks(
        clubId,
        { type: "link", playerId, link: { accountId: account.accountId, role } },
        uid,
      );
    },

    setClubPlayerRole: (clubId, playerId, role) =>
      changeLinks(clubId, { type: "setRole", playerId, role }),

    unlinkClubPlayer: (clubId, playerId) => changeLinks(clubId, { type: "unlink", playerId }),

    async leaveClub(clubId) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await requireViewer();
      const loaded = await loadClub(clubId);
      const row =
        loaded.club.players.find((player) => loaded.linkUids.get(player.id) === uid) ??
        ownRow(loaded.club, account.accountId);
      if (row) {
        await changeLinks(clubId, { type: "unlink", playerId: row.id });
        return;
      }
      // No row is linked to me, but I may still be on the Club's lists (they are what the rules
      // go by), so leaving takes me off them.
      if (!loaded.memberUids.includes(uid)) throw new BackendError("not-found");
      if (loaded.organizerUids.includes(uid) && loaded.organizerUids.length <= 1) {
        throw new BackendError("last-organizer");
      }
      const batch = writeBatch(db);
      batch.update(clubRef(clubId), lists(uid, null));
      await settle(deps.online, batch.commit());
    },
  };

  /**
   * Removes `clubId` entirely. The history goes first, always: the Ended sessions (any Organizer
   * may delete them), so that nothing is left behind for somebody who learns the id and creates
   * the Club again. Then the rows nobody is linked to, then the rest with the Club in one batch.
   */
  async function deleteWholeClub(clubId: string): Promise<void> {
    const CHUNK = 400;
    const club = await getDoc(clubRef(clubId));
    if (!club.exists()) return;

    const removeInBatches = async (refs: DocumentReference[]) => {
      for (let start = 0; start < refs.length; start += CHUNK) {
        const batch = writeBatch(db);
        for (const ref of refs.slice(start, start + CHUNK)) batch.delete(ref);
        await settle(deps.online, batch.commit());
      }
    };

    const rows = (await getDocs(playersRef(clubId))).docs;
    await removeInBatches(
      (await getDocs(collection(db, "clubs", clubId, "endedSessions"))).docs.map((d) => d.ref),
    );
    // Rows nobody is linked to can go while the Club stands; the linked ones go with the Club.
    await removeInBatches(rows.filter((row) => !row.data().link).map((row) => row.ref));

    const batch = writeBatch(db);
    for (const row of rows.filter((row) => row.data().link)) batch.delete(row.ref);
    // Requests only an Organizer who isn't the host can't list; they are inert once the Club is
    // gone (nobody can read them without its Active session), so they are left when unreadable.
    try {
      const requests = await getDocs(
        collection(db, "clubs", clubId, "activeSession", "current", "requests"),
      );
      for (const request of requests.docs.slice(0, CHUNK)) batch.delete(request.ref);
    } catch {
      // See above.
    }
    // The Club's Active session goes with it (the rules let an Organizer delete it then).
    const active = doc(db, "clubs", clubId, "activeSession", "current");
    if ((await readDoc(active))?.exists()) batch.delete(active);
    batch.delete(clubRef(clubId));
    await settle(deps.online, batch.commit());
  }

  return {
    ...api,

    async deleteAccountClubs({ deleteClubIds, unlinkClubIds }) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { uid } = await requireViewer();

      // Check everything before changing anything. A Club that is gone already is nothing to do.
      const gone = async (clubId: string) => {
        try {
          return await loadClub(clubId);
        } catch (error) {
          if (error instanceof BackendError && error.code === "not-found") return null;
          throw error;
        }
      };
      for (const clubId of unlinkClubIds) {
        const loaded = await gone(clubId);
        if (
          loaded &&
          loaded.organizerUids.includes(uid) &&
          !loaded.organizerUids.some((other) => other !== uid)
        ) {
          throw new BackendError("last-organizer");
        }
      }
      for (const clubId of deleteClubIds) {
        const loaded = await gone(clubId);
        if (loaded && loaded.memberUids.some((member) => member !== uid)) {
          throw new BackendError("forbidden");
        }
      }

      for (const clubId of deleteClubIds) await deleteWholeClub(clubId);
      for (const clubId of unlinkClubIds) {
        if (await gone(clubId)) await api.leaveClub(clubId);
      }
    },
  };
}

/** What `loadClub` returns: the Club, and the lists and link uids that Security Rules go by. */
interface LoadedClub {
  club: Club;
  /** Row id → the uid its link points at. */
  linkUids: Map<string, string>;
  memberUids: string[];
  organizerUids: string[];
}

function toClubPlayer(id: string, data: DocumentData): ClubPlayer {
  const link = data.link as { accountId?: unknown; uid?: unknown; role?: unknown } | undefined;
  const player: ClubPlayer = {
    id,
    name: String(data.name ?? ""),
    skill: SKILL_LEVELS.includes(data.skill as SkillLevel)
      ? (data.skill as SkillLevel)
      : "intermediate",
  };
  if (
    link &&
    typeof link.accountId === "string" &&
    typeof link.uid === "string" &&
    (link.role === "organizer" || link.role === "player")
  ) {
    player.link = { accountId: link.accountId, role: link.role };
  }
  return player;
}
