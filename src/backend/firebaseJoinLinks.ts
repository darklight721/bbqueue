import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { isJoinToken, joinNameHash, newJoinToken } from "../domain/joinLink.ts";
import { BackendError, type JoinLinksApi, type OnlineSource } from "./backend.ts";
import {
  confirmed,
  isPermissionDenied,
  readDoc,
  requireViewer,
  settle,
  stringList,
  toBackendError,
  type FirebaseDeps,
  type Write,
} from "./firebaseShared.ts";

/**
 * Join links on Firestore (ADR-0010):
 * - `clubs/{clubId}.joinToken`: the Club's current token. Only a Join record under this token
 * lets anyone Claim, so a reset (a new token) makes the old records inert at once.
 * - `joinLinks/{token}`: `{ clubId, clubName, createdAt }`, the Join record. Made in the same
 * write that sets the Club's `joinToken`; its `clubName` follows renames.
 * - `joinLinks/{token}/names/{joinNameHash(token, name)}`: `{ playerId, linked }`, one per Club
 * player (linked ones too). Read one at a time, never listed, so holding the link lets you check a
 * name but not read the roster.
 * - `joinLinks/{token}/claims/{uid}`: `{ clubId, playerId, createdAt }`, written in the Claim
 * batch; the rules check it to let somebody who isn't on the Club link themselves.
 *
 * The name index is derived data, like the Club's `memberUids`: the roster writes in
 * `firebaseClubs.ts` keep it in step through {@link commitWithIndex}.
 */

const CHUNK = 400;

export const joinRecordRef = (db: Firestore, token: string) => doc(db, "joinLinks", token);

async function nameRef(db: Firestore, token: string, name: string): Promise<DocumentReference> {
  return doc(db, "joinLinks", token, "names", await joinNameHash(token, name));
}

/** The Club's current Join link token, from its record, or null. */
export const clubJoinToken = (data: DocumentData | undefined): string | null =>
  typeof data?.joinToken === "string" ? data.joinToken : null;

/** Sets the name index entry of a Club player. */
export async function setNameEntry(
  db: Firestore,
  token: string,
  name: string,
  playerId: string,
  linked: boolean,
): Promise<Write> {
  const ref = await nameRef(db, token, name);
  return (batch) => batch.set(ref, { playerId, linked });
}

/**
 * Removes the entry of a Club player's (old) name, unless it already belongs to another Club
 * player (two rows swapping names). Null when there is nothing to remove. An entry that can't be
 * read (offline, not cached) is removed: better no entry than one naming the wrong row.
 */
export async function removeNameEntry(
  db: Firestore,
  online: OnlineSource,
  token: string,
  name: string,
  playerId: string,
): Promise<Write | null> {
  const ref = await nameRef(db, token, name);
  const entry = await readDoc(online, ref);
  if (entry && (!entry.exists() || entry.data().playerId !== playerId)) return null;
  return (batch) => batch.delete(ref);
}

/**
 * Commits a roster change with the edits that keep the name index in step. The index is derived
 * data and ADR-0010 accepts it going stale, so it must never cost the roster change:
 * - online, one batch; if the server refuses it (`forbidden`, e.g. a Join record that is gone
 * or broken), the roster change is sent again on its own;
 * - offline, the roster change and the index edits wait in the queue as two writes, so an index
 * edit refused later (the link was reset on another device meanwhile) can't take it down too.
 */
export async function commitWithIndex(
  db: Firestore,
  online: OnlineSource,
  roster: Write[],
  index: Write[],
): Promise<void> {
  const commit = (...writes: Write[]) => {
    const batch = writeBatch(db);
    for (const write of writes) write(batch);
    return settle(online, batch.commit());
  };
  if (index.length === 0) return commit(...roster);
  if (!online.get()) {
    await commit(...roster);
    await commit(...index);
    return;
  }
  try {
    await commit(...roster, ...index);
  } catch (error) {
    if (!(error instanceof BackendError && error.code === "forbidden")) throw error;
    console.warn("The Join link refused this change; saving it without the Join link", error);
    await commit(...roster);
  }
}

/**
 * Deletes a Join record and the index entries of these names, while the Club still exists (the
 * rules find the Organizer through it). The entries go first: the rules find the Club through the
 * record. For the Club's current token, checks first that the record is there (deleting entries
 * without it is refused); an old token's record can't be read, so `{ current: false }` skips that.
 */
export async function removeJoinRecord(
  db: Firestore,
  online: OnlineSource,
  token: string,
  names: string[],
  { current = true } = {},
): Promise<void> {
  const record = joinRecordRef(db, token);
  if (current && !(await readDoc(online, record))?.exists()) return;
  const refs = await Promise.all([...new Set(names)].map((name) => nameRef(db, token, name)));
  for (let start = 0; start < refs.length; start += CHUNK) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(start, start + CHUNK)) batch.delete(ref);
    await settle(online, batch.commit());
  }
  const batch = writeBatch(db);
  batch.delete(record);
  await settle(online, batch.commit());
}

/** What the Join links module needs beyond the other Firebase modules. */
export interface FirebaseJoinLinksDeps extends FirebaseDeps {
  /** Sign in (anonymously) when nobody is: reading a Join record needs a signed-in user. */
  signIn(): Promise<void>;
}

export function createFirebaseJoinLinks(db: Firestore, deps: FirebaseJoinLinksDeps): JoinLinksApi {
  const clubRef = (clubId: string) => doc(db, "clubs", clubId);
  const playersRef = (clubId: string) => collection(db, "clubs", clubId, "players");
  const playerRef = (clubId: string, playerId: string) =>
    doc(db, "clubs", clubId, "players", playerId);
  const claimRef = (token: string, uid: string) => doc(db, "joinLinks", token, "claims", uid);

  function requireOnline() {
    if (!deps.online.get()) throw new BackendError("offline");
  }

  /** Fails unless `uid` is an Organizer of the Club in `data`: `forbidden` for a Player. */
  function requireOrganizer(data: DocumentData | undefined, uid: string) {
    if (stringList(data?.organizerUids).includes(uid)) return;
    throw new BackendError(stringList(data?.memberUids).includes(uid) ? "forbidden" : "not-found");
  }

  /** The Club's rows' index entries under `token`. */
  async function nameEntries(clubId: string, token: string) {
    const rows = await getDocs(playersRef(clubId));
    const names = rows.docs.map((row) => String(row.data().name ?? ""));
    const writes = await Promise.all(
      rows.docs.map((row, i) => setNameEntry(db, token, names[i]!, row.id, !!row.data().link)),
    );
    return { names, writes };
  }

  /** Makes `token` the Club's current one, with its Join record. */
  const newRecord =
    (clubId: string, clubName: string, token: string): Write =>
    (writer) => {
      writer.update(clubRef(clubId), { joinToken: token });
      writer.set(joinRecordRef(db, token), { clubId, clubName, createdAt: serverTimestamp() });
    };

  /**
   * A Join record or name entry, or null when it isn't there. The rules refuse reading one whose
   * token isn't its Club's current one (reset, or the Club deleted): that is null too.
   */
  async function readJoin(ref: DocumentReference): Promise<DocumentData | null> {
    try {
      return (await getDoc(ref)).data() ?? null;
    } catch (error) {
      if (isPermissionDenied(error)) return null;
      throw error;
    }
  }

  async function signedIn<T>(body: () => Promise<T>): Promise<T> {
    requireOnline();
    try {
      await deps.signIn();
      return await body();
    } catch (error) {
      throw toBackendError(error);
    }
  }

  return {
    async getJoinLink(clubId) {
      const { uid } = await requireViewer(deps);
      const club = await readDoc(deps.online, clubRef(clubId));
      if (!club) throw new BackendError(deps.online.get() ? "not-found" : "offline");
      if (!club.exists()) throw new BackendError("not-found");
      requireOrganizer(club.data(), uid);
      const known = clubJoinToken(club.data());
      if (known) return known;
      requireOnline();

      try {
        const token = newJoinToken();
        const { writes } = await nameEntries(clubId, token);
        // Two Organizers sharing at once must end up with the same link.
        return await runTransaction(db, async (transaction) => {
          const current = await transaction.get(clubRef(clubId));
          if (!current.exists()) throw new BackendError("not-found");
          const appeared = clubJoinToken(current.data());
          if (appeared) return appeared;
          newRecord(clubId, String(current.data().name ?? ""), token)(transaction);
          for (const write of writes) write(transaction);
          return token;
        });
      } catch (error) {
        throw toBackendError(error);
      }
    },

    async resetJoinLink(clubId) {
      requireOnline();
      const { uid } = await requireViewer(deps);
      try {
        const club = await getDoc(clubRef(clubId)).catch((error: unknown) => {
          throw toBackendError(error).code === "forbidden" ? new BackendError("not-found") : error;
        });
        if (!club.exists()) throw new BackendError("not-found");
        requireOrganizer(club.data(), uid);
        const old = clubJoinToken(club.data());
        const token = newJoinToken();
        const { names, writes } = await nameEntries(clubId, token);

        const batch = writeBatch(db);
        newRecord(clubId, String(club.data().name ?? ""), token)(batch);
        for (const write of writes) write(batch);
        await confirmed(batch.commit());

        if (old) {
          // Best effort: the rules only honour the Club's current token, so leftovers are inert.
          await removeJoinRecord(db, deps.online, old, names, { current: false }).catch(
            (error: unknown) => console.warn("Couldn't delete the old Join link", error),
          );
        }
        return token;
      } catch (error) {
        throw toBackendError(error);
      }
    },

    getJoinLinkInfo: (token) =>
      signedIn(async () => {
        if (!isJoinToken(token)) return null;
        const data = await readJoin(joinRecordRef(db, token));
        if (!data || typeof data.clubId !== "string") return null;
        return { clubId: data.clubId, clubName: String(data.clubName ?? "") };
      }),

    findJoinLinkName: (token, name) =>
      signedIn(async () => {
        if (!isJoinToken(token)) return null;
        const entry = await readJoin(await nameRef(db, token, name));
        if (!entry || typeof entry.playerId !== "string") return null;
        return { playerId: entry.playerId, linked: entry.linked === true };
      }),

    async claimClubPlayer(token, name) {
      const { account, uid } = await requireViewer(deps);
      requireOnline();
      if (!isJoinToken(token)) throw new BackendError("not-found");
      const record = joinRecordRef(db, token);
      const entryRef = await nameRef(db, token, name);

      /** Whether this Account can read the Club, i.e. is on it already. */
      const onClub = async (clubId: string) => {
        try {
          return (await getDoc(clubRef(clubId))).exists();
        } catch {
          return false;
        }
      };

      try {
        const clubId = (await readJoin(record))?.clubId;
        if (typeof clubId !== "string") throw new BackendError("not-found");
        const entry = await readJoin(entryRef);
        if (!entry || typeof entry.playerId !== "string") throw new BackendError("not-found");
        if (entry.linked === true) {
          throw new BackendError((await onClub(clubId)) ? "already-linked" : "already-claimed");
        }
        const playerId = entry.playerId;

        const batch = writeBatch(db);
        batch.set(claimRef(token, uid), { clubId, playerId, createdAt: serverTimestamp() });
        batch.update(playerRef(clubId, playerId), {
          link: { accountId: account.accountId, uid, role: "player" },
        });
        batch.update(clubRef(clubId), { memberUids: arrayUnion(uid) });
        batch.update(entryRef, { linked: true });
        try {
          // Not `settle`: the caller opens the Club next, so it must know the Claim landed.
          await confirmed(batch.commit());
        } catch (error) {
          if (!isPermissionDenied(error)) throw error;
          // The rules don't say why. Find out what changed since the checks above.
          if ((await readJoin(entryRef))?.linked === true) {
            throw new BackendError("already-claimed", undefined, { cause: error });
          }
          if (!(await readJoin(record))) {
            throw new BackendError("not-found", undefined, { cause: error });
          }
          if (await onClub(clubId)) {
            throw new BackendError("already-linked", undefined, { cause: error });
          }
          throw error;
        }
        return { clubId };
      } catch (error) {
        throw toBackendError(error);
      }
    },
  };
}
