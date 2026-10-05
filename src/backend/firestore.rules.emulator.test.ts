// @vitest-environment node
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import rules from "../../firestore.rules?raw";
import { afterAll, beforeAll, beforeEach, describe, it } from "vite-plus/test";
import { MAX_NAME_LENGTH } from "../domain/validation.ts";
import { FIREBASE_EMULATOR } from "./firebaseEmulator.ts";

/**
 * Security Rules (`firestore.rules`) on the Firestore emulator. Run with `pnpm test:firebase`.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: FIREBASE_EMULATOR.projectId,
    firestore: {
      rules,
      host: FIREBASE_EMULATOR.firestoreHost,
      port: FIREBASE_EMULATOR.firestorePort,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

type Firestore = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;
const as = (uid: string): Firestore => env.authenticatedContext(uid).firestore();
const anonymous = (): Firestore => env.unauthenticatedContext().firestore();

/** Write documents with the rules out of the way. */
async function seed(write: (db: Firestore) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (context) => write(context.firestore()));
}

const ROY = { uid: "roy-uid", accountId: "roy-7k3f", name: "Roy" };
const ANA = { uid: "ana-uid", accountId: "ana-2222", name: "Ana" };
const BEN = { uid: "ben-uid", accountId: "ben-3333", name: "Ben" };
type Person = typeof ROY;

/** A link as the app writes it: the Account ID for display, the uid as the identity. */
const link = (person: Person, role: "organizer" | "player") => ({
  accountId: person.accountId,
  uid: person.uid,
  role,
});

async function seedAccounts(...people: Person[]) {
  await seed(async (db) => {
    for (const person of people) {
      await setDoc(doc(db, "accounts", person.uid), {
        accountId: person.accountId,
        name: person.name,
      });
      await setDoc(doc(db, "accountIds", person.accountId), { uid: person.uid });
    }
  });
}

/** Create an Account the way the app does: the reservation and the Account in one batch. */
function signUp(person: Person, accountId = person.accountId, extra: Record<string, unknown> = {}) {
  const db = as(person.uid);
  const batch = writeBatch(db);
  batch.set(doc(db, "accountIds", accountId.toLowerCase()), { uid: person.uid });
  batch.set(doc(db, "accounts", person.uid), {
    accountId,
    name: person.name,
    createdAt: serverTimestamp(),
    ...extra,
  });
  return batch.commit();
}

describe("Account rules", () => {
  it("lets a person create their own Account together with its Account ID record", async () => {
    await assertSucceeds(signUp(ROY, "Roy-7K3F"));
  });

  it("refuses an Account without its Account ID record", async () => {
    const db = as(ROY.uid);
    await assertFails(
      setDoc(doc(db, "accounts", ROY.uid), {
        accountId: ROY.accountId,
        name: "Roy",
        createdAt: serverTimestamp(),
      }),
    );
  });

  it("refuses an Account for somebody else", async () => {
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", ROY.accountId), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ANA.uid), {
      accountId: ROY.accountId,
      name: "Roy",
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it("refuses an Account whose createdAt isn't the time of the write, or that has other fields", async () => {
    await assertFails(signUp(ROY, ROY.accountId, { createdAt: new Date("2020-01-01") }));
    await assertFails(signUp(ROY, ROY.accountId, { isAdmin: true }));
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", ROY.accountId), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ROY.uid), { accountId: ROY.accountId, name: "Roy" });
    await assertFails(batch.commit());
  });

  it("refuses an Account ID record that names somebody else, or isn't lowercase", async () => {
    const db = as(ROY.uid);
    await assertFails(setDoc(doc(db, "accountIds", "roy-7k3f"), { uid: ANA.uid }));
    await assertFails(setDoc(doc(db, "accountIds", "Roy-7K3F"), { uid: ROY.uid }));
  });

  it("never lets an Account ID record be overwritten", async () => {
    await seedAccounts(ROY);
    await assertFails(setDoc(doc(as(ROY.uid), "accountIds", ROY.accountId), { uid: ROY.uid }));
    await assertFails(setDoc(doc(as(ANA.uid), "accountIds", ROY.accountId), { uid: ANA.uid }));
  });

  it("never lets an Account ID be released: the owner can't delete the reservation, not even without an Account", async () => {
    await seedAccounts(ROY);
    await assertFails(deleteDoc(doc(as(ROY.uid), "accountIds", ROY.accountId)));
    await assertFails(deleteDoc(doc(as(ANA.uid), "accountIds", ROY.accountId)));
    await assertSucceeds(deleteDoc(doc(as(ROY.uid), "accounts", ROY.uid)));
    await assertFails(deleteDoc(doc(as(ROY.uid), "accountIds", ROY.accountId)));
  });

  it("keeps a second person from reserving an Account ID that is taken, even after its Account is gone", async () => {
    await seedAccounts(ROY);
    await assertFails(signUp({ ...ANA, name: "Ana" }, ROY.accountId));
    await seed(async (db) => {
      await deleteDoc(doc(db, "accounts", ROY.uid));
    });
    await assertFails(signUp(ANA, ROY.accountId));
  });

  it("gives a person one Account ID: they can't reserve a second one", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    // A second reservation next to the existing Account…
    await assertFails(setDoc(doc(db, "accountIds", "roy-9999"), { uid: ROY.uid }));
    // …or with a new Account record replacing it.
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", "roy-9999"), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ROY.uid), {
      accountId: "roy-9999",
      name: "Roy",
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it("refuses a reservation that isn't the Account ID of the Account written with it", async () => {
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", "roy-9999"), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ROY.uid), {
      accountId: ROY.accountId,
      name: "Roy",
      createdAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it("lets only the owner change their name, and nothing else", async () => {
    await seedAccounts(ROY, ANA);
    const own = doc(as(ROY.uid), "accounts", ROY.uid);
    await assertSucceeds(updateDoc(own, { name: "Royston" }));
    await assertFails(updateDoc(own, { accountId: "roy-9999" }));
    await assertFails(updateDoc(own, { createdAt: serverTimestamp() }));
    await assertFails(updateDoc(own, { name: "Roy", isAdmin: true }));
    await assertFails(updateDoc(doc(as(ANA.uid), "accounts", ROY.uid), { name: "Mine now" }));
  });

  it("keeps names to a sensible length", async () => {
    await assertSucceeds(signUp({ ...ROY, name: "x".repeat(MAX_NAME_LENGTH) }));
    await assertFails(signUp({ ...ANA, name: "x".repeat(MAX_NAME_LENGTH + 1) }));
    await assertFails(signUp({ ...BEN, name: "" }));
    const own = doc(as(ROY.uid), "accounts", ROY.uid);
    await assertFails(updateDoc(own, { name: "x".repeat(MAX_NAME_LENGTH + 1) }));
    await assertFails(updateDoc(own, { name: "" }));
  });

  it("refuses names with control, bidi or zero-width characters, and keeps letters, accents and emoji", async () => {
    const invisible = ["Ro\u200Bb", "\u202EAna", "Ben\u0007", "\uFEFFCat", "Dan\u200D", "A\nB"];
    for (const name of invisible) await assertFails(signUp({ ...ANA, name }));
    await assertSucceeds(signUp({ ...ROY, name: "José Núñez 🏸" }));
    const own = doc(as(ROY.uid), "accounts", ROY.uid);
    await assertFails(updateDoc(own, { name: "Roy\u200B" }));
    await assertFails(updateDoc(own, { name: "\u202Eyor" }));
    await assertSucceeds(updateDoc(own, { name: "Zoë" }));
  });

  it("lets anyone signed in look an Account up one at a time, but not list them", async () => {
    await seedAccounts(ROY, ANA);
    await assertSucceeds(getDoc(doc(as(ANA.uid), "accounts", ROY.uid)));
    await assertSucceeds(getDoc(doc(as(ANA.uid), "accountIds", ROY.accountId)));
    await assertFails(getDoc(doc(anonymous(), "accounts", ROY.uid)));
    await assertFails(getDocs(collection(as(ANA.uid), "accounts")));
    await assertFails(getDocs(collection(as(ANA.uid), "accountIds")));
  });

  it("lets only the owner delete their Account", async () => {
    await seedAccounts(ROY, ANA);
    await assertFails(deleteDoc(doc(as(ANA.uid), "accounts", ROY.uid)));
    await assertSucceeds(deleteDoc(doc(as(ROY.uid), "accounts", ROY.uid)));
  });
});

/** A Shared club `c1` that Roy created, plus Ana linked as a Player and a plain row. */
async function seedClub() {
  await seedAccounts(ROY, ANA, BEN);
  await seed(async (db) => {
    await setDoc(doc(db, "clubs", "c1"), {
      name: "Tuesday",
      memberUids: [ROY.uid, ANA.uid],
      organizerUids: [ROY.uid],
    });
    await setDoc(doc(db, "clubs", "c1", "players", "p-roy"), {
      name: "Roy",
      skill: "intermediate",
      link: link(ROY, "organizer"),
    });
    await setDoc(doc(db, "clubs", "c1", "players", "p-ana"), {
      name: "Ana",
      skill: "beginner",
      link: link(ANA, "player"),
    });
    await setDoc(doc(db, "clubs", "c1", "players", "p-cat"), { name: "Cat", skill: "advanced" });
  });
}

describe("Shared club rules", () => {
  it("lets a person with an Account create a Club as its only member and Organizer", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "clubs", "c1"), {
      name: "Tuesday",
      memberUids: [ROY.uid],
      organizerUids: [ROY.uid],
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "clubs", "c1", "players", "p-roy"), {
      name: "Roy",
      skill: "intermediate",
      link: link(ROY, "organizer"),
    });
    await assertSucceeds(batch.commit());
  });

  it("refuses a Club without its creator as member and Organizer, or with an Organizer who isn't a member", async () => {
    await seedAccounts(ROY, ANA);
    const db = as(ROY.uid);
    const record = (memberUids: string[], organizerUids: string[]) => ({
      name: "Tuesday",
      memberUids,
      organizerUids,
      createdAt: serverTimestamp(),
    });
    // Somebody else's Club.
    await assertFails(setDoc(doc(db, "clubs", "c1"), record([ANA.uid], [ANA.uid])));
    // The creator as member only, or as Organizer only.
    await assertFails(setDoc(doc(db, "clubs", "c1"), record([ROY.uid, ANA.uid], [ANA.uid])));
    await assertFails(setDoc(doc(db, "clubs", "c1"), record([ANA.uid], [ROY.uid, ANA.uid])));
    // An Organizer who isn't a member.
    await assertFails(setDoc(doc(db, "clubs", "c1"), record([ROY.uid], [ROY.uid, ANA.uid])));
    // Lists that aren't lists.
    await assertFails(setDoc(doc(db, "clubs", "c1"), record(ROY.uid as never, [ROY.uid])));
    await assertSucceeds(setDoc(doc(db, "clubs", "c1"), record([ROY.uid, ANA.uid], [ROY.uid])));
  });

  it("refuses a Club whose creation time isn't the server's, or that leaves it out", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    const record = (extra: Record<string, unknown> = {}) => ({
      name: "Tuesday",
      memberUids: [ROY.uid],
      organizerUids: [ROY.uid],
      createdAt: serverTimestamp(),
      ...extra,
    });
    // A date far in the future would keep the creator's import window open for good.
    await assertFails(
      setDoc(doc(db, "clubs", "c1"), record({ createdAt: new Date("2100-01-01") })),
    );
    await assertFails(setDoc(doc(db, "clubs", "c1"), record({ createdAt: new Date(0) })));
    const { createdAt: _createdAt, ...withoutTime } = record();
    await assertFails(setDoc(doc(db, "clubs", "c1"), withoutTime));
    await assertFails(setDoc(doc(db, "clubs", "c1"), record({ extra: 1 })));
    await assertSucceeds(setDoc(doc(db, "clubs", "c1"), record()));
  });

  it("refuses a Club creation batch with a row linked to somebody else when the lists or the Account ID don't agree", async () => {
    await seedAccounts(ROY, ANA);
    const db = as(ROY.uid);
    const newClub = (row: Record<string, unknown>) => {
      const batch = writeBatch(db);
      batch.set(doc(db, "clubs", "c1"), {
        name: "Tuesday",
        memberUids: [ROY.uid],
        organizerUids: [ROY.uid],
        createdAt: serverTimestamp(),
      });
      batch.set(doc(db, "clubs", "c1", "players", "p-x"), row);
      return batch.commit();
    };
    // Ana, as a Player or even as an Organizer, with the lists not naming her…
    await assertFails(newClub({ name: "Ana", skill: "beginner", link: link(ANA, "player") }));
    await assertFails(newClub({ name: "Ana", skill: "beginner", link: link(ANA, "organizer") }));
    // …Ana's Account ID with Roy's uid, or Roy's Account ID with Ana's uid…
    await assertFails(
      newClub({
        name: "Ana",
        skill: "beginner",
        link: { accountId: ANA.accountId, uid: ROY.uid, role: "organizer" },
      }),
    );
    await assertFails(
      newClub({
        name: "Ana",
        skill: "beginner",
        link: { accountId: ROY.accountId, uid: ANA.uid, role: "organizer" },
      }),
    );
    // …and an Account ID that nobody reserved.
    await assertFails(
      newClub({
        name: "Ghost",
        skill: "beginner",
        link: { accountId: "ghost-9999", uid: ROY.uid, role: "organizer" },
      }),
    );
    // The creator's own row is fine.
    await assertSucceeds(newClub({ name: "Roy", skill: "beginner", link: link(ROY, "organizer") }));
  });

  it("refuses a Club from somebody without an Account", async () => {
    await assertFails(
      setDoc(doc(as("nobody"), "clubs", "c1"), {
        name: "Tuesday",
        memberUids: ["nobody"],
        organizerUids: ["nobody"],
      }),
    );
  });

  it("lets linked Accounts read the Club and its rows, and nobody else", async () => {
    await seedClub();
    await assertSucceeds(getDoc(doc(as(ROY.uid), "clubs", "c1")));
    await assertSucceeds(getDoc(doc(as(ANA.uid), "clubs", "c1")));
    await assertSucceeds(getDocs(collection(as(ANA.uid), "clubs", "c1", "players")));
    await assertFails(getDoc(doc(as(BEN.uid), "clubs", "c1")));
    await assertFails(getDocs(collection(as(BEN.uid), "clubs", "c1", "players")));
    await assertFails(getDoc(doc(anonymous(), "clubs", "c1")));
  });

  it("lets an Account list only its own Clubs", async () => {
    await seedClub();
    const mine = (uid: string, asUid: string) =>
      getDocs(query(collection(as(uid), "clubs"), where("memberUids", "array-contains", asUid)));
    await assertSucceeds(mine(ANA.uid, ANA.uid));
    await assertFails(mine(BEN.uid, ANA.uid));
    await assertFails(getDocs(collection(as(ANA.uid), "clubs")));
  });

  it("lets an Organizer rename the Club, edit rows, add rows and remove rows", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertSucceeds(updateDoc(doc(db, "clubs", "c1"), { name: "Friday" }));
    await assertSucceeds(
      updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { skill: "beginner" }),
    );
    await assertSucceeds(
      setDoc(doc(db, "clubs", "c1", "players", "p-new"), { name: "Dan", skill: "intermediate" }),
    );
    await assertSucceeds(deleteDoc(doc(db, "clubs", "c1", "players", "p-cat")));
  });

  it("lets an Organizer delete the Club", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    for (const row of ["p-roy", "p-ana", "p-cat"])
      batch.delete(doc(db, "clubs", "c1", "players", row));
    batch.delete(doc(db, "clubs", "c1"));
    await assertSucceeds(batch.commit());
  });

  it("keeps a Player from changing the Club, its rows or deleting it", async () => {
    await seedClub();
    const db = as(ANA.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: "Mine now" }));
    await assertFails(updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { skill: "beginner" }));
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-new"), { name: "Dan", skill: "intermediate" }),
    );
    await assertFails(deleteDoc(doc(db, "clubs", "c1", "players", "p-cat")));
    await assertFails(deleteDoc(doc(db, "clubs", "c1")));
  });

  it("keeps outsiders from writing anything", async () => {
    await seedClub();
    const db = as(BEN.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: "Mine now" }));
    await assertFails(updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { skill: "beginner" }));
  });

  it("checks row fields", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-x"), { name: "", skill: "beginner" }),
    );
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-x"), { name: "X", skill: "godlike" }),
    );
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-x"), { name: "X", skill: "beginner", extra: 1 }),
    );
    // A link needs the uid as well as the Account ID and the Role.
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-x"), {
        name: "X",
        skill: "beginner",
        link: { accountId: ANA.accountId, role: "player" },
      }),
    );
  });

  it("refuses Club and Club player names with invisible characters", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: "Fri\u200Bday" }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: "\u202Edaf" }));
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-z"), { name: "Dan\u200B", skill: "beginner" }),
    );
    await assertFails(updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { name: "C\u0000at" }));
    await assertSucceeds(
      setDoc(doc(db, "clubs", "c1", "players", "p-z"), { name: "Zoë 🏸", skill: "beginner" }),
    );
  });

  it("keeps Club and Club player names to a sensible length", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const tooLong = "x".repeat(MAX_NAME_LENGTH + 1);
    await assertSucceeds(updateDoc(doc(db, "clubs", "c1"), { name: "x".repeat(MAX_NAME_LENGTH) }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: tooLong }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { name: "" }));
    await assertSucceeds(
      setDoc(doc(db, "clubs", "c1", "players", "p-x"), {
        name: "x".repeat(MAX_NAME_LENGTH),
        skill: "beginner",
      }),
    );
    await assertFails(
      setDoc(doc(db, "clubs", "c1", "players", "p-y"), { name: tooLong, skill: "beginner" }),
    );
    await assertFails(updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { name: tooLong }));
    await assertFails(
      setDoc(doc(db, "clubs", "c9"), {
        name: tooLong,
        memberUids: [ROY.uid],
        organizerUids: [ROY.uid],
      }),
    );
  });

  it("lets an Organizer never empty the Organizer list or make somebody an Organizer without making them a member", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerUids: [] }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, BEN.uid] }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { createdBy: ROY.uid }));
  });

  it("still lets an Organizer write the lists directly, without a row: only to add or remove who can read", async () => {
    // Pinned on purpose. The rules check each row against the lists, but not the lists against
    // the rows, so an Organizer can add any uid they know (read access, no write access unless
    // they make it an Organizer) or take a member off while their row stays linked. Tightening
    // this later should change this test.
    await seedClub();
    const db = as(ROY.uid);
    await assertSucceeds(updateDoc(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) }));
    await assertSucceeds(getDoc(doc(as(BEN.uid), "clubs", "c1")));
    await assertFails(
      setDoc(doc(as(BEN.uid), "clubs", "c1", "players", "p-x"), { name: "X", skill: "beginner" }),
    );
    // Any string counts, even one that is nobody's uid.
    await assertSucceeds(
      updateDoc(doc(db, "clubs", "c1"), { memberUids: arrayUnion("someone-else") }),
    );
    // Taking Ana off the lists while her row stays linked.
    await assertSucceeds(updateDoc(doc(db, "clubs", "c1"), { memberUids: arrayRemove(ANA.uid) }));
    await assertFails(getDoc(doc(as(ANA.uid), "clubs", "c1")));
    // What it can't do: leave nobody in charge, or make an Organizer who isn't a member.
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerUids: [] }));
    await assertFails(
      updateDoc(doc(db, "clubs", "c1"), { organizerUids: arrayUnion("not-a-member") }),
    );
    // A Player can't write the lists beyond taking themselves off.
    await assertFails(
      updateDoc(doc(as(BEN.uid), "clubs", "c1"), { memberUids: arrayUnion("someone-else") }),
    );
  });

  it("lets an Organizer create and delete a roster of 30 rows in one batch", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    const rowIds = Array.from({ length: 30 }, (_, index) => `p-${index}`);

    const create = writeBatch(db);
    create.set(doc(db, "clubs", "big"), {
      name: "Big",
      memberUids: [ROY.uid],
      organizerUids: [ROY.uid],
      createdAt: serverTimestamp(),
    });
    rowIds.forEach((id, index) => {
      create.set(doc(db, "clubs", "big", "players", id), {
        name: `Player ${index}`,
        skill: "beginner",
        ...(index === 0 ? { link: link(ROY, "organizer") } : {}),
      });
    });
    await assertSucceeds(create.commit());

    const remove = writeBatch(db);
    for (const id of rowIds) remove.delete(doc(db, "clubs", "big", "players", id));
    remove.delete(doc(db, "clubs", "big"));
    await assertSucceeds(remove.commit());
  });
});

/** Roy (Organizer) and Ana (Player) are on Club `c1`; Cat is an unlinked row. */
const club = (uid: string) => doc(as(uid), "clubs", "c1");

describe("Linking Accounts and Roles", () => {
  it("lets an Organizer link a row, with the Club's lists changed in the same batch", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), { link: link(BEN, "player") });
    batch.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    await assertSucceeds(batch.commit());
  });

  it("lets an Organizer link an Account as Organizer, listing it as one", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), { link: link(BEN, "organizer") });
    batch.update(doc(db, "clubs", "c1"), {
      memberUids: arrayUnion(BEN.uid),
      organizerUids: arrayUnion(BEN.uid),
    });
    await assertSucceeds(batch.commit());
  });

  it("refuses a link when the Club's lists don't change with it", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(
      updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), { link: link(BEN, "player") }),
    );
    // Linked as Organizer but listed only as a member.
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), { link: link(BEN, "organizer") });
    batch.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    await assertFails(batch.commit());
  });

  it("refuses a link to a uid that doesn't own the Account ID, or to an Account ID nobody reserved", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const attempt = (who: Record<string, unknown>, uid: string) => {
      const batch = writeBatch(db);
      batch.update(doc(db, "clubs", "c1", "players", "p-cat"), { link: who });
      batch.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(uid) });
      return batch.commit();
    };
    // Ben's uid under Ana's Account ID, and the other way round.
    await assertFails(attempt({ accountId: ANA.accountId, uid: BEN.uid, role: "player" }, BEN.uid));
    await assertFails(attempt({ accountId: BEN.accountId, uid: ANA.uid, role: "player" }, ANA.uid));
    // An Account ID nobody has reserved.
    await assertFails(
      attempt({ accountId: "ghost-9999", uid: "ghost-uid", role: "player" }, "ghost-uid"),
    );
    // Capitalisation is only for show: the reservation is found in lowercase.
    await assertSucceeds(attempt({ accountId: "Ben-3333", uid: BEN.uid, role: "player" }, BEN.uid));
  });

  it("refuses a Player linking anybody, even themselves", async () => {
    await seedClub();
    const db = as(ANA.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), { link: link(BEN, "player") });
    batch.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    await assertFails(batch.commit());

    const promote = writeBatch(db);
    promote.update(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    promote.update(doc(db, "clubs", "c1"), { organizerUids: arrayUnion(ANA.uid) });
    await assertFails(promote.commit());
  });

  describe("adding a row that is already linked", () => {
    const addRow = (role: "organizer" | "player", person: Person) => {
      const db = as(ROY.uid);
      const batch = writeBatch(db);
      batch.set(doc(db, "clubs", "c1", "players", "p-new"), {
        name: "New",
        skill: "beginner",
        link: link(person, role),
      });
      return { batch };
    };

    it("is allowed for an Account the lists already agree with, and for a new one added with the lists", async () => {
      await seedClub();
      // Ana is already on the lists as a Player and linked from p-ana. The rules look at the
      // lists, not at other rows, so a second row for her goes through: the app prevents it
      // (`already-linked`), the rules don't. Pinned so that changing it is deliberate.
      await assertSucceeds(addRow("player", ANA).batch.commit());

      const db = as(ROY.uid);
      const fresh = writeBatch(db);
      fresh.set(doc(db, "clubs", "c1", "players", "p-ben"), {
        name: "Ben",
        skill: "beginner",
        link: link(BEN, "player"),
      });
      fresh.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
      await assertSucceeds(fresh.commit());
    });

    it("is refused when the lists don't agree with the link", async () => {
      await seedClub();
      // Ben isn't on the lists.
      await assertFails(addRow("player", BEN).batch.commit());
      // Ana is a Player, not an Organizer.
      await assertFails(addRow("organizer", ANA).batch.commit());
      // Ben is added as a member but linked as Organizer.
      const db = as(ROY.uid);
      const batch = writeBatch(db);
      batch.set(doc(db, "clubs", "c1", "players", "p-ben"), {
        name: "Ben",
        skill: "beginner",
        link: link(BEN, "organizer"),
      });
      batch.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
      await assertFails(batch.commit());
    });

    it("is refused for a Player", async () => {
      await seedClub();
      const db = as(ANA.uid);
      await assertFails(
        setDoc(doc(db, "clubs", "c1", "players", "p-new"), {
          name: "New",
          skill: "beginner",
          link: link(ANA, "player"),
        }),
      );
    });
  });

  it("refuses relinking a row from one Account to another while the first stays on the lists", async () => {
    await seedClub();
    const db = as(ROY.uid);
    // Ben is added, Ana is not removed.
    const keepsAna = writeBatch(db);
    keepsAna.update(doc(db, "clubs", "c1", "players", "p-ana"), { link: link(BEN, "player") });
    keepsAna.update(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    await assertFails(keepsAna.commit());

    // Ben is already on the lists (say, from another row), Ana stays.
    const alreadyBen = writeBatch(db);
    alreadyBen.update(doc(db, "clubs", "c1", "players", "p-ana"), { link: link(BEN, "player") });
    await seed(async (admin) => {
      await updateDoc(doc(admin, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    });
    await assertFails(alreadyBen.commit());

    // Taking Ana off in the same batch makes it a proper move.
    const moves = writeBatch(db);
    moves.update(doc(db, "clubs", "c1", "players", "p-ana"), { link: link(BEN, "player") });
    moves.update(doc(db, "clubs", "c1"), { memberUids: arrayRemove(ANA.uid) });
    await assertSucceeds(moves.commit());
  });

  it("lets an Organizer change a Role, with the Organizer list in step", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const promote = writeBatch(db);
    promote.update(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    promote.update(doc(db, "clubs", "c1"), { organizerUids: arrayUnion(ANA.uid) });
    await assertSucceeds(promote.commit());
  });

  it("lets an Organizer unlink another Account and take it off the lists", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-ana"), { link: deleteField() });
    batch.update(doc(db, "clubs", "c1"), { memberUids: arrayRemove(ANA.uid) });
    await assertSucceeds(batch.commit());
  });

  it("refuses unlinking a row while its Account stays on the lists", async () => {
    await seedClub();
    await assertFails(
      updateDoc(doc(as(ROY.uid), "clubs", "c1", "players", "p-ana"), { link: deleteField() }),
    );
  });

  it("lets an Organizer remove a linked row together with its Account's place on the lists", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.delete(doc(db, "clubs", "c1", "players", "p-ana"));
    batch.update(doc(db, "clubs", "c1"), { memberUids: arrayRemove(ANA.uid) });
    await assertSucceeds(batch.commit());
  });

  it("refuses removing a linked row and leaving its Account on the lists", async () => {
    await seedClub();
    await assertFails(deleteDoc(doc(as(ROY.uid), "clubs", "c1", "players", "p-ana")));
  });
});

describe("The last Organizer", () => {
  it("can't be demoted", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-roy"), { "link.role": "player" });
    batch.update(doc(db, "clubs", "c1"), { organizerUids: arrayRemove(ROY.uid) });
    await assertFails(batch.commit());
  });

  it("can't be unlinked, removed or leave", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const unlink = writeBatch(db);
    unlink.update(doc(db, "clubs", "c1", "players", "p-roy"), { link: deleteField() });
    unlink.update(doc(db, "clubs", "c1"), {
      memberUids: arrayRemove(ROY.uid),
      organizerUids: arrayRemove(ROY.uid),
    });
    await assertFails(unlink.commit());

    const remove = writeBatch(db);
    remove.delete(doc(db, "clubs", "c1", "players", "p-roy"));
    remove.update(doc(db, "clubs", "c1"), {
      memberUids: arrayRemove(ROY.uid),
      organizerUids: arrayRemove(ROY.uid),
    });
    await assertFails(remove.commit());
  });

  it("can step down once another Organizer exists", async () => {
    await seedClub();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
      await updateDoc(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    });
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-roy"), { "link.role": "player" });
    batch.update(doc(db, "clubs", "c1"), { organizerUids: arrayRemove(ROY.uid) });
    await assertSucceeds(batch.commit());
  });
});

describe("Leaving a Club", () => {
  const leave = (
    person: Person,
    rowId: string,
    uid: string,
    extra: Record<string, unknown> = {},
  ) => {
    const db = as(person.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", rowId), { link: deleteField(), ...extra });
    batch.update(doc(db, "clubs", "c1"), {
      memberUids: arrayRemove(uid),
      organizerUids: arrayRemove(uid),
    });
    return batch.commit();
  };

  it("lets a linked Account unlink itself: its row stays, and it leaves the lists", async () => {
    await seedClub();
    await assertSucceeds(leave(ANA, "p-ana", ANA.uid));
    // The row is still on the roster.
    await env.withSecurityRulesDisabled(async (context) => {
      const row = await getDoc(doc(context.firestore(), "clubs", "c1", "players", "p-ana"));
      await assertSucceeds(
        Promise.resolve(row.exists() ? row : Promise.reject(new Error("row gone"))),
      );
    });
  });

  it("lets somebody on the lists with no linked row take themselves off", async () => {
    await seedClub();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { memberUids: arrayUnion(BEN.uid) });
    });
    await assertSucceeds(
      updateDoc(doc(as(BEN.uid), "clubs", "c1"), { memberUids: arrayRemove(BEN.uid) }),
    );
  });

  it("refuses leaving without taking the Account off the lists", async () => {
    await seedClub();
    await assertFails(
      updateDoc(doc(as(ANA.uid), "clubs", "c1", "players", "p-ana"), { link: deleteField() }),
    );
  });

  it("refuses changing the row while leaving", async () => {
    await seedClub();
    await assertFails(leave(ANA, "p-ana", ANA.uid, { name: "Somebody else" }));
  });

  it("refuses unlinking somebody else", async () => {
    await seedClub();
    await assertFails(leave(ANA, "p-roy", ROY.uid));
    await assertFails(leave(ANA, "p-roy", ANA.uid));
  });

  it("refuses taking others off the lists", async () => {
    await seedClub();
    const db = as(ANA.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { memberUids: [ANA.uid] }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerUids: [] }));
  });

  it("is open to an Organizer when another Organizer remains", async () => {
    await seedClub();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
      await updateDoc(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    });
    await assertSucceeds(leave(ROY, "p-roy", ROY.uid));
  });

  it("lets a Club that has been left no longer be read by the one who left", async () => {
    await seedClub();
    await leave(ANA, "p-ana", ANA.uid);
    await assertFails(getDoc(club(ANA.uid)));
  });
});

describe("Shared Active session", () => {
  const sessionDoc = (db: Firestore) => doc(db, "clubs", "c1", "activeSession", "current");

  /** A record as the app writes it when an Organizer starts a Session. */
  const startRecord = (person: Person, extra: Record<string, unknown> = {}) => ({
    sessionId: "s1",
    sessionJson: JSON.stringify({ id: "s1", name: "Tuesday night" }),
    hostUid: person.uid,
    hostAccountId: person.accountId,
    hostName: person.name,
    updatedAt: serverTimestamp(),
    ...extra,
  });

  /** Roy's session is running (written with the rules out of the way). */
  async function seedRunning() {
    await seedClub();
    await seed(async (db) => {
      await setDoc(sessionDoc(db), {
        sessionId: "s1",
        sessionJson: JSON.stringify({ id: "s1", name: "Tuesday night" }),
        hostUid: ROY.uid,
        hostAccountId: ROY.accountId,
        hostName: ROY.name,
      });
    });
  }

  /** Ana becomes an Organizer too (a second Organizer who isn't the host). */
  async function makeAnaOrganizer() {
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
    });
  }

  describe("starting", () => {
    it("lets an Organizer start it, naming themselves as the host", async () => {
      await seedClub();
      await assertSucceeds(setDoc(sessionDoc(as(ROY.uid)), startRecord(ROY)));
    });

    it("refuses a Player, somebody who isn't on the Club, and somebody not signed in", async () => {
      await seedClub();
      await assertFails(setDoc(sessionDoc(as(ANA.uid)), startRecord(ANA)));
      await assertFails(setDoc(sessionDoc(as(BEN.uid)), startRecord(BEN)));
      await assertFails(setDoc(sessionDoc(anonymous()), startRecord(ROY)));
    });

    it("lets a Club have only one: nobody else can start another while one exists", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      // A different Session can't replace the running one (the same Session with a new host is a
      // take-over, below).
      await assertFails(
        setDoc(
          sessionDoc(as(ANA.uid)),
          startRecord(ANA, { sessionJson: JSON.stringify({ id: "s2", name: "Another" }) }),
        ),
      );
      // Nor can the host swap in a different host or host name by starting again.
      await assertFails(setDoc(sessionDoc(as(ROY.uid)), startRecord(ROY, { hostName: "Roi" })));
    });

    it("lets a Club start a new one once the last has ended", async () => {
      await seedRunning();
      await assertSucceeds(deleteDoc(sessionDoc(as(ROY.uid))));
      await makeAnaOrganizer();
      await assertSucceeds(setDoc(sessionDoc(as(ANA.uid)), startRecord(ANA)));
    });

    it("refuses a record that names somebody else as the host", async () => {
      await seedClub();
      await makeAnaOrganizer();
      await assertFails(setDoc(sessionDoc(as(ROY.uid)), startRecord(ANA)));
      // Right uid, wrong Account ID: the reservation says it isn't Roy's.
      await assertFails(
        setDoc(sessionDoc(as(ROY.uid)), startRecord(ROY, { hostAccountId: ANA.accountId })),
      );
      await assertFails(
        setDoc(sessionDoc(as(ROY.uid)), startRecord(ROY, { hostAccountId: "nobody-0000" })),
      );
    });

    it("refuses a record with other fields, a missing field, a time of the host's choosing or a bad Session text", async () => {
      await seedClub();
      const db = as(ROY.uid);
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { isAdmin: true })));
      const { hostName: _hostName, ...withoutName } = startRecord(ROY);
      await assertFails(setDoc(sessionDoc(db), withoutName));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { updatedAt: new Date(0) })));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { sessionJson: "" })));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { sessionJson: { id: "s1" } })));
      await assertFails(
        setDoc(sessionDoc(db), startRecord(ROY, { sessionJson: "x".repeat(700_001) })),
      );
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { hostName: "" })));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { sessionId: "" })));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { sessionId: 7 })));
      await assertFails(setDoc(sessionDoc(db), startRecord(ROY, { sessionId: "x".repeat(101) })));
      const { sessionId: _sessionId, ...withoutSessionId } = startRecord(ROY);
      await assertFails(setDoc(sessionDoc(db), withoutSessionId));
      await assertSucceeds(
        setDoc(sessionDoc(db), startRecord(ROY, { sessionJson: "x".repeat(700_000) })),
      );
    });

    it("keeps the record at the one fixed place", async () => {
      await seedClub();
      await assertFails(
        setDoc(doc(as(ROY.uid), "clubs", "c1", "activeSession", "other"), startRecord(ROY)),
      );
    });
  });

  describe("reading", () => {
    it("lets anyone on the Club read it, and nobody else", async () => {
      await seedRunning();
      await assertSucceeds(getDoc(sessionDoc(as(ROY.uid))));
      await assertSucceeds(getDoc(sessionDoc(as(ANA.uid))));
      await assertFails(getDoc(sessionDoc(as(BEN.uid))));
      await assertFails(getDoc(sessionDoc(anonymous())));
    });

    it("lets a member read that there is none", async () => {
      await seedClub();
      await assertSucceeds(getDoc(sessionDoc(as(ANA.uid))));
    });
  });

  describe("uploading", () => {
    const upload = (name: string) => ({
      sessionJson: JSON.stringify({ id: "s1", name }),
      updatedAt: serverTimestamp(),
    });

    it("lets the Session host replace the Session text", async () => {
      await seedRunning();
      await assertSucceeds(updateDoc(sessionDoc(as(ROY.uid)), upload("Later")));
    });

    it("lets only the Session host upload", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      await assertFails(updateDoc(sessionDoc(as(ANA.uid)), upload("Ana's")));
      await assertFails(updateDoc(sessionDoc(as(BEN.uid)), upload("Ben's")));
      await assertFails(updateDoc(sessionDoc(anonymous()), upload("Nobody's")));
    });

    it("never lets the host change, or hand over, who the host is", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      const db = as(ROY.uid);
      await assertFails(updateDoc(sessionDoc(db), { ...upload("x"), hostUid: ANA.uid }));
      await assertFails(updateDoc(sessionDoc(db), { hostUid: ANA.uid }));
      await assertFails(
        updateDoc(sessionDoc(db), { ...upload("x"), hostAccountId: ANA.accountId }),
      );
      await assertFails(updateDoc(sessionDoc(db), { ...upload("x"), hostName: "Ana" }));
      // Nor the Session it is the record of: the Ended session is named by it.
      await assertFails(updateDoc(sessionDoc(db), { ...upload("x"), sessionId: "s2" }));
      // Not even an Organizer takes over by writing to it (that is taking over, below).
      await assertFails(
        updateDoc(sessionDoc(as(ANA.uid)), {
          hostUid: ANA.uid,
          hostAccountId: ANA.accountId,
          hostName: "Ana",
          ...upload("x"),
        }),
      );
    });

    it("refuses other fields, a time of the host's choosing and a bad Session text", async () => {
      await seedRunning();
      const db = as(ROY.uid);
      await assertFails(updateDoc(sessionDoc(db), { ...upload("x"), isAdmin: true }));
      await assertFails(updateDoc(sessionDoc(db), { ...upload("x"), updatedAt: new Date(0) }));
      await assertFails(
        updateDoc(sessionDoc(db), { sessionJson: "", updatedAt: serverTimestamp() }),
      );
      await assertFails(
        updateDoc(sessionDoc(db), {
          sessionJson: "x".repeat(700_001),
          updatedAt: serverTimestamp(),
        }),
      );
    });

    it("lets a host who lost the Organizer Role, or left the Club, keep uploading until somebody takes over", async () => {
      await seedRunning();
      await seed(async (db) => {
        await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ANA.uid] });
      });
      await assertSucceeds(updateDoc(sessionDoc(as(ROY.uid)), upload("Still hosting")));
      await seed(async (db) => {
        await updateDoc(doc(db, "clubs", "c1"), { memberUids: [ANA.uid] });
      });
      await assertSucceeds(
        updateDoc(sessionDoc(as(ROY.uid)), upload("Still hosting, off the Club")),
      );
    });
  });

  describe("taking over", () => {
    const takeOver = (person: Person, extra: Record<string, unknown> = {}) => ({
      hostUid: person.uid,
      hostAccountId: person.accountId,
      hostName: person.name,
      updatedAt: serverTimestamp(),
      ...extra,
    });

    it("lets another Organizer of the Club become the host, changing only the host fields", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      await assertSucceeds(updateDoc(sessionDoc(as(ANA.uid)), takeOver(ANA)));
      // The new host is the host: they upload, and the old host no longer can.
      await assertSucceeds(
        updateDoc(sessionDoc(as(ANA.uid)), {
          sessionJson: JSON.stringify({ id: "s1", name: "Ana's" }),
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(
        updateDoc(sessionDoc(as(ROY.uid)), {
          sessionJson: JSON.stringify({ id: "s1", name: "Stale" }),
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(deleteDoc(sessionDoc(as(ROY.uid))));
      await assertSucceeds(deleteDoc(sessionDoc(as(ANA.uid))));
    });

    it("refuses a Player, somebody who isn't on the Club, and somebody not signed in", async () => {
      await seedRunning();
      await assertFails(updateDoc(sessionDoc(as(ANA.uid)), takeOver(ANA)));
      await assertFails(updateDoc(sessionDoc(as(BEN.uid)), takeOver(BEN)));
      await assertFails(updateDoc(sessionDoc(anonymous()), takeOver(ROY)));
    });

    it("refuses naming somebody else as the new host, or an Account ID that isn't theirs", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      const db = as(ANA.uid);
      await assertFails(updateDoc(sessionDoc(db), takeOver(ROY)));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { hostAccountId: ROY.accountId })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { hostAccountId: "nobody-0000" })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { hostUid: BEN.uid })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { hostName: "" })));
    });

    it("refuses anything but the host fields and the time: not the Session text, not other fields", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      const db = as(ANA.uid);
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { sessionJson: "{}" })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { sessionId: "s2" })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { isAdmin: true })));
      await assertFails(updateDoc(sessionDoc(db), takeOver(ANA, { updatedAt: new Date(0) })));
    });

    it("replaces a host who lost the Organizer Role or left the Club", async () => {
      await seedRunning();
      await seed(async (db) => {
        await updateDoc(doc(db, "clubs", "c1"), {
          organizerUids: [ANA.uid],
          memberUids: [ANA.uid],
        });
      });
      await assertSucceeds(updateDoc(sessionDoc(as(ANA.uid)), takeOver(ANA)));
    });
  });

  describe("ending", () => {
    it("lets only the Session host delete it", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      await assertFails(deleteDoc(sessionDoc(as(ANA.uid))));
      await assertFails(deleteDoc(sessionDoc(as(BEN.uid))));
      await assertFails(deleteDoc(sessionDoc(anonymous())));
      await assertSucceeds(deleteDoc(sessionDoc(as(ROY.uid))));
    });

    it("lets an Organizer who isn't the host delete it only together with the whole Club", async () => {
      await seedRunning();
      await makeAnaOrganizer();
      const db = as(ANA.uid);
      const batch = writeBatch(db);
      batch.delete(sessionDoc(db));
      batch.delete(doc(db, "clubs", "c1"));
      await assertSucceeds(batch.commit());
    });
  });
});

describe("Players' requests", () => {
  const requestDoc = (db: Firestore, id = "r1") =>
    doc(db, "clubs", "c1", "activeSession", "current", "requests", id);
  const requestsOf = (db: Firestore) =>
    collection(db, "clubs", "c1", "activeSession", "current", "requests");

  /** A request as the app writes it. */
  const ask = (person: Person, extra: Record<string, unknown> = {}) => ({
    uid: person.uid,
    accountId: person.accountId,
    sessionId: "s1",
    sessionPlayerId: "sp-1",
    kind: "sit-out",
    createdAt: serverTimestamp(),
    ...extra,
  });

  /** Roy hosts a running session; Ana (Player) is on the Club; Ben isn't. */
  async function seedRunning() {
    await seedClub();
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1", "activeSession", "current"), {
        sessionId: "s1",
        sessionJson: JSON.stringify({ id: "s1" }),
        hostUid: ROY.uid,
        hostAccountId: ROY.accountId,
        hostName: ROY.name,
      });
    });
  }

  async function seedRequest(person: Person = ANA, id = "r1", extra: Record<string, unknown> = {}) {
    await seed(async (db) => {
      await setDoc(requestDoc(db, id), { ...ask(person, { createdAt: new Date(1000) }), ...extra });
    });
  }

  describe("creating", () => {
    it("lets anyone on the Club ask for themselves, a Player or an Organizer", async () => {
      await seedRunning();
      await assertSucceeds(setDoc(requestDoc(as(ANA.uid)), ask(ANA)));
      await assertSucceeds(setDoc(requestDoc(as(ROY.uid), "r2"), ask(ROY, { kind: "leave" })));
      await assertSucceeds(setDoc(requestDoc(as(ANA.uid), "r3"), ask(ANA, { kind: "back-in" })));
    });

    it("refuses somebody who isn't on the Club, and somebody not signed in", async () => {
      await seedRunning();
      await assertFails(setDoc(requestDoc(as(BEN.uid)), ask(BEN)));
      await assertFails(setDoc(requestDoc(anonymous()), ask(ANA)));
    });

    it("refuses a request for somebody else: another uid, or somebody else's Account ID", async () => {
      await seedRunning();
      const db = as(ANA.uid);
      await assertFails(setDoc(requestDoc(db), ask(ROY)));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { uid: ROY.uid })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { accountId: ROY.accountId })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { accountId: "nobody-0000" })));
    });

    it("refuses a request when the Club has no Active session", async () => {
      await seedClub();
      await assertFails(setDoc(requestDoc(as(ANA.uid)), ask(ANA)));
    });

    it("refuses other kinds, other fields, a missing field and a time of the Player's choosing", async () => {
      await seedRunning();
      const db = as(ANA.uid);
      await assertFails(setDoc(requestDoc(db), ask(ANA, { kind: "end-session" })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { status: "applied" })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { isAdmin: true })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { createdAt: new Date(0) })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { sessionPlayerId: 7 })));
      await assertFails(setDoc(requestDoc(db), ask(ANA, { sessionId: "x".repeat(101) })));
      const { sessionId: _sessionId, ...withoutSession } = ask(ANA);
      await assertFails(setDoc(requestDoc(db), withoutSession));
    });
  });

  describe("reading", () => {
    it("lets a Player read their own requests, and the host everybody's", async () => {
      await seedRunning();
      await seedRequest(ANA, "r1");
      await seedRequest(ROY, "r2");
      await assertSucceeds(getDoc(requestDoc(as(ANA.uid), "r1")));
      await assertSucceeds(getDocs(query(requestsOf(as(ANA.uid)), where("uid", "==", ANA.uid))));
      await assertSucceeds(getDocs(requestsOf(as(ROY.uid))));
    });

    it("refuses a Player somebody else's requests, and everybody else", async () => {
      await seedRunning();
      await seedRequest(ROY, "r2");
      await assertFails(getDoc(requestDoc(as(ANA.uid), "r2")));
      await assertFails(getDocs(requestsOf(as(ANA.uid))));
      await assertFails(getDoc(requestDoc(as(BEN.uid), "r2")));
      await assertFails(getDoc(requestDoc(anonymous(), "r2")));
    });
  });

  describe("marking", () => {
    const resolve = (status: string, extra: Record<string, unknown> = {}) => ({
      status,
      resolvedAt: serverTimestamp(),
      ...extra,
    });

    it("lets only the Session host mark a request, once, as applied or skipped", async () => {
      await seedRunning();
      await seedRequest();
      await assertFails(updateDoc(requestDoc(as(ANA.uid)), resolve("applied")));
      await assertFails(updateDoc(requestDoc(as(BEN.uid)), resolve("applied")));
      await assertSucceeds(updateDoc(requestDoc(as(ROY.uid)), resolve("applied")));
      // No second answer.
      await assertFails(updateDoc(requestDoc(as(ROY.uid)), resolve("skipped")));
    });

    it("refuses any other change: another status, other fields, the requester's fields, the time", async () => {
      await seedRunning();
      await seedRequest();
      const db = as(ROY.uid);
      await assertFails(updateDoc(requestDoc(db), resolve("pending")));
      await assertFails(updateDoc(requestDoc(db), resolve("applied", { kind: "leave" })));
      await assertFails(
        updateDoc(requestDoc(db), resolve("applied", { sessionPlayerId: "other" })),
      );
      await assertFails(updateDoc(requestDoc(db), resolve("applied", { resolvedAt: new Date(0) })));
      await assertFails(updateDoc(requestDoc(db), { kind: "leave" }));
    });

    it("hands pending requests to a new host: the old host can't mark them, the new one can", async () => {
      await seedRunning();
      await seedRequest();
      await seed(async (db) => {
        await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
      });
      await assertSucceeds(
        updateDoc(doc(as(ANA.uid), "clubs", "c1", "activeSession", "current"), {
          hostUid: ANA.uid,
          hostAccountId: ANA.accountId,
          hostName: ANA.name,
          updatedAt: serverTimestamp(),
        }),
      );
      await assertFails(updateDoc(requestDoc(as(ROY.uid)), resolve("applied")));
      await assertSucceeds(updateDoc(requestDoc(as(ANA.uid)), resolve("applied")));
    });
  });

  describe("deleting", () => {
    it("lets only the Session host delete requests, with the Session when it ends", async () => {
      await seedRunning();
      await seedRequest();
      await assertFails(deleteDoc(requestDoc(as(ANA.uid))));
      await assertFails(deleteDoc(requestDoc(as(BEN.uid))));
      const db = as(ROY.uid);
      const batch = writeBatch(db);
      batch.delete(requestDoc(db));
      batch.delete(doc(db, "clubs", "c1", "activeSession", "current"));
      await assertSucceeds(batch.commit());
    });
  });
});

describe("Ended sessions of a Shared club", () => {
  const activeDoc = (db: Firestore) => doc(db, "clubs", "c1", "activeSession", "current");
  const endedDoc = (db: Firestore, id = "s1") => doc(db, "clubs", "c1", "endedSessions", id);

  /** An Ended session as the host's batch writes it. */
  const published = (person: Person, extra: Record<string, unknown> = {}) => ({
    hostUid: person.uid,
    endedAt: Date.now() - 1000,
    endedJson: JSON.stringify({ id: "s1", name: "Thursday" }),
    createdAt: serverTimestamp(),
    ...extra,
  });

  /** Roy hosts a running session `s1` (Ana is a Player on the Club, Ben isn't). */
  async function seedRunning(extra: Record<string, unknown> = {}) {
    await seedClub();
    await seed(async (db) => {
      await setDoc(activeDoc(db), {
        sessionId: "s1",
        sessionJson: JSON.stringify({ id: "s1" }),
        hostUid: ROY.uid,
        hostAccountId: ROY.accountId,
        hostName: ROY.name,
        ...extra,
      });
    });
  }

  /** The host's end: delete the Active session and create the Ended session, in one batch. */
  function end(person: Person, extra: Record<string, unknown> = {}, id = "s1") {
    const db = as(person.uid);
    const batch = writeBatch(db);
    batch.delete(activeDoc(db));
    batch.set(endedDoc(db, id), published(person, extra));
    return batch.commit();
  }

  it("lets the Session host publish it in the batch that ends the Session", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
  });

  it("refuses publishing while the Session is still active: the Active session has to go in the same batch", async () => {
    await seedRunning();
    await assertFails(setDoc(endedDoc(as(ROY.uid)), published(ROY)));
    // Not even by writing the Ended session next to an update of the Active session.
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(activeDoc(db), { sessionJson: "{}", updatedAt: serverTimestamp() });
    batch.set(endedDoc(db), published(ROY));
    await assertFails(batch.commit());
  });

  it("lets a Session end only once: no Ended sessions can be made up after it, or beside it", async () => {
    await seedRunning();
    const db = as(ROY.uid);
    // Probe: many Ended sessions with ids of the host's choosing, in the ending batch…
    const many = writeBatch(db);
    many.delete(activeDoc(db));
    for (let i = 0; i < 50; i++) many.set(endedDoc(db, `fake-${i}`), published(ROY));
    await assertFails(many.commit());
    // …one with the right id and one more beside it…
    const two = writeBatch(db);
    two.delete(activeDoc(db));
    two.set(endedDoc(db, "s1"), published(ROY));
    two.set(endedDoc(db, "s2"), published(ROY));
    await assertFails(two.commit());
    // …and after the Session has ended there is no Active session to end any more.
    await assertSucceeds(end(ROY));
    await assertFails(setDoc(endedDoc(db, "s2"), published(ROY)));
    await assertFails(setDoc(endedDoc(db, "s3"), published(ROY)));
  });

  it("refuses an Ended session whose id isn't the one the Active session was started with", async () => {
    await seedRunning();
    await assertFails(end(ROY, {}, "other"));
    await assertSucceeds(end(ROY, {}, "s1"));
  });

  it("refuses ending when the Active session record has no Session id", async () => {
    await seedClub();
    await seed(async (db) => {
      await setDoc(activeDoc(db), {
        sessionJson: JSON.stringify({ id: "s1" }),
        hostUid: ROY.uid,
        hostAccountId: ROY.accountId,
        hostName: ROY.name,
      });
    });
    await assertFails(end(ROY));
  });

  it("lets a host who was taken off the Club end the Session, with the one Ended session of it only", async () => {
    await seedRunning();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), {
        organizerUids: [ANA.uid],
        memberUids: [ANA.uid],
      });
    });
    const db = as(ROY.uid);
    const other = writeBatch(db);
    other.delete(activeDoc(db));
    other.set(endedDoc(db, "s9"), published(ROY));
    await assertFails(other.commit());
    await assertSucceeds(end(ROY));
    await assertFails(setDoc(endedDoc(db, "s9"), published(ROY)));
  });

  it("refuses anybody who isn't the Session host: a Player, another Organizer, outsiders", async () => {
    await seedRunning();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
    });
    await assertFails(setDoc(endedDoc(as(ANA.uid)), published(ANA)));
    await assertFails(setDoc(endedDoc(as(BEN.uid)), published(BEN)));
    await assertFails(setDoc(endedDoc(anonymous()), published(ROY)));
    // Nor in somebody else's name.
    await assertFails(setDoc(endedDoc(as(ANA.uid)), published(ROY)));
    await assertFails(end(ANA));
  });

  it("refuses publishing when the Club has no Active session", async () => {
    await seedClub();
    await assertFails(setDoc(endedDoc(as(ROY.uid)), published(ROY)));
  });

  it("refuses an endedAt in the far future, in the past of time itself or not a whole number", async () => {
    await seedRunning();
    // Fifty of these would hide the Club's real history for good.
    await assertFails(end(ROY, { endedAt: 9e15 }));
    await assertFails(end(ROY, { endedAt: Date.now() + 10 * 60_000 }));
    await assertFails(end(ROY, { endedAt: -1 }));
    await assertFails(end(ROY, { endedAt: 1.5 }));
    await assertFails(end(ROY, { endedAt: Number.MAX_SAFE_INTEGER }));
    // A little clock skew is fine, and so is any time in the past.
    await assertSucceeds(end(ROY, { endedAt: Date.now() + 60_000 }));
  });

  it("accepts any time in the past as endedAt", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY, { endedAt: 0 }));
  });

  it("refuses a record with other fields, a missing field, a wrong host, a time of the host's choosing or a bad body", async () => {
    await seedRunning();
    const db = as(ROY.uid);
    const ending = (data: Record<string, unknown>) => {
      const batch = writeBatch(db);
      batch.delete(activeDoc(db));
      batch.set(endedDoc(db), data);
      return batch.commit();
    };
    await assertFails(ending(published(ROY, { isAdmin: true })));
    const { endedAt: _endedAt, ...withoutTime } = published(ROY);
    await assertFails(ending(withoutTime));
    await assertFails(ending(published(ROY, { hostUid: ANA.uid })));
    await assertFails(ending(published(ROY, { createdAt: new Date(0) })));
    await assertFails(ending(published(ROY, { endedAt: "yesterday" })));
    await assertFails(ending(published(ROY, { endedJson: "" })));
    await assertFails(ending(published(ROY, { endedJson: { id: "s1" } })));
    await assertFails(ending(published(ROY, { endedJson: "x".repeat(400_001) })));
    await assertSucceeds(ending(published(ROY, { endedJson: "x".repeat(400_000) })));
  });

  it("lets anyone on the Club read them, and nobody else", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
    await assertSucceeds(getDoc(endedDoc(as(ROY.uid))));
    await assertSucceeds(getDoc(endedDoc(as(ANA.uid))));
    await assertSucceeds(
      getDocs(
        query(
          collection(as(ANA.uid), "clubs", "c1", "endedSessions"),
          orderBy("endedAt", "desc"),
          limit(50),
        ),
      ),
    );
    await assertFails(getDoc(endedDoc(as(BEN.uid))));
    await assertFails(getDoc(endedDoc(anonymous())));
  });

  it("lets nobody change one, the host included, and nobody replace one", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
    for (const uid of [ROY.uid, ANA.uid, BEN.uid]) {
      await assertFails(updateDoc(endedDoc(as(uid)), { endedJson: "{}" }));
      await assertFails(setDoc(endedDoc(as(uid)), published(ROY, { endedJson: "{}" })));
    }
  });

  it("lets any Organizer delete them (a Club's history goes with the Club), and nobody else", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { organizerUids: [ROY.uid, ANA.uid] });
    });
    await assertFails(deleteDoc(endedDoc(as(BEN.uid))));
    await assertFails(deleteDoc(endedDoc(anonymous())));
    await assertSucceeds(deleteDoc(endedDoc(as(ANA.uid))));
  });

  it("refuses a Player deleting one", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
    await assertFails(deleteDoc(endedDoc(as(ANA.uid))));
  });

  it("leaves nothing of a Club's history for somebody who creates its id again, when it is deleted the way the app does", async () => {
    await seedRunning();
    await assertSucceeds(end(ROY));
    // Roy deletes the history first, with Ana still on the Club, then the rows and the Club.
    const roy = as(ROY.uid);
    await assertSucceeds(deleteDoc(endedDoc(roy)));
    const rest = writeBatch(roy);
    for (const row of ["p-roy", "p-ana", "p-cat"])
      rest.delete(doc(roy, "clubs", "c1", "players", row));
    rest.delete(doc(roy, "clubs", "c1"));
    await assertSucceeds(rest.commit());

    // Ben takes the same id: he can create the Club, and its history is empty.
    await seedAccounts(BEN);
    const ben = as(BEN.uid);
    await assertSucceeds(
      setDoc(doc(ben, "clubs", "c1"), {
        name: "Mine",
        memberUids: [BEN.uid],
        organizerUids: [BEN.uid],
        createdAt: serverTimestamp(),
      }),
    );
    const history = await getDocs(collection(ben, "clubs", "c1", "endedSessions"));
    if (!history.empty) throw new Error("the old Club's history was left behind");
  });
});

describe("Making a Local club shared: the creator's import", () => {
  const endedDoc = (db: Firestore, id: string) => doc(db, "clubs", "c1", "endedSessions", id);
  const ended = (person: Person, extra: Record<string, unknown> = {}) => ({
    hostUid: person.uid,
    endedAt: 1_700_000_000_000,
    endedJson: JSON.stringify({ id: "x", name: "Night" }),
    createdAt: serverTimestamp(),
    ...extra,
  });
  const clubRecord = () => ({
    name: "Garage",
    memberUids: [ROY.uid],
    organizerUids: [ROY.uid],
    createdAt: serverTimestamp(),
  });
  const row = (id: string, linked?: { accountId: string; uid: string; role: string }) => ({
    name: `Player ${id}`,
    skill: "intermediate",
    ...(linked ? { link: linked } : {}),
  });

  it("lets a new Club's creator write the Club, a big roster and the whole history in one batch each", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);

    // The Club and 450 rows can't be one batch (500 writes at most): the Club with the first
    // 400 rows, then the rest.
    const first = writeBatch(db);
    first.set(doc(db, "clubs", "c1"), clubRecord());
    first.set(doc(db, "clubs", "c1", "players", "p-roy"), row("roy", link(ROY, "organizer")));
    for (let i = 0; i < 399; i++)
      first.set(doc(db, "clubs", "c1", "players", `p-${i}`), row(String(i)));
    await assertSucceeds(first.commit());

    const rest = writeBatch(db);
    for (let i = 399; i < 450; i++)
      rest.set(doc(db, "clubs", "c1", "players", `p-${i}`), row(String(i)));
    await assertSucceeds(rest.commit());

    // Then the history: 400 Ended sessions in a batch.
    const history = writeBatch(db);
    for (let i = 0; i < 400; i++) history.set(endedDoc(db, `s${i}`), ended(ROY));
    await assertSucceeds(history.commit());
  });

  it("lets the creator import Ended sessions in the same batch as the Club", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "clubs", "c1"), clubRecord());
    batch.set(doc(db, "clubs", "c1", "players", "p-roy"), row("roy", link(ROY, "organizer")));
    for (let i = 0; i < 50; i++) batch.set(endedDoc(db, `s${i}`), ended(ROY));
    await assertSucceeds(batch.commit());
  });

  it("refuses imported Ended sessions with an endedAt in the far future", async () => {
    await seedAccounts(ROY);
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "clubs", "c1"), clubRecord());
    batch.set(doc(db, "clubs", "c1", "players", "p-roy"), row("roy", link(ROY, "organizer")));
    batch.set(endedDoc(db, "s1"), ended(ROY, { endedAt: 9e15 }));
    await assertFails(batch.commit());
  });

  it("refuses the import once the Club has another member, however soon", async () => {
    await seedAccounts(ROY, ANA);
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1"), {
        name: "Garage",
        memberUids: [ROY.uid, ANA.uid],
        organizerUids: [ROY.uid],
        createdAt: new Date(),
      });
    });
    await assertFails(setDoc(endedDoc(as(ROY.uid), "s1"), ended(ROY)));
  });

  it("refuses the import more than an hour after the Club was created, and for a Club that has no creation time", async () => {
    await seedAccounts(ROY);
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1"), {
        name: "Garage",
        memberUids: [ROY.uid],
        organizerUids: [ROY.uid],
        createdAt: new Date(Date.now() - 2 * 3_600_000),
      });
    });
    await assertFails(setDoc(endedDoc(as(ROY.uid), "s1"), ended(ROY)));
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1"), {
        name: "Garage",
        memberUids: [ROY.uid],
        organizerUids: [ROY.uid],
      });
    });
    await assertFails(setDoc(endedDoc(as(ROY.uid), "s1"), ended(ROY)));
  });

  it("refuses somebody who isn't the Club's Organizer, and a record in somebody else's name", async () => {
    await seedAccounts(ROY, BEN);
    const db = as(ROY.uid);
    const create = writeBatch(db);
    create.set(doc(db, "clubs", "c1"), clubRecord());
    create.set(doc(db, "clubs", "c1", "players", "p-roy"), row("roy", link(ROY, "organizer")));
    await create.commit();

    await assertFails(setDoc(endedDoc(as(BEN.uid), "s1"), ended(BEN)));
    await assertFails(setDoc(endedDoc(db, "s1"), ended(ROY, { hostUid: BEN.uid })));
    await assertFails(setDoc(endedDoc(db, "s1"), ended(ROY, { createdAt: new Date(0) })));
    await assertSucceeds(setDoc(endedDoc(db, "s1"), ended(ROY)));
    // Still never changed.
    await assertFails(setDoc(endedDoc(db, "s1"), ended(ROY, { endedJson: "{}" })));
  });

  it("lets the creator start the Active session on the new Club, and nobody else", async () => {
    await seedAccounts(ROY, BEN);
    const db = as(ROY.uid);
    const create = writeBatch(db);
    create.set(doc(db, "clubs", "c1"), clubRecord());
    create.set(doc(db, "clubs", "c1", "players", "p-roy"), row("roy", link(ROY, "organizer")));
    await create.commit();
    const record = (person: Person) => ({
      sessionId: "s1",
      sessionJson: JSON.stringify({ id: "s1" }),
      hostUid: person.uid,
      hostAccountId: person.accountId,
      hostName: person.name,
      updatedAt: serverTimestamp(),
    });

    await assertFails(
      setDoc(doc(as(BEN.uid), "clubs", "c1", "activeSession", "current"), record(BEN)),
    );
    await assertSucceeds(setDoc(doc(db, "clubs", "c1", "activeSession", "current"), record(ROY)));
  });

  describe("linking other Accounts in the new Club's first batch (ADR-0008)", () => {
    const create = (
      lists: { memberUids: string[]; organizerUids: string[] },
      rows: Record<string, Record<string, unknown>>,
      uid = ROY.uid,
    ) => {
      const db = as(uid);
      const batch = writeBatch(db);
      batch.set(doc(db, "clubs", "c1"), { name: "Garage", ...lists, createdAt: serverTimestamp() });
      for (const [id, data] of Object.entries(rows)) {
        batch.set(doc(db, "clubs", "c1", "players", id), data);
      }
      return batch.commit();
    };
    const royRow = { name: "Roy", skill: "intermediate", link: link(ROY, "organizer") };
    const anaRow = (role: "organizer" | "player") => ({
      name: "Ana",
      skill: "beginner",
      link: link(ANA, role),
    });

    it("allows linking another reserved Account when the lists agree, as Player or as Organizer", async () => {
      await seedAccounts(ROY, ANA, BEN);
      await assertSucceeds(
        create(
          { memberUids: [ROY.uid, ANA.uid], organizerUids: [ROY.uid] },
          { "p-roy": royRow, "p-ana": anaRow("player") },
        ),
      );
      await env.clearFirestore();
      await seedAccounts(ROY, ANA, BEN);
      await assertSucceeds(
        create(
          { memberUids: [ROY.uid, ANA.uid, BEN.uid], organizerUids: [ROY.uid, ANA.uid] },
          {
            "p-roy": royRow,
            "p-ana": anaRow("organizer"),
            "p-ben": { name: "Ben", skill: "beginner", link: link(BEN, "player") },
            "p-cat": { name: "Cat", skill: "advanced" },
          },
        ),
      );
      // Ana, an Organizer now, may read and change the Club; Ben, a Player, may only read.
      await assertSucceeds(getDoc(doc(as(BEN.uid), "clubs", "c1")));
      await assertSucceeds(updateDoc(doc(as(ANA.uid), "clubs", "c1"), { name: "Friday" }));
      await assertFails(updateDoc(doc(as(BEN.uid), "clubs", "c1"), { name: "Nope" }));
    });

    it("refuses a link whose uid doesn't own the Account ID", async () => {
      await seedAccounts(ROY, ANA, BEN);
      const lists = { memberUids: [ROY.uid, BEN.uid], organizerUids: [ROY.uid] };
      await assertFails(
        create(lists, {
          "p-roy": royRow,
          "p-ben": {
            name: "Ana",
            skill: "beginner",
            link: { accountId: ANA.accountId, uid: BEN.uid, role: "player" },
          },
        }),
      );
      await assertFails(
        create(lists, {
          "p-roy": royRow,
          "p-ben": {
            name: "Ghost",
            skill: "beginner",
            link: { accountId: "ghost-9999", uid: BEN.uid, role: "player" },
          },
        }),
      );
    });

    it("refuses lists that disagree with the links", async () => {
      await seedAccounts(ROY, ANA);
      // Linked, but not on the lists.
      await assertFails(
        create(
          { memberUids: [ROY.uid], organizerUids: [ROY.uid] },
          { "p-roy": royRow, "p-ana": anaRow("player") },
        ),
      );
      // A Player who is listed as an Organizer.
      await assertFails(
        create(
          { memberUids: [ROY.uid, ANA.uid], organizerUids: [ROY.uid, ANA.uid] },
          { "p-roy": royRow, "p-ana": anaRow("player") },
        ),
      );
      // An Organizer who is only listed as a member.
      await assertFails(
        create(
          { memberUids: [ROY.uid, ANA.uid], organizerUids: [ROY.uid] },
          { "p-roy": royRow, "p-ana": anaRow("organizer") },
        ),
      );
    });

    it("refuses a create without the creator as Organizer", async () => {
      await seedAccounts(ROY, ANA);
      // The creator's own row says Player, with the lists naming them as an Organizer.
      await assertFails(
        create(
          { memberUids: [ROY.uid, ANA.uid], organizerUids: [ROY.uid] },
          { "p-roy": { ...royRow, link: link(ROY, "player") }, "p-ana": anaRow("player") },
        ),
      );
      // Roy lists Ana as the only Organizer, himself only as a member.
      await assertFails(
        create(
          { memberUids: [ROY.uid, ANA.uid], organizerUids: [ANA.uid] },
          { "p-ana": anaRow("organizer") },
        ),
      );
    });

    it("keeps the creator's import window closed to a Club that has other members", async () => {
      await seedAccounts(ROY, ANA);
      await create(
        { memberUids: [ROY.uid, ANA.uid], organizerUids: [ROY.uid] },
        { "p-roy": royRow, "p-ana": anaRow("player") },
      );
      await assertFails(
        setDoc(doc(as(ROY.uid), "clubs", "c1", "endedSessions", "s1"), {
          hostUid: ROY.uid,
          endedAt: 1_700_000_000_000,
          endedJson: "{}",
          createdAt: serverTimestamp(),
        }),
      );
    });
  });
});

describe("Deleting an Account", () => {
  const endedDoc = (db: Firestore, id: string) => doc(db, "clubs", "c1", "endedSessions", id);
  const requestDoc = (db: Firestore, id: string) =>
    doc(db, "clubs", "c1", "activeSession", "current", "requests", id);

  /** A Club only Roy is on (Cat is a plain row), with history and a request in its Active session. */
  async function seedSolo(options: { others?: boolean } = {}) {
    await seedAccounts(ROY, ANA);
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1"), {
        name: "Solo",
        memberUids: options.others ? [ROY.uid, ANA.uid] : [ROY.uid],
        organizerUids: [ROY.uid],
      });
      await setDoc(doc(db, "clubs", "c1", "players", "p-roy"), {
        name: "Roy",
        skill: "intermediate",
        link: link(ROY, "organizer"),
      });
      await setDoc(doc(db, "clubs", "c1", "players", "p-cat"), { name: "Cat", skill: "advanced" });
      for (let i = 0; i < 3; i++) {
        await setDoc(endedDoc(db, `s${i}`), {
          hostUid: ROY.uid,
          endedAt: 1000 + i,
          endedJson: "{}",
        });
      }
      await setDoc(doc(db, "clubs", "c1", "activeSession", "current"), {
        sessionJson: "{}",
        hostUid: ANA.uid,
        hostAccountId: ANA.accountId,
        hostName: ANA.name,
      });
      await setDoc(requestDoc(db, "r1"), {
        uid: ROY.uid,
        accountId: ROY.accountId,
        sessionId: "s",
        sessionPlayerId: "x",
        kind: "leave",
      });
    });
  }

  it("lets the Club's Organizer delete its Ended sessions, and nobody else", async () => {
    await seedSolo();
    await assertFails(deleteDoc(endedDoc(as(ANA.uid), "s0")));
    await assertFails(deleteDoc(endedDoc(anonymous(), "s0")));
    await assertSucceeds(deleteDoc(endedDoc(as(ROY.uid), "s0")));
  });

  it("lets an Organizer delete them with others on the Club too, and still refuses any update", async () => {
    await seedSolo({ others: true });
    await assertFails(updateDoc(endedDoc(as(ROY.uid), "s1"), { endedJson: "x" }));
    await assertSucceeds(deleteDoc(endedDoc(as(ROY.uid), "s0")));
  });

  it("refuses a member who isn't an Organizer", async () => {
    await seedSolo();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), { memberUids: [ANA.uid], organizerUids: [ANA.uid] });
    });
    await assertFails(deleteDoc(endedDoc(as(ROY.uid), "s0")));
  });

  it("lets the only member delete a whole Club: history in batches, then the rows, its Active session, its requests and the Club", async () => {
    await seedSolo();
    const db = as(ROY.uid);
    const history = writeBatch(db);
    for (let i = 0; i < 3; i++) history.delete(endedDoc(db, `s${i}`));
    await assertSucceeds(history.commit());

    const rest = writeBatch(db);
    rest.delete(requestDoc(db, "r1"));
    rest.delete(doc(db, "clubs", "c1", "activeSession", "current"));
    rest.delete(doc(db, "clubs", "c1", "players", "p-cat"));
    rest.delete(doc(db, "clubs", "c1", "players", "p-roy"));
    rest.delete(doc(db, "clubs", "c1"));
    await assertSucceeds(rest.commit());
  });

  it("lets an Organizer delete a Club's requests only together with the Club", async () => {
    await seedSolo();
    const db = as(ROY.uid);
    // On its own, a request is the host's (Ana's) to delete.
    await assertFails(deleteDoc(requestDoc(db, "r1")));
    const batch = writeBatch(db);
    batch.delete(requestDoc(db, "r1"));
    batch.delete(doc(db, "clubs", "c1", "activeSession", "current"));
    batch.delete(doc(db, "clubs", "c1", "players", "p-cat"));
    batch.delete(doc(db, "clubs", "c1", "players", "p-roy"));
    batch.delete(doc(db, "clubs", "c1"));
    await assertSucceeds(batch.commit());
  });

  it("lets a person delete their own Account but never its Account ID record, so nobody can take the ID over", async () => {
    await seedAccounts(ROY, BEN);
    await assertSucceeds(deleteDoc(doc(as(ROY.uid), "accounts", ROY.uid)));

    await assertFails(deleteDoc(doc(as(ROY.uid), "accountIds", ROY.accountId)));
    // The record still says it's Roy's: it can't be reserved again, by Ben or by Roy.
    const benDb = as(BEN.uid);
    const takeOver = writeBatch(benDb);
    takeOver.set(doc(benDb, "accountIds", ROY.accountId), { uid: BEN.uid });
    await assertFails(takeOver.commit());
    await assertFails(setDoc(doc(benDb, "accountIds", ROY.accountId), { uid: BEN.uid }));
    await assertSucceeds(getDoc(doc(benDb, "accountIds", ROY.accountId)));
  });

  it("refuses deleting somebody else's Account", async () => {
    await seedAccounts(ROY, BEN);
    await assertFails(deleteDoc(doc(as(BEN.uid), "accounts", ROY.uid)));
  });

  it("lets a person unlink their own row, an Organizer too while another Organizer stays", async () => {
    await seedAccounts(ROY, ANA);
    await seed(async (db) => {
      await setDoc(doc(db, "clubs", "c1"), {
        name: "Duo",
        memberUids: [ROY.uid, ANA.uid],
        organizerUids: [ROY.uid, ANA.uid],
      });
      await setDoc(doc(db, "clubs", "c1", "players", "p-roy"), {
        name: "Roy",
        skill: "intermediate",
        link: link(ROY, "organizer"),
      });
      await setDoc(doc(db, "clubs", "c1", "players", "p-ana"), {
        name: "Ana",
        skill: "beginner",
        link: link(ANA, "organizer"),
      });
    });
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-roy"), { link: deleteField() });
    batch.update(doc(db, "clubs", "c1"), {
      memberUids: arrayRemove(ROY.uid),
      organizerUids: arrayRemove(ROY.uid),
    });
    await assertSucceeds(batch.commit());
  });
});
