// @vitest-environment node
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { eventually } from "../test/eventually.ts";
import { ACCOUNT_ID_ALPHABET } from "../domain/accountId.ts";
import { adminGetDoc, adminListDocs, adminSetDoc, clearEmulator } from "../test/emulatorAdmin.ts";
import { runSharedClubsContract } from "./backend.clubs.contract.ts";
import { runRolesContract } from "./backend.roles.contract.ts";
import { runDeleteAccountContract } from "./backend.deleteAccount.contract.ts";
import { runMakeSharedContract } from "./backend.makeShared.contract.ts";
import { runSessionsContract } from "./backend.sessions.contract.ts";
import { runBackendContract, type ContractOptions } from "./backend.contract.ts";
import type { Backend, BackendError, OnlineSource } from "./backend.ts";
import { createFirebaseBackend } from "./firebaseBackend.ts";
import { FIREBASE_EMULATOR_CONFIG } from "./firebaseEmulator.ts";

/**
 * The contract suites against the Firebase version, on the Auth and Firestore emulators.
 * Run with `pnpm test:firebase` (needs Java on PATH).
 */

beforeEach(async () => {
  await clearEmulator();
});

/** A connection the test switches on and off; the Firebase backend also cuts Firestore with it. */
function controllableOnline(initial: boolean) {
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

let devices = 0;

/** Wraps `backend` so every call waits for `ready` first (the contract creates devices synchronously). */
function afterReady(backend: Backend, ready: Promise<void>): Backend {
  const delayed = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(backend)) {
    if (key === "isOnline" || key === "observeOnline") delayed[key] = value;
    else if (key.startsWith("observe")) {
      // The listener is the last argument (some observers take a Club and a scope first).
      delayed[key] = (...args: unknown[]) => {
        const stop = ready.then(() =>
          (value as (...args: unknown[]) => () => void).apply(backend, args),
        );
        return () => void stop.then((unsubscribe) => unsubscribe());
      };
    } else {
      delayed[key] = async (...args: unknown[]) => {
        await ready;
        return (value as (...args: unknown[]) => unknown).apply(backend, args);
      };
    }
  }
  return delayed as unknown as Backend;
}

/** One simulated device: its own Firebase app (and so its own anonymous user). */
function createDevice(options: Partial<ContractOptions> = {}) {
  const { random = Math.random, takenAccountIds = [], online = true, account = null } = options;
  const connection = controllableOnline(true);

  // Seeding an existing Account with a chosen Account ID: make the random source pick its suffix.
  const seedSuffix = account ? account.accountId.slice(-4) : null;
  let seedCalls = 0;
  const seededRandom = () =>
    seedSuffix && seedCalls < 4
      ? (ACCOUNT_ID_ALPHABET.indexOf(seedSuffix[seedCalls++]!) + 0.5) / ACCOUNT_ID_ALPHABET.length
      : random();

  const backend = createFirebaseBackend(FIREBASE_EMULATOR_CONFIG, {
    emulator: true,
    appName: `device-${++devices}`,
    online: connection.source,
    persistentCache: false,
    random: seededRandom,
  });

  const ready = (async () => {
    for (const id of takenAccountIds) {
      await adminSetDoc(`accountIds/${id.toLowerCase()}`, { uid: "somebody-else" });
    }
    if (account) await backend.createAccount(account.name);
    if (!online) connection.set(false);
  })();

  return { backend: afterReady(backend, ready), setOnline: connection.set };
}

runBackendContract("Firebase emulator", (options) => createDevice(options).backend);
runSharedClubsContract("Firebase emulator", () => createDevice());
runRolesContract("Firebase emulator", () => ({ device: () => createDevice() }));
runSessionsContract("Firebase emulator", () => ({ device: () => createDevice() }));

describe("Firebase emulator: what reaches the server", () => {
  it("reserves the Account ID and writes the Account in one go", async () => {
    const { backend } = createDevice();
    const account = await backend.createAccount("Roy Smith");

    const reservation = await adminGetDoc(`accountIds/${account.accountId.toLowerCase()}`);
    const stored = await adminGetDoc(`accounts/${reservation!.uid as string}`);
    expect(stored).toMatchObject({ accountId: account.accountId, name: "Roy Smith" });
  });

  it("identifies people by uid: the Club's lists and every link hold the uid, and the Account ID for display", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const royUid = (await adminGetDoc(`accountIds/${royAccount.accountId.toLowerCase()}`))!
      .uid as string;
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    await roy.backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p-cat", name: "Cat", skill: "beginner" }],
    });
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid],
      organizerUids: [royUid],
    });

    await roy.backend.linkClubPlayer(
      "c1",
      "p-cat",
      anaAccount.accountId.toUpperCase(),
      "organizer",
    );
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid, anaUid],
      organizerUids: [royUid, anaUid],
    });
    expect((await adminGetDoc("clubs/c1/players/p-cat"))?.link).toEqual({
      accountId: anaAccount.accountId,
      uid: anaUid,
      role: "organizer",
    });
  });

  it("only finds an Account through a reservation that agrees with the Account", async () => {
    const roy = createDevice();
    await roy.backend.createAccount("Roy");
    const ana = createDevice();
    const anaAccount = await ana.backend.createAccount("Ana");
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    // A reservation for another Account ID that points at Ana doesn't make Ana findable by it.
    await adminSetDoc("accountIds/ghost-2222", { uid: anaUid });
    expect(await roy.backend.lookupAccount("ghost-2222")).toBeNull();
    expect(await roy.backend.lookupAccount(anaAccount.accountId)).toEqual(anaAccount);
  });

  it("lets somebody leave a Club whose lists have them but whose rows don't link them", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const uid = async (accountId: string) =>
      (await adminGetDoc(`accountIds/${accountId.toLowerCase()}`))!.uid as string;
    await adminSetDoc("clubs/c1", {
      name: "Tuesday",
      memberUids: [await uid(royAccount.accountId), await uid(anaAccount.accountId)],
      organizerUids: [await uid(royAccount.accountId)],
    });
    await adminSetDoc("clubs/c1/players/p-cat", { name: "Cat", skill: "beginner" });

    await ana.backend.leaveClub("c1");
    expect((await adminGetDoc("clubs/c1"))?.memberUids).toEqual([await uid(royAccount.accountId)]);

    // The only Organizer without a linked row still can't leave.
    const error = await roy.backend.leaveClub("c1").catch((caught: unknown) => caught);
    expect((error as BackendError).code).toBe("last-organizer");
  });

  it("sends changes made offline once the connection is back, the latest change to a row winning", async () => {
    const { backend, setOnline } = createDevice();
    await backend.createAccount("Roy");
    let seen = 0;
    const stop = backend.observeSharedClubs((clubs) => (seen = clubs.length));
    await eventually(() => expect(seen).toBe(0));
    await backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p1", name: "Ana", skill: "beginner" }],
    });
    await eventually(() => expect(seen).toBe(1));

    setOnline(false);
    await backend.updateClubPlayer("c1", "p1", { skill: "intermediate" });
    await backend.updateClubPlayer("c1", "p1", { skill: "advanced" });
    await backend.renameSharedClub("c1", "Friday");
    expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("beginner");
    expect((await adminGetDoc("clubs/c1"))?.name).toBe("Tuesday");

    setOnline(true);
    await eventually(async () => {
      expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("advanced");
      expect((await adminGetDoc("clubs/c1"))?.name).toBe("Friday");
    });
    stop();
  });
});

runMakeSharedContract("Firebase emulator", () => ({ device: () => createDevice() }));

describe("Firebase emulator: what reaches the server", () => {
  it("reserves the Account ID and writes the Account in one go", async () => {
    const { backend } = createDevice();
    const account = await backend.createAccount("Roy Smith");

    const reservation = await adminGetDoc(`accountIds/${account.accountId.toLowerCase()}`);
    const stored = await adminGetDoc(`accounts/${reservation!.uid as string}`);
    expect(stored).toMatchObject({ accountId: account.accountId, name: "Roy Smith" });
  });

  it("identifies people by uid: the Club's lists and every link hold the uid, and the Account ID for display", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const royUid = (await adminGetDoc(`accountIds/${royAccount.accountId.toLowerCase()}`))!
      .uid as string;
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    await roy.backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p-cat", name: "Cat", skill: "beginner" }],
    });
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid],
      organizerUids: [royUid],
    });

    await roy.backend.linkClubPlayer(
      "c1",
      "p-cat",
      anaAccount.accountId.toUpperCase(),
      "organizer",
    );
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid, anaUid],
      organizerUids: [royUid, anaUid],
    });
    expect((await adminGetDoc("clubs/c1/players/p-cat"))?.link).toEqual({
      accountId: anaAccount.accountId,
      uid: anaUid,
      role: "organizer",
    });
  });

  it("only finds an Account through a reservation that agrees with the Account", async () => {
    const roy = createDevice();
    await roy.backend.createAccount("Roy");
    const ana = createDevice();
    const anaAccount = await ana.backend.createAccount("Ana");
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    // A reservation for another Account ID that points at Ana doesn't make Ana findable by it.
    await adminSetDoc("accountIds/ghost-2222", { uid: anaUid });
    expect(await roy.backend.lookupAccount("ghost-2222")).toBeNull();
    expect(await roy.backend.lookupAccount(anaAccount.accountId)).toEqual(anaAccount);
  });

  it("lets somebody leave a Club whose lists have them but whose rows don't link them", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const uid = async (accountId: string) =>
      (await adminGetDoc(`accountIds/${accountId.toLowerCase()}`))!.uid as string;
    await adminSetDoc("clubs/c1", {
      name: "Tuesday",
      memberUids: [await uid(royAccount.accountId), await uid(anaAccount.accountId)],
      organizerUids: [await uid(royAccount.accountId)],
    });
    await adminSetDoc("clubs/c1/players/p-cat", { name: "Cat", skill: "beginner" });

    await ana.backend.leaveClub("c1");
    expect((await adminGetDoc("clubs/c1"))?.memberUids).toEqual([await uid(royAccount.accountId)]);

    // The only Organizer without a linked row still can't leave.
    const error = await roy.backend.leaveClub("c1").catch((caught: unknown) => caught);
    expect((error as BackendError).code).toBe("last-organizer");
  });

  it("sends changes made offline once the connection is back, the latest change to a row winning", async () => {
    const { backend, setOnline } = createDevice();
    await backend.createAccount("Roy");
    let seen = 0;
    const stop = backend.observeSharedClubs((clubs) => (seen = clubs.length));
    await eventually(() => expect(seen).toBe(0));
    await backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p1", name: "Ana", skill: "beginner" }],
    });
    await eventually(() => expect(seen).toBe(1));

    setOnline(false);
    await backend.updateClubPlayer("c1", "p1", { skill: "intermediate" });
    await backend.updateClubPlayer("c1", "p1", { skill: "advanced" });
    await backend.renameSharedClub("c1", "Friday");
    expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("beginner");
    expect((await adminGetDoc("clubs/c1"))?.name).toBe("Tuesday");

    setOnline(true);
    await eventually(async () => {
      expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("advanced");
      expect((await adminGetDoc("clubs/c1"))?.name).toBe("Friday");
    });
    stop();
  });
});

runDeleteAccountContract("Firebase emulator", () => ({ device: () => createDevice() }));

describe("Firebase emulator: what reaches the server", () => {
  it("reserves the Account ID and writes the Account in one go", async () => {
    const { backend } = createDevice();
    const account = await backend.createAccount("Roy Smith");

    const reservation = await adminGetDoc(`accountIds/${account.accountId.toLowerCase()}`);
    const stored = await adminGetDoc(`accounts/${reservation!.uid as string}`);
    expect(stored).toMatchObject({ accountId: account.accountId, name: "Roy Smith" });
  });

  it("identifies people by uid: the Club's lists and every link hold the uid, and the Account ID for display", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const royUid = (await adminGetDoc(`accountIds/${royAccount.accountId.toLowerCase()}`))!
      .uid as string;
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    await roy.backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p-cat", name: "Cat", skill: "beginner" }],
    });
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid],
      organizerUids: [royUid],
    });

    await roy.backend.linkClubPlayer(
      "c1",
      "p-cat",
      anaAccount.accountId.toUpperCase(),
      "organizer",
    );
    expect(await adminGetDoc("clubs/c1")).toMatchObject({
      memberUids: [royUid, anaUid],
      organizerUids: [royUid, anaUid],
    });
    expect((await adminGetDoc("clubs/c1/players/p-cat"))?.link).toEqual({
      accountId: anaAccount.accountId,
      uid: anaUid,
      role: "organizer",
    });
  });

  it("only finds an Account through a reservation that agrees with the Account", async () => {
    const roy = createDevice();
    await roy.backend.createAccount("Roy");
    const ana = createDevice();
    const anaAccount = await ana.backend.createAccount("Ana");
    const anaUid = (await adminGetDoc(`accountIds/${anaAccount.accountId.toLowerCase()}`))!
      .uid as string;

    // A reservation for another Account ID that points at Ana doesn't make Ana findable by it.
    await adminSetDoc("accountIds/ghost-2222", { uid: anaUid });
    expect(await roy.backend.lookupAccount("ghost-2222")).toBeNull();
    expect(await roy.backend.lookupAccount(anaAccount.accountId)).toEqual(anaAccount);
  });

  it("lets somebody leave a Club whose lists have them but whose rows don't link them", async () => {
    const roy = createDevice();
    const ana = createDevice();
    const royAccount = await roy.backend.createAccount("Roy");
    const anaAccount = await ana.backend.createAccount("Ana");
    const uid = async (accountId: string) =>
      (await adminGetDoc(`accountIds/${accountId.toLowerCase()}`))!.uid as string;
    await adminSetDoc("clubs/c1", {
      name: "Tuesday",
      memberUids: [await uid(royAccount.accountId), await uid(anaAccount.accountId)],
      organizerUids: [await uid(royAccount.accountId)],
    });
    await adminSetDoc("clubs/c1/players/p-cat", { name: "Cat", skill: "beginner" });

    await ana.backend.leaveClub("c1");
    expect((await adminGetDoc("clubs/c1"))?.memberUids).toEqual([await uid(royAccount.accountId)]);

    // The only Organizer without a linked row still can't leave.
    const error = await roy.backend.leaveClub("c1").catch((caught: unknown) => caught);
    expect((error as BackendError).code).toBe("last-organizer");
  });

  it("sends changes made offline once the connection is back, the latest change to a row winning", async () => {
    const { backend, setOnline } = createDevice();
    await backend.createAccount("Roy");
    let seen = 0;
    const stop = backend.observeSharedClubs((clubs) => (seen = clubs.length));
    await eventually(() => expect(seen).toBe(0));
    await backend.createSharedClub({
      id: "c1",
      name: "Tuesday",
      players: [{ id: "p1", name: "Ana", skill: "beginner" }],
    });
    await eventually(() => expect(seen).toBe(1));

    setOnline(false);
    await backend.updateClubPlayer("c1", "p1", { skill: "intermediate" });
    await backend.updateClubPlayer("c1", "p1", { skill: "advanced" });
    await backend.renameSharedClub("c1", "Friday");
    expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("beginner");
    expect((await adminGetDoc("clubs/c1"))?.name).toBe("Tuesday");

    setOnline(true);
    await eventually(async () => {
      expect((await adminGetDoc("clubs/c1/players/p1"))?.skill).toBe("advanced");
      expect((await adminGetDoc("clubs/c1"))?.name).toBe("Friday");
    });
    stop();
  });

  it("deleting the Account keeps its Account ID reserved for good, and takes a Club it was alone on, with its history, off the server", async () => {
    const roy = createDevice();
    const account = await roy.backend.createAccount("Roy");
    await roy.backend.createSharedClub({
      id: "solo",
      name: "Solo",
      players: [{ id: "p-cat", name: "Cat", skill: "beginner" }],
    });
    for (const id of ["a", "b", "c"]) {
      await adminSetDoc(`clubs/solo/endedSessions/${id}`, {
        hostUid: "x",
        endedAt: 1,
        endedJson: "{}",
      });
    }
    const uid = (await adminGetDoc(`accountIds/${account.accountId.toLowerCase()}`))!.uid as string;

    await roy.backend.deleteAccount({ deleteClubIds: ["solo"], unlinkClubIds: [] });

    expect(await adminGetDoc("clubs/solo")).toBeNull();
    expect(await adminListDocs("clubs/solo/players")).toEqual([]);
    expect(await adminListDocs("clubs/solo/endedSessions")).toEqual([]);
    expect(await adminGetDoc(`accounts/${uid}`)).toBeNull();
    // The reservation stays: the Account ID is never given out again.
    expect(await adminGetDoc(`accountIds/${account.accountId.toLowerCase()}`)).toEqual({ uid });
  });
});
