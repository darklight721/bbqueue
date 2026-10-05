import type { Club } from "../domain/types.ts";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { runSharedClubsContract } from "./backend.clubs.contract.ts";
import { runRolesContract } from "./backend.roles.contract.ts";
import { runDeleteAccountContract } from "./backend.deleteAccount.contract.ts";
import { runMakeSharedContract } from "./backend.makeShared.contract.ts";
import { runSessionsContract } from "./backend.sessions.contract.ts";
import { runBackendContract } from "./backend.contract.ts";
import type { OnlineSource } from "./backend.ts";
import { FAKE_BACKEND_KEYS, createLocalFakeBackend } from "./localFakeBackend.ts";

beforeEach(() => {
  localStorage.clear();
});

runBackendContract("local fake", ({ online, ...options }) =>
  createLocalFakeBackend({
    ...options,
    online: { get: () => online, subscribe: () => () => {} },
  }),
);

/** A connection the test switches on and off. */
function controllableOnline(initial = true) {
  let online = initial;
  const listeners = new Set<(online: boolean) => void>();
  const source: OnlineSource = {
    get: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    source,
    set: (next: boolean) => {
      online = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

runSharedClubsContract("local fake", () => {
  const connection = controllableOnline();
  return {
    backend: createLocalFakeBackend({ online: connection.source }),
    setOnline: connection.set,
  };
});

runRolesContract("local fake", () => {
  let devices = 0;
  return {
    device() {
      const connection = controllableOnline();
      const backend = createLocalFakeBackend({
        online: connection.source,
        deviceSuffix: `:device-${++devices}`,
      });
      return { backend, setOnline: connection.set };
    },
  };
});

runSessionsContract("local fake", () => {
  let devices = 0;
  return {
    device() {
      const connection = controllableOnline();
      const backend = createLocalFakeBackend({
        online: connection.source,
        deviceSuffix: `:device-${++devices}`,
      });
      return { backend, setOnline: connection.set };
    },
  };
});

runMakeSharedContract("local fake", () => {
  let devices = 0;
  return {
    device() {
      const connection = controllableOnline();
      const backend = createLocalFakeBackend({
        online: connection.source,
        deviceSuffix: `:device-${++devices}`,
      });
      return { backend, setOnline: connection.set };
    },
  };
});

runDeleteAccountContract("local fake", () => {
  let devices = 0;
  return {
    device() {
      const connection = controllableOnline();
      const backend = createLocalFakeBackend({
        online: connection.source,
        deviceSuffix: `:device-${++devices}`,
      });
      return { backend, setOnline: connection.set };
    },
  };
});

describe("local fake Shared clubs", () => {
  const seeded = {
    id: "c1",
    name: "Seeded",
    players: [
      {
        id: "p1",
        name: "Ana",
        skill: "beginner",
        link: { accountId: "ana-2222", role: "organizer" },
      },
    ],
  };

  it("shows seeded Clubs to the linked Account only", async () => {
    localStorage.setItem(FAKE_BACKEND_KEYS.clubs, JSON.stringify([seeded]));
    localStorage.setItem(
      FAKE_BACKEND_KEYS.account,
      JSON.stringify({ accountId: "ANA-2222", name: "Ana" }),
    );
    const seen: string[][] = [];
    createLocalFakeBackend().observeSharedClubs((clubs) => seen.push(clubs.map((c) => c.name)))();

    localStorage.setItem(
      FAKE_BACKEND_KEYS.account,
      JSON.stringify({ accountId: "ben-3333", name: "Ben" }),
    );
    createLocalFakeBackend().observeSharedClubs((clubs) => seen.push(clubs.map((c) => c.name)))();

    expect(seen).toEqual([["Seeded"], []]);
  });

  it("keeps edits made offline across a reload and sends them once back online", async () => {
    const connection = controllableOnline();
    const backend = createLocalFakeBackend({ online: connection.source });
    await backend.createAccount("Roy");
    await backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p1", name: "Ana", skill: "beginner" }],
    });
    connection.set(false);
    await backend.updateClubPlayer("c1", "p1", { skill: "advanced" });

    const server = () => JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.clubs)!) as Club[];
    expect(server()[0]!.players.find((p) => p.id === "p1")!.skill).toBe("beginner");
    expect(JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.pendingClubOps)!)).toHaveLength(1);

    // Reload while offline: the new backend still shows the waiting change.
    const offlineAgain = controllableOnline(false);
    const reloaded = createLocalFakeBackend({ online: offlineAgain.source });
    let seen: Club[] = [];
    reloaded.observeSharedClubs((clubs) => (seen = clubs));
    expect(seen[0]!.players.find((p) => p.id === "p1")!.skill).toBe("advanced");

    offlineAgain.set(true);

    expect(server()[0]!.players.find((p) => p.id === "p1")!.skill).toBe("advanced");
    expect(localStorage.getItem(FAKE_BACKEND_KEYS.pendingClubOps)).toBe("[]");
    expect(seen[0]!.players.find((p) => p.id === "p1")!.skill).toBe("advanced");
  });
});

describe("local fake Backend", () => {
  it("keeps the Account in localStorage, so it survives a reload", async () => {
    const account = await createLocalFakeBackend().createAccount("Roy");

    expect(JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.account)!)).toEqual(account);
    expect(await createLocalFakeBackend().getCurrentAccount()).toEqual(account);
  });

  it("keeps Account IDs reserved across reloads", async () => {
    const { accountId } = await createLocalFakeBackend().createAccount("Roy");

    expect(JSON.parse(localStorage.getItem(FAKE_BACKEND_KEYS.accountIds)!)).toEqual([accountId]);
  });

  it("follows navigator.onLine by default", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      const backend = createLocalFakeBackend();
      expect(backend.isOnline()).toBe(false);
      await expect(backend.createAccount("Roy")).rejects.toMatchObject({ code: "offline" });
    } finally {
      Reflect.deleteProperty(navigator, "onLine");
    }
    expect(createLocalFakeBackend().isOnline()).toBe(true);
  });
});
