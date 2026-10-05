import { afterEach, describe, expect, it } from "vite-plus/test";
import type { Club, ClubPlayer } from "../domain/types.ts";
import { resetStoreForTests, setAccount } from "../storage/store.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError } from "./backend.ts";
import { saveClub } from "./clubs.ts";
import { createInMemoryBackend, createInMemoryServer } from "./inMemoryBackend.ts";
import { setBackendForTests } from "./index.ts";

// Saving a Shared club with Accounts unlinked from rows: an Organizer unlinks a live Account (a
// Player or another Organizer), like Leave club does it for oneself.

const cat: ClubPlayer = { id: "p-cat", name: "Cat", skill: "beginner" };
const dan: ClubPlayer = { id: "p-dan", name: "Dan", skill: "advanced" };

let stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

async function setup() {
  localStorage.clear();
  resetStoreForTests();
  const server = createInMemoryServer();
  const roy = createInMemoryBackend({ server });
  const ana = createInMemoryBackend({ server });
  const ben = createInMemoryBackend({ server });
  const royAccount = await roy.createAccount("Roy");
  const anaAccount = await ana.createAccount("Ana");
  const benAccount = await ben.createAccount("Ben");
  setBackendForTests(roy);
  setAccount(royAccount);

  const latest = new Map<string, Club[]>();
  for (const [name, backend] of [
    ["roy", roy],
    ["ana", ana],
    ["ben", ben],
  ] as const) {
    stops.push(backend.observeSharedClubs((clubs) => latest.set(name, clubs)));
  }
  const clubOf = (who: string) => latest.get(who)?.find((club) => club.id === "c1");

  await roy.createSharedClub({ id: "c1", name: "Tuesday", players: [cat, dan] });
  await eventually(() => expect(clubOf("roy")).toBeDefined());
  return { roy, ana, ben, anaAccount, benAccount, clubOf };
}

/** `club` with the rows changed by `edit`. */
const edited = (club: Club, edit: (rows: ClubPlayer[]) => ClubPlayer[]): Club => ({
  ...club,
  players: edit(club.players),
});

/** The row with its link taken off, as the Club form's Unlink does. */
const unlinked = ({ link: _link, ...row }: ClubPlayer): ClubPlayer => row;

async function rejection(promise: Promise<unknown>): Promise<BackendError> {
  try {
    await promise;
  } catch (error) {
    return error as BackendError;
  }
  throw new Error("Expected the call to be rejected");
}

describe("saveClub: unlinking a live Account", () => {
  it("takes a Player off the Club like leaving does, and keeps the row, unlinked", async () => {
    const { roy, anaAccount, clubOf } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "player");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    const before = clubOf("roy")!;

    await saveClub(
      before,
      edited(before, (rows) => rows.map((row) => (row.id === cat.id ? unlinked(row) : row))),
    );

    await eventually(() => expect(clubOf("ana")).toBeUndefined());
    await eventually(() =>
      expect(clubOf("roy")?.players.find((p) => p.id === cat.id)).toEqual(cat),
    );
  });

  it("takes another Organizer off the Club too, leaving the editing Organizer", async () => {
    const { roy, anaAccount, clubOf, ana } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "organizer");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    const before = clubOf("roy")!;

    await saveClub(
      before,
      edited(before, (rows) => rows.map((row) => (row.id === cat.id ? unlinked(row) : row))),
    );

    await eventually(() => expect(clubOf("ana")).toBeUndefined());
    expect((await rejection(ana.renameSharedClub("c1", "Mine"))).code).toBe("not-found");
    expect(
      clubOf("roy")
        ?.players.filter((p) => p.link?.role === "organizer")
        .map((p) => p.link?.accountId),
    ).toHaveLength(1);
    await roy.renameSharedClub("c1", "Friday");
  });

  it("can move an Account from one row to another in one Save", async () => {
    const { roy, anaAccount, clubOf } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "player");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    const before = clubOf("roy")!;
    const link = before.players.find((p) => p.id === cat.id)!.link!;

    await saveClub(
      before,
      edited(before, (rows) =>
        rows.map((row) =>
          row.id === cat.id ? unlinked(row) : row.id === dan.id ? { ...row, link } : row,
        ),
      ),
    );

    await eventually(() =>
      expect(clubOf("roy")?.players.find((p) => p.id === dan.id)?.link).toEqual(link),
    );
    expect(clubOf("roy")?.players.find((p) => p.id === cat.id)?.link).toBeUndefined();
    // Still on the Club: the move didn't take Ana off it.
    await eventually(() =>
      expect(clubOf("ana")?.players.find((p) => p.id === dan.id)?.link).toEqual(link),
    );
  });

  it("refuses unlinking the only Organizer and leaves the Club as it was", async () => {
    const { roy, clubOf } = await setup();
    const before = clubOf("roy")!;

    const error = await rejection(
      saveClub(
        before,
        edited(before, (rows) =>
          rows.map((row) => (row.link?.role === "organizer" ? unlinked(row) : row)),
        ),
      ),
    );

    expect(error.code).toBe("last-organizer");
    expect(clubOf("roy")?.players.filter((p) => p.link?.role === "organizer")).toHaveLength(1);
    await roy.renameSharedClub("c1", "Still mine");
  });

  it("lets an Organizer hand the Club to someone and unlink themselves in one Save", async () => {
    const { roy, anaAccount, clubOf } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "player");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    const before = clubOf("roy")!;

    await saveClub(
      before,
      edited(before, (rows) =>
        rows.map((row) =>
          row.id === cat.id && row.link
            ? { ...row, link: { ...row.link, role: "organizer" as const } }
            : row.link?.role === "organizer"
              ? unlinked(row)
              : row,
        ),
      ),
    );

    await eventually(() => expect(clubOf("roy")).toBeUndefined());
    await eventually(() => expect(clubOf("ana")).toBeDefined());
  });

  it("refuses a Player unlinking somebody else", async () => {
    const { roy, ana, anaAccount, benAccount, clubOf } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "player");
    await roy.linkClubPlayer("c1", dan.id, benAccount.accountId, "player");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    setBackendForTests(ana);
    setAccount(anaAccount);
    const before = clubOf("ana")!;

    const error = await rejection(
      saveClub(
        before,
        edited(before, (rows) => rows.map((row) => (row.id === dan.id ? unlinked(row) : row))),
      ),
    );

    expect(error.code).toBe("forbidden");
    expect(clubOf("roy")?.players.find((p) => p.id === dan.id)?.link?.accountId).toBe(
      benAccount.accountId,
    );
  });

  it("fails cleanly, still on the Club, when an Organizer removes their own row and links themselves to another", async () => {
    const { roy, anaAccount, clubOf } = await setup();
    await roy.linkClubPlayer("c1", cat.id, anaAccount.accountId, "organizer");
    await eventually(() => expect(clubOf("ana")).toBeDefined());
    const before = clubOf("roy")!;
    const mine = before.players.find((p) => p.link && p.id !== cat.id && p.name === "Roy")!;
    const link = mine.link!;

    const error = await rejection(
      saveClub(
        before,
        edited(before, (rows) =>
          rows
            .filter((row) => row.id !== mine.id)
            .map((row) => (row.id === dan.id ? { ...row, link } : row)),
        ),
      ),
    );

    expect(error.code).toBe("already-linked");
    expect(clubOf("roy")?.players.find((p) => p.id === mine.id)?.link).toEqual(link);
    await roy.renameSharedClub("c1", "Still mine");
  });
});
