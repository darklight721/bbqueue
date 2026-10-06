import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { BackendError, type Backend } from "../../backend/backend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import type { Club, EndedSession } from "../../domain/types.ts";
import {
  addEndedSession,
  applyEndedSessionsReport,
  getEndedSessions,
  getSharedEndedSessions,
  resetStoreForTests,
  setLocalClubs,
  setSharedClubs,
} from "../../storage/store.ts";
import { deleteEndedSession } from "./deleteEndedSession.ts";

const ended = (id: string, clubId: string | null, endedAt = 1000): EndedSession => ({
  id,
  name: id,
  clubId,
  clubName: null,
  pointSystem: 21,
  startedAt: endedAt - 1,
  endedAt,
  players: [],
  matches: [],
});

const shared: Club = { id: "c1", name: "Shared", kind: "shared", players: [] };
const local: Club = { id: "loc", name: "Local", kind: "local", players: [] };

let remove: ReturnType<typeof vi.fn<Backend["deleteEndedSession"]>>;

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  remove = vi.fn<Backend["deleteEndedSession"]>().mockResolvedValue(undefined);
  setBackendForTests({ deleteEndedSession: remove } as unknown as Backend);
  setLocalClubs([local]);
  setSharedClubs([shared]);
});

afterEach(() => setBackendForTests(null));

const ids = () => getEndedSessions().map((e) => e.id);

describe("deleteEndedSession", () => {
  it("removes one with no Club from the device, without the Backend", async () => {
    addEndedSession(ended("a", null));
    addEndedSession(ended("b", null, 2000));

    await deleteEndedSession(ended("a", null));

    expect(ids()).toEqual(["b"]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes one of a Local club from the device, also with no Backend at all", async () => {
    setBackendForTests(null);
    addEndedSession(ended("a", "loc"));

    await deleteEndedSession(ended("a", "loc"));

    expect(ids()).toEqual([]);
  });

  it("removes one of a Club that isn't on the device (any more) from the device only", async () => {
    addEndedSession(ended("a", "gone"));

    await deleteEndedSession(ended("a", "gone"));

    expect(ids()).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes one of a Shared club on the server first, then from the cache", async () => {
    applyEndedSessionsReport({
      sessions: [ended("a", "c1", 1), ended("b", "c1", 2)],
      clubIds: ["c1"],
    });
    remove.mockImplementation(() => {
      // Nothing is removed until the server has answered.
      expect(ids()).toEqual(["b", "a"]);
      return Promise.resolve();
    });

    await deleteEndedSession(ended("a", "c1", 1));

    expect(remove).toHaveBeenCalledWith("c1", "a");
    expect(ids()).toEqual(["b"]);
    expect(getSharedEndedSessions().map((e) => e.id)).toEqual(["b"]);
  });

  it("also removes the device's own copy of a Shared club's session it hosted", async () => {
    addEndedSession(ended("hosted", "c1", 3000));
    addEndedSession(ended("mine", null, 2000));

    await deleteEndedSession(ended("hosted", "c1", 3000));

    expect(remove).toHaveBeenCalledWith("c1", "hosted");
    expect(ids()).toEqual(["mine"]);
  });

  it.each(["offline", "forbidden", "not-found", "failed"] as const)(
    "throws and removes nothing when the server says %s",
    async (code) => {
      addEndedSession(ended("hosted", "c1", 3000));
      applyEndedSessionsReport({ sessions: [ended("theirs", "c1", 1)], clubIds: ["c1"] });
      remove.mockRejectedValue(new BackendError(code));

      await expect(deleteEndedSession(ended("hosted", "c1", 3000))).rejects.toMatchObject({
        code,
      });
      await expect(deleteEndedSession(ended("theirs", "c1", 1))).rejects.toMatchObject({ code });

      expect(ids()).toEqual(["hosted", "theirs"]);
    },
  );

  it("throws and removes nothing when a Shared club's session is deleted with no Backend", async () => {
    setBackendForTests(null);
    addEndedSession(ended("hosted", "c1", 3000));

    await expect(deleteEndedSession(ended("hosted", "c1", 3000))).rejects.toBeInstanceOf(
      BackendError,
    );

    expect(ids()).toEqual(["hosted"]);
  });
});
