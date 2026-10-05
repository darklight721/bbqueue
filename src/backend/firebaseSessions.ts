import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  limit,
  orderBy,
  setDoc,
  writeBatch,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import { newId } from "../domain/ids.ts";
import { parseEndedSession, parseSession } from "../domain/parseSession.ts";
import { MAX_NAME_LENGTH } from "../domain/validation.ts";
import type {
  Account,
  ActiveSession,
  EndedSession,
  Session,
  SessionRequest,
  SessionRequestKind,
} from "../domain/types.ts";
import { BackendError, type OnlineSource, type Unsubscribe } from "./backend.ts";
import {
  CACHE_TIMEOUT_MS,
  retryDelay,
  settle,
  stringList,
  toBackendError,
  toRecord,
  withTimeout,
} from "./firebaseClubs.ts";
import type { ActiveSessionsApi } from "./simulatedSessions.ts";

/**
 * The Active session of a Shared club on Firestore (ADR-0007):
 * `clubs/{clubId}/activeSession/current` is one fixed record per Club, so "at most one per Club"
 * is part of the layout. It holds `{ sessionJson, hostUid, hostAccountId, hostName, updatedAt }`:
 * - `sessionJson`: the host's whole Session as JSON text. Firestore doesn't take arrays inside
 *   arrays (Teams, Queue slots), and the Session is only ever read or written as a whole.
 * - `hostUid` / `hostAccountId` / `hostName`: who the Session host is. The rules check `hostUid`.
 * - `updatedAt`: the server's time of the last upload, so viewers can say how old their copy is.
 *
 * Only the host writes it (see `firestore.rules`); the host's uploads are the most frequent write
 * in the app, so the rules decide from the record itself, with no extra reads.
 */
export function createFirebaseActiveSessions(
  db: Firestore,
  deps: {
    online: OnlineSource;
    getAccount(): Promise<Account | null>;
    currentUid(): string | null;
    observeAccount(listener: (account: Account | null) => void): Unsubscribe;
  },
): ActiveSessionsApi {
  const clubRef = (clubId: string) => doc(db, "clubs", clubId);
  const sessionRef = (clubId: string) => doc(db, "clubs", clubId, "activeSession", "current");
  const endedRef = (clubId: string) => collection(db, "clubs", clubId, "endedSessions");
  const requestsRef = (clubId: string) =>
    collection(db, "clubs", clubId, "activeSession", "current", "requests");

  async function requireViewer(): Promise<{ account: Account; uid: string }> {
    const account = await deps.getAccount();
    const uid = deps.currentUid();
    if (!account || !uid) throw new BackendError("no-account");
    return { account, uid };
  }

  /** Fails with `not-found` for a Club that isn't there (or isn't mine) and `forbidden` for a Player. */
  async function requireOrganizer(clubId: string, uid: string): Promise<void> {
    // A Club you can't read is, as far as you can tell, not there.
    let organizerUids: string[];
    try {
      const club = await getDoc(clubRef(clubId));
      if (!club.exists()) throw new BackendError("not-found");
      organizerUids = stringList(club.data().organizerUids);
    } catch (error) {
      const mapped = toBackendError(error);
      throw mapped.code === "forbidden"
        ? new BackendError("not-found", undefined, { cause: error })
        : mapped;
    }
    if (!organizerUids.includes(uid)) throw new BackendError("forbidden");
  }

  return {
    observeActiveSessions(listener) {
      let stopClubs: Unsubscribe = () => {};
      let watching: string | null | undefined;
      const stopAccount = deps.observeAccount((account) => {
        const uid = account ? deps.currentUid() : null;
        if (uid === watching) return;
        watching = uid;
        stopClubs();
        stopClubs = uid ? watchClubs(uid) : () => {};
        if (!uid) listener({ sessions: [], unknown: [] });
      });

      function watchClubs(uid: string): Unsubscribe {
        interface Entry {
          /** undefined: not heard yet; null: the Club has no Active session. */
          state: ActiveSession | null | undefined;
          stop: Unsubscribe;
        }
        const clubs = new Map<string, Entry>();
        let stopped = false;
        let reported = false;

        function emit() {
          const sessions: ActiveSession[] = [];
          const unknown: string[] = [];
          for (const [id, entry] of clubs) {
            if (entry.state) sessions.push(entry.state);
            else if (entry.state === undefined) unknown.push(id);
          }
          listener({ sessions, unknown });
        }

        function watchSession(clubId: string, entry: Entry) {
          let attempt = 0;
          let retry: ReturnType<typeof setTimeout> | undefined;
          let stopSnapshot: Unsubscribe = () => {};
          const listen = () => {
            stopSnapshot = onSnapshot(
              sessionRef(clubId),
              (snapshot) => {
                attempt = 0;
                if (snapshot.exists()) {
                  entry.state = toActiveSession(
                    clubId,
                    snapshot.data({ serverTimestamps: "estimate" }),
                  );
                } else {
                  // Nothing cached is not the same as no session. My own delete that is still
                  // waiting for the connection is: the host already sees the session gone.
                  entry.state =
                    snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites
                      ? undefined
                      : null;
                }
                emit();
              },
              (error) => {
                if (clubs.get(clubId) !== entry) return;
                console.warn("Active session listener failed, trying again", error);
                retry = setTimeout(listen, retryDelay(attempt++));
              },
            );
          };
          entry.stop = () => {
            clearTimeout(retry);
            stopSnapshot();
          };
          listen();
        }

        function handleClubs(snapshot: QuerySnapshot) {
          // A cold start can answer "no Clubs" from an empty cache before the server has spoken.
          if (!reported && snapshot.empty && snapshot.metadata.fromCache) return;
          const seen = new Set<string>();
          for (const clubDoc of snapshot.docs) {
            seen.add(clubDoc.id);
            if (clubs.has(clubDoc.id)) continue;
            const entry: Entry = { state: undefined, stop: () => {} };
            clubs.set(clubDoc.id, entry);
            watchSession(clubDoc.id, entry);
          }
          for (const [id, entry] of clubs) {
            if (seen.has(id)) continue;
            entry.stop();
            clubs.delete(id);
          }
          reported = true;
          emit();
        }

        const members = query(collection(db, "clubs"), where("memberUids", "array-contains", uid));
        let attempt = 0;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let stopMembers: Unsubscribe = () => {};
        const listenMembers = () => {
          stopMembers = onSnapshot(
            members,
            (snapshot) => {
              attempt = 0;
              handleClubs(snapshot);
            },
            (error) => {
              if (stopped) return;
              console.warn("Clubs listener (Active sessions) failed, trying again", error);
              retry = setTimeout(listenMembers, retryDelay(attempt++));
            },
          );
        };
        listenMembers();

        return () => {
          stopped = true;
          clearTimeout(retry);
          stopMembers();
          for (const entry of clubs.values()) entry.stop();
          clubs.clear();
        };
      }

      return () => {
        stopAccount();
        stopClubs();
      };
    },

    async startSharedSession(clubId, session) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await requireViewer();

      await requireOrganizer(clubId, uid);

      // A transaction, so two Organizers starting at once can't both win; it also needs the
      // connection, which is what we want.
      try {
        await runTransaction(db, async (transaction) => {
          if ((await transaction.get(sessionRef(clubId))).exists()) {
            throw new BackendError("session-exists");
          }
          transaction.set(sessionRef(clubId), {
            sessionId: session.id,
            sessionJson: JSON.stringify(session),
            hostUid: uid,
            hostAccountId: account.accountId,
            hostName: account.name,
            updatedAt: serverTimestamp(),
          });
        });
      } catch (error) {
        throw toBackendError(error);
      }
      return {
        clubId,
        session,
        hostAccountId: account.accountId,
        hostName: account.name,
        updatedAt: Date.now(),
      };
    },

    async takeOverSession(clubId) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await requireViewer();
      await requireOrganizer(clubId, uid);

      // A transaction, so two Organizers taking over at once can't both think they won: the
      // second one retries, sees the first as the host and takes over from them. Only the host
      // fields change; the Session text stays as the server has it. (Security Rules can't tell a
      // transaction from a plain write; they only keep the write to the host fields.)
      try {
        const data = await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(sessionRef(clubId));
          if (!snapshot.exists()) throw new BackendError("not-found");
          const current = snapshot.data();
          if (current.hostUid !== uid) {
            transaction.update(sessionRef(clubId), {
              hostUid: uid,
              hostAccountId: account.accountId,
              hostName: account.name,
              updatedAt: serverTimestamp(),
            });
          }
          return { ...current, hostAccountId: account.accountId, hostName: account.name };
        });
        const active = toActiveSession(clubId, { ...data, updatedAt: null });
        if (!active) throw new BackendError("failed");
        return { ...active, updatedAt: Date.now() };
      } catch (error) {
        throw toBackendError(error);
      }
    },

    async makeSharedClub({ club, endedSessions, activeSession }) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await requireViewer();
      const linked = club.players.filter((row) => row.link);
      if (
        club.kind !== "shared" ||
        linked.length !== 1 ||
        linked[0]?.link?.role !== "organizer" ||
        linked[0].link.accountId.toLowerCase() !== account.accountId.toLowerCase() ||
        endedSessions.some((ended) => ended.clubId !== club.id) ||
        (activeSession && activeSession.clubId !== club.id)
      ) {
        throw new BackendError("failed");
      }

      // Is there a part of this Club on the server already (an earlier try that stopped)? Then carry
      // on from there. A Club with this id that isn't just mine can't be read: it isn't ours to touch.
      let there = false;
      try {
        const existing = await getDocFromServer(clubRef(club.id));
        if (existing.exists()) {
          const data = existing.data();
          const only = (list: unknown) => {
            const uids = stringList(list);
            return uids.length === 1 && uids[0] === uid;
          };
          if (!only(data.memberUids) || !only(data.organizerUids)) {
            throw new BackendError("forbidden");
          }
          there = true;
        }
      } catch (error) {
        throw toBackendError(error);
      }

      // At most 500 writes in a batch: the Club and its rows, more rows, then the Ended sessions.
      const CHUNK = 400;
      const rows = [...club.players].sort((a, b) => Number(!!b.link) - Number(!!a.link)); // the linked row goes in the Club's first batch
      const commit = (batch: ReturnType<typeof writeBatch>) => confirmed(batch.commit());
      try {
        for (let start = 0; start < Math.max(rows.length, 1); start += CHUNK) {
          const batch = writeBatch(db);
          if (start === 0 && !there) {
            batch.set(clubRef(club.id), {
              name: club.name,
              memberUids: [uid],
              organizerUids: [uid],
              createdAt: serverTimestamp(),
            });
          }
          for (const row of rows.slice(start, start + CHUNK)) {
            batch.set(doc(db, "clubs", club.id, "players", row.id), toRecord(row, uid));
          }
          await commit(batch);
        }

        const known = new Set<string>();
        if (there) {
          for (const row of (await getDocs(endedRef(club.id))).docs) known.add(row.id);
        }
        const missing = endedSessions.filter((ended) => !known.has(ended.id));
        for (let start = 0; start < missing.length; start += CHUNK) {
          const batch = writeBatch(db);
          for (const ended of missing.slice(start, start + CHUNK)) {
            batch.set(doc(endedRef(club.id), ended.id), {
              hostUid: uid,
              endedAt: ended.endedAt,
              endedJson: JSON.stringify(ended),
              createdAt: serverTimestamp(),
            });
          }
          await commit(batch);
        }

        let active: ActiveSession | null = null;
        if (activeSession) {
          const record = await getDocFromServer(sessionRef(club.id));
          if (record.exists() && record.data().hostUid !== uid) {
            throw new BackendError("session-exists");
          }
          if (!record.exists()) {
            await confirmed(
              runTransaction(db, async (transaction) => {
                if ((await transaction.get(sessionRef(club.id))).exists()) return;
                transaction.set(sessionRef(club.id), {
                  sessionId: activeSession.id,
                  sessionJson: JSON.stringify(activeSession),
                  hostUid: uid,
                  hostAccountId: account.accountId,
                  hostName: account.name,
                  updatedAt: serverTimestamp(),
                });
              }),
            );
          }
          active = {
            clubId: club.id,
            session: activeSession,
            hostAccountId: account.accountId,
            hostName: account.name,
            updatedAt: Date.now(),
          };
        }
        return { club, active };
      } catch (error) {
        throw toBackendError(error);
      }
    },

    async getActiveSession(clubId) {
      if (!deps.online.get()) throw new BackendError("offline");
      try {
        const snapshot = await getDocFromServer(sessionRef(clubId));
        return snapshot.exists() ? toActiveSession(clubId, snapshot.data()) : null;
      } catch (error) {
        const mapped = toBackendError(error);
        // Not on the Club (any more): nothing to see.
        if (mapped.code === "forbidden") return null;
        throw mapped;
      }
    },

    async publishActiveSession(clubId, session) {
      if (!deps.online.get()) throw new BackendError("offline");
      if (!deps.currentUid()) throw new BackendError("no-account");
      // Not `settle`d: if the connection is really down this waits, and the caller sends nothing
      // else meanwhile, so Firestore never queues a backlog of whole Sessions.
      try {
        await updateDoc(sessionRef(clubId), {
          sessionJson: JSON.stringify(session),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        const mapped = toBackendError(error);
        if (mapped.code !== "forbidden" && mapped.code !== "not-found") throw mapped;
        // Both come back as "refused": tell a record that is gone from one run by somebody else.
        try {
          const record = await getDocFromServer(sessionRef(clubId));
          throw new BackendError(record.exists() ? "forbidden" : "not-found", undefined, {
            cause: error,
          });
        } catch (diagnosis) {
          if (diagnosis instanceof BackendError) throw diagnosis;
          // Can't even read it: I'm not on the Club (any more).
          throw new BackendError("not-found", undefined, { cause: error });
        }
      }
    },

    async endSharedSession(clubId, ended = null) {
      const uid = deps.currentUid();
      if (!uid) throw new BackendError("no-account");
      // Everything is read from the device's cache, never from the server: ending the night must
      // not wait for a network that reports itself online and doesn't answer. The host's own
      // listeners keep the Session and its requests in the cache. Not in the cache: the delete is
      // sent anyway and the server decides (a record that isn't mine is refused there).
      let record: DocumentData | undefined;
      let cachedAbsent = false;
      try {
        const snapshot = await withTimeout(getDocFromCache(sessionRef(clubId)), CACHE_TIMEOUT_MS);
        if (snapshot.exists()) record = snapshot.data();
        else cachedAbsent = true;
      } catch {
        // Not in the cache.
      }
      if (!record && deps.online.get()) {
        // Nothing (or "none") in the cache, which may be behind (a Session only just started):
        // ask the server, but only for a moment. A network that doesn't answer must not hold up
        // the end; then the delete is sent anyway and the server decides.
        try {
          const snapshot = await withTimeout(
            getDocFromServer(sessionRef(clubId)),
            SERVER_PEEK_TIMEOUT_MS,
          );
          if (!snapshot.exists()) return;
          record = snapshot.data();
        } catch {
          // No answer.
        }
      } else if (!record && cachedAbsent) {
        return;
      }
      if (record && record.hostUid !== uid) throw new BackendError("forbidden");
      // The record goes with the requests made in it, in one batch (so also when it waits offline).
      const batch = writeBatch(db);
      batch.delete(sessionRef(clubId));
      // The Ended session is created in the same batch, so it lands with the delete (and waits
      // with it offline). The rules let only the host create it, only in the batch that ends the
      // Session it belongs to, and nobody change it after.
      if (ended) {
        batch.set(doc(endedRef(clubId), ended.id), {
          hostUid: uid,
          endedAt: ended.endedAt,
          endedJson: JSON.stringify(ended),
          createdAt: serverTimestamp(),
        });
      }
      try {
        const requests = await withTimeout(getDocsFromCache(requestsRef(clubId)), CACHE_TIMEOUT_MS);
        for (const request of requests.docs) batch.delete(request.ref);
      } catch {
        // Requests we can't list stay behind; they are for this Session only and are ignored later.
      }
      // Committed now, before waiting for anything: the write is in the device's queue from here.
      await settle(deps.online, batch.commit());
    },

    observeEndedSessions(listener) {
      let stopClubs: Unsubscribe = () => {};
      let watching: string | null | undefined;
      const stopAccount = deps.observeAccount((account) => {
        const uid = account ? deps.currentUid() : null;
        if (uid === watching) return;
        watching = uid;
        stopClubs();
        stopClubs = uid ? watchClubs(uid) : () => {};
        if (!uid) listener({ sessions: [], clubIds: [] });
      });

      function watchClubs(uid: string): Unsubscribe {
        interface Entry {
          sessions: EndedSession[];
          stop: Unsubscribe;
        }
        const clubs = new Map<string, Entry>();
        let stopped = false;
        let reported = false;

        function emit() {
          listener({
            sessions: [...clubs.values()].flatMap((entry) => entry.sessions),
            clubIds: [...clubs.keys()],
          });
        }

        function watchEnded(clubId: string, entry: Entry) {
          let attempt = 0;
          let retry: ReturnType<typeof setTimeout> | undefined;
          let stopSnapshot: Unsubscribe = () => {};
          const listen = () => {
            stopSnapshot = onSnapshot(
              // The 50 most recent: what everybody sees. Older ones stay on the server (rules can't
              // count, and nobody may delete them) but aren't listed.
              query(endedRef(clubId), orderBy("endedAt", "desc"), limit(50)),
              (snapshot) => {
                attempt = 0;
                entry.sessions = snapshot.docs.flatMap((row) => {
                  const parsed = toEndedSession(clubId, row.id, row.data());
                  return parsed ? [parsed] : [];
                });
                emit();
              },
              (error) => {
                if (clubs.get(clubId) !== entry) return;
                console.warn("Ended sessions listener failed, trying again", error);
                retry = setTimeout(listen, retryDelay(attempt++));
              },
            );
          };
          entry.stop = () => {
            clearTimeout(retry);
            stopSnapshot();
          };
          listen();
        }

        function handleClubs(snapshot: QuerySnapshot) {
          // A cold start can answer "no Clubs" from an empty cache before the server has spoken.
          if (!reported && snapshot.empty && snapshot.metadata.fromCache) return;
          const seen = new Set<string>();
          for (const clubDoc of snapshot.docs) {
            seen.add(clubDoc.id);
            if (clubs.has(clubDoc.id)) continue;
            const entry: Entry = { sessions: [], stop: () => {} };
            clubs.set(clubDoc.id, entry);
            watchEnded(clubDoc.id, entry);
          }
          for (const [id, entry] of clubs) {
            if (seen.has(id)) continue;
            entry.stop();
            clubs.delete(id);
          }
          reported = true;
          emit();
        }

        const members = query(collection(db, "clubs"), where("memberUids", "array-contains", uid));
        let attempt = 0;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let stopMembers: Unsubscribe = () => {};
        const listenMembers = () => {
          stopMembers = onSnapshot(
            members,
            (snapshot) => {
              attempt = 0;
              handleClubs(snapshot);
            },
            (error) => {
              if (stopped) return;
              console.warn("Clubs listener (Ended sessions) failed, trying again", error);
              retry = setTimeout(listenMembers, retryDelay(attempt++));
            },
          );
        };
        listenMembers();

        return () => {
          stopped = true;
          clearTimeout(retry);
          stopMembers();
          for (const entry of clubs.values()) entry.stop();
          clubs.clear();
        };
      }

      return () => {
        stopAccount();
        stopClubs();
      };
    },

    async requestSessionChange(clubId, input) {
      if (!deps.online.get()) throw new BackendError("offline");
      const { account, uid } = await requireViewer();
      try {
        if (!(await getDoc(sessionRef(clubId))).exists()) throw new BackendError("not-found");
      } catch (error) {
        throw toBackendError(error);
      }
      const request: SessionRequest = {
        id: newId(),
        clubId,
        sessionId: input.sessionId,
        sessionPlayerId: input.sessionPlayerId,
        accountId: account.accountId,
        kind: input.kind,
        status: "pending",
        createdAt: Date.now(),
      };
      await settle(
        deps.online,
        setDoc(doc(requestsRef(clubId), request.id), {
          uid,
          accountId: account.accountId,
          sessionId: input.sessionId,
          sessionPlayerId: input.sessionPlayerId,
          kind: input.kind satisfies SessionRequestKind,
          createdAt: serverTimestamp(),
        }),
      );
      return request;
    },

    observeSessionRequests(clubId, scope, listener) {
      let stopQuery: Unsubscribe = () => {};
      let watching: string | null | undefined;
      const stopAccount = deps.observeAccount((account) => {
        const uid = account ? deps.currentUid() : null;
        if (uid === watching) return;
        watching = uid;
        stopQuery();
        stopQuery = uid ? watch(uid) : () => {};
        if (!uid) listener([]);
      });

      function watch(uid: string): Unsubscribe {
        let attempt = 0;
        let retry: ReturnType<typeof setTimeout> | undefined;
        let stopSnapshot: Unsubscribe = () => {};
        let stopped = false;
        // A Player only ever asks for their own; the rules refuse anyone but the host the rest.
        const source =
          scope === "own"
            ? query(requestsRef(clubId), where("uid", "==", uid))
            : requestsRef(clubId);
        const listen = () => {
          stopSnapshot = onSnapshot(
            source,
            (snapshot) => {
              attempt = 0;
              const requests = snapshot.docs.flatMap((row) => {
                const request = toRequest(
                  clubId,
                  row.id,
                  row.data({ serverTimestamps: "estimate" }),
                );
                return request ? [request] : [];
              });
              listener(
                requests.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
              );
            },
            (error) => {
              if (stopped) return;
              console.warn("Requests listener failed, trying again", error);
              retry = setTimeout(listen, retryDelay(attempt++));
            },
          );
        };
        listen();
        return () => {
          stopped = true;
          clearTimeout(retry);
          stopSnapshot();
        };
      }

      return () => {
        stopAccount();
        stopQuery();
      };
    },

    async resolveSessionRequests(clubId, results) {
      if (!deps.online.get()) throw new BackendError("offline");
      if (results.length === 0) return;
      // One at a time, so a request that was already resolved (the rules refuse a second answer)
      // doesn't hold the others back.
      const settled = await Promise.allSettled(
        results.map((result) =>
          updateDoc(doc(requestsRef(clubId), result.id), {
            status: result.status,
            resolvedAt: serverTimestamp(),
          }),
        ),
      );
      const failures = settled.flatMap((outcome) =>
        outcome.status === "rejected" ? [toBackendError(outcome.reason)] : [],
      );
      const other = failures.find((failure) => failure.code !== "forbidden");
      if (other) throw other;
      // Every one refused: this Account isn't the host any more.
      if (failures.length === results.length) throw new BackendError("forbidden");
    },
  };
}

/** How long ending a Session waits for the server to say what it holds, when the cache can't. */
const SERVER_PEEK_TIMEOUT_MS = 3_000;

/** How long a write may take to reach the server before it counts as not having. */
const CONFIRM_TIMEOUT_MS = 30_000;

/** Resolves when the server has the write; a network that is really down rejects as `offline`. */
async function confirmed<T>(write: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      write,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BackendError("offline")), CONFIRM_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Ended session in a record, or null when it can't be read as one. A record is named by the
 * Session's id, so one whose Session says another id is not what it claims (it could replace or
 * hide a real one) and is ignored.
 */
export function toEndedSession(
  clubId: string,
  rowId: string,
  data: DocumentData,
): EndedSession | null {
  if (typeof data.endedJson !== "string") return null;
  let ended: EndedSession | null;
  try {
    ended = parseEndedSession(JSON.parse(data.endedJson));
  } catch {
    return null;
  }
  if (!ended || ended.id !== rowId) return null;
  // The Club it was published to is the truth, whatever the copy says.
  return { ...ended, clubId };
}

/** The request in a record, or null when it can't be read as one. */
function toRequest(clubId: string, id: string, data: DocumentData): SessionRequest | null {
  const kind = data.kind;
  if (
    typeof data.accountId !== "string" ||
    typeof data.sessionId !== "string" ||
    typeof data.sessionPlayerId !== "string" ||
    (kind !== "sit-out" && kind !== "back-in" && kind !== "leave")
  ) {
    return null;
  }
  const createdAt = (data.createdAt as { toMillis?: () => number } | null)?.toMillis?.();
  return {
    id,
    clubId,
    sessionId: data.sessionId,
    sessionPlayerId: data.sessionPlayerId,
    accountId: data.accountId,
    kind,
    status: data.status === "applied" || data.status === "skipped" ? data.status : "pending",
    createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
  };
}

/** The Active session in a record, or null when it can't be read as one. */
export function toActiveSession(clubId: string, data: DocumentData): ActiveSession | null {
  if (typeof data.sessionJson !== "string") return null;
  if (typeof data.hostAccountId !== "string" || typeof data.hostName !== "string") return null;
  let session: Session | null;
  try {
    session = parseSession(JSON.parse(data.sessionJson));
  } catch {
    return null;
  }
  if (!session) return null;
  const updatedAt = (data.updatedAt as { toMillis?: () => number } | null)?.toMillis?.();
  return {
    clubId,
    session,
    hostAccountId: data.hostAccountId.slice(0, MAX_NAME_LENGTH),
    hostName: data.hostName.slice(0, MAX_NAME_LENGTH),
    updatedAt: typeof updatedAt === "number" ? updatedAt : Date.now(),
  };
}
