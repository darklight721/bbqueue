import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Club } from "../domain/types.ts";
import type { OnlineSource } from "./backend.ts";

/**
 * How the Firestore listeners behind `observeSharedClubs` recover from errors, with Firestore
 * replaced by a fake that the test drives by hand.
 */

interface FakeListener {
  key: string;
  next: (snapshot: unknown) => void;
  error: (error: unknown) => void;
  active: boolean;
}
const listeners: FakeListener[] = [];
/** What asking the server about a Club's own record answers. */
let serverClub: (key: string) => Promise<{ exists: () => boolean }>;

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  collection: (_db: unknown, ...path: string[]) => ({ key: path.join("/") }),
  where: () => ({}),
  query: (collection: { key: string }) => ({ key: `${collection.key}?members` }),
  doc: (_db: unknown, ...path: string[]) => ({ key: path.join("/") }),
  getDocFromServer: (ref: { key: string }) => serverClub(ref.key),
  onSnapshot: (
    ref: { key: string },
    ...args:
      | [FakeListener["next"], FakeListener["error"]]
      | [object, FakeListener["next"], FakeListener["error"]]
  ) => {
    const [next, error] = args.slice(-2) as [FakeListener["next"], FakeListener["error"]];
    // A listener that fails is over, as in Firestore.
    const listener: FakeListener = {
      key: ref.key,
      next,
      error: (failure) => {
        listener.active = false;
        error(failure);
      },
      active: true,
    };
    listeners.push(listener);
    return () => {
      listener.active = false;
    };
  },
}));

const { createFirebaseClubs, settle, SETTLE_TIMEOUT_MS } = await import("./firebaseClubs.ts");

const MEMBERS = "clubs?members";
const ROWS = "clubs/c1/players";

const active = (key: string) =>
  listeners.filter((listener) => listener.active && listener.key === key);
const rowsSnapshot = (names: string[]) => ({
  docs: names.map((name, index) => ({
    id: `p${index}`,
    data: () => ({ name, skill: "beginner" }),
  })),
});
const membersSnapshot = (...ids: string[]) => membersSnapshotWith(false, ...ids);
/** `pending`: the Clubs' own records have changes the server hasn't confirmed yet. */
const membersSnapshotWith = (pending: boolean, ...ids: string[]) => ({
  docs: ids.map((id) => ({
    id,
    data: () => ({ name: `Club ${id}` }),
    metadata: { hasPendingWrites: pending },
  })),
});
const refused = { code: "permission-denied" };
const online = (value: boolean): OnlineSource => ({ get: () => value, subscribe: () => () => {} });

describe("observeSharedClubs listeners", () => {
  let reported: Club[][];
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    listeners.length = 0;
    reported = [];
    serverClub = () => Promise.resolve({ exists: () => true });
    const api = createFirebaseClubs({} as never, {
      online: online(true),
      getAccount: () => Promise.resolve({ accountId: "roy-7k3f", name: "Roy" }),
      currentUid: () => "roy-uid",
      observeAccount(listener) {
        listener({ accountId: "roy-7k3f", name: "Roy" });
        return () => {};
      },
    });
    stop = api.observeSharedClubs((clubs) => reported.push(clubs));
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps trying to list the rows of a Club that isn't on the server yet, for as long as it takes", async () => {
    // Created offline: the Club's own write is still waiting to be sent.
    serverClub = () => Promise.reject({ code: "permission-denied" });
    active(MEMBERS)[0]!.next(membersSnapshotWith(true, "c1"));

    // The server refuses the rows of a Club it doesn't know yet, again and again.
    for (let attempt = 0; attempt < 12; attempt++) {
      const current = active(ROWS);
      expect(current).toHaveLength(1);
      current[0]!.error(refused);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    // Nothing was reported without the Club (that would wipe it from the device).
    expect(reported).toEqual([]);

    // Once the Club's write lands, a try works and the Club shows up with its rows.
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));
    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1"]);
    expect(reported.at(-1)?.[0]?.players.map((player) => player.name)).toEqual(["Ana"]);
  });

  it("tries again at once when the Club's own write is confirmed", async () => {
    active(MEMBERS)[0]!.next(membersSnapshotWith(true, "c1"));
    active(ROWS)[0]!.error(refused);
    await vi.advanceTimersByTimeAsync(0);
    expect(active(ROWS)).toHaveLength(0);

    // The server has the Club now: a metadata-only change of the Clubs listener says so.
    active(MEMBERS)[0]!.next(membersSnapshotWith(false, "c1"));
    expect(active(ROWS)).toHaveLength(1);
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));
    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1"]);
  });

  it("drops a Club the server no longer lets this Account see", async () => {
    active(MEMBERS)[0]!.next(membersSnapshot("c1", "c2"));
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));
    active("clubs/c2/players")[0]!.next(rowsSnapshot(["Bo"]));

    // An Organizer took this Account off c1: its rows are refused, and so is the Club's record.
    serverClub = (key) =>
      key === "clubs/c1"
        ? Promise.reject({ code: "permission-denied" })
        : Promise.resolve({ exists: () => true });
    active(ROWS)[0]!.error(refused);
    await vi.advanceTimersByTimeAsync(0);

    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c2"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(active(ROWS)).toHaveLength(0);
  });

  it("keeps a Club whose rows are refused while the server still shows it to this Account", async () => {
    active(MEMBERS)[0]!.next(membersSnapshot("c1"));
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));

    active(ROWS)[0]!.error(refused);
    await vi.advanceTimersByTimeAsync(300);

    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1"]);
    expect(active(ROWS)).toHaveLength(1);
  });

  it("waits longer between tries, up to about 30 seconds", async () => {
    active(MEMBERS)[0]!.next(membersSnapshot("c1"));
    const tries: number[] = [];
    let last = Date.now();
    for (let attempt = 0; attempt < 12; attempt++) {
      active(ROWS)[0]!.error(refused);
      const before = listeners.length;
      while (listeners.length === before) await vi.advanceTimersByTimeAsync(50);
      tries.push(Date.now() - last);
      last = Date.now();
    }
    expect(tries[0]).toBeLessThan(tries[4]!);
    expect(Math.max(...tries)).toBeLessThanOrEqual(30_050);
    expect(tries.at(-1)).toBeGreaterThanOrEqual(29_000);
  });

  it("keeps the rows a Club last had when its listener fails, and keeps reporting it", async () => {
    active(MEMBERS)[0]!.next(membersSnapshot("c1", "c2"));
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));
    active("clubs/c2/players")[0]!.next(rowsSnapshot(["Bo"]));
    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1", "c2"]);

    active(ROWS)[0]!.error(refused);
    await vi.advanceTimersByTimeAsync(300);
    // c1's listener started again; its old rows are still what is known until it answers.
    expect(active(ROWS)).toHaveLength(1);
    active(MEMBERS)[0]!.next(membersSnapshot("c1", "c2"));
    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1", "c2"]);
    expect(reported.at(-1)?.[0]?.players.map((player) => player.name)).toEqual(["Ana"]);
  });

  it("stops trying once the Club leaves the list or the observer stops", async () => {
    active(MEMBERS)[0]!.next(membersSnapshot("c1"));
    active(ROWS)[0]!.error(refused);

    active(MEMBERS)[0]!.next(membersSnapshot());
    const count = listeners.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listeners).toHaveLength(count);

    active(MEMBERS)[0]!.next(membersSnapshot("c3"));
    active("clubs/c3/players")[0]!.error(refused);
    stop();
    const afterStop = listeners.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(listeners).toHaveLength(afterStop);
  });

  it("starts the Clubs listener again after it fails", async () => {
    active(MEMBERS)[0]!.error({ code: "unavailable" });
    expect(active(MEMBERS)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(300);
    expect(active(MEMBERS)).toHaveLength(1);
    active(MEMBERS)[0]!.next(membersSnapshot("c1"));
    active(ROWS)[0]!.next(rowsSnapshot(["Ana"]));
    expect(reported.at(-1)?.map((club) => club.id)).toEqual(["c1"]);
  });
});

describe("settle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the server's answer on while it comes in time", async () => {
    await expect(settle(online(true), Promise.reject(refused), 50)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(settle(online(true), Promise.resolve(), 50)).resolves.toBeUndefined();
  });

  it("treats a write that never answers as queued once the time is up", async () => {
    vi.useFakeTimers();
    let done = false;
    const saved = settle(online(true), new Promise(() => {})).then(() => (done = true));

    await vi.advanceTimersByTimeAsync(SETTLE_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await saved;
    expect(done).toBe(true);
  });

  it("doesn't wait at all while offline", async () => {
    await expect(settle(online(false), new Promise(() => {}))).resolves.toBeUndefined();
  });
});
