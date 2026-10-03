// @vitest-environment node
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import rules from "../../firestore.rules?raw";
import { afterAll, beforeAll, beforeEach, describe, it } from "vite-plus/test";
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

async function seedAccounts(...people: (typeof ROY)[]) {
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

describe("Account rules", () => {
  it("lets a person create their own Account together with its Account ID record", async () => {
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", ROY.accountId), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ROY.uid), { accountId: "Roy-7K3F", name: ROY.name });
    await assertSucceeds(batch.commit());
  });

  it("refuses an Account without its Account ID record", async () => {
    const db = as(ROY.uid);
    await assertFails(
      setDoc(doc(db, "accounts", ROY.uid), { accountId: ROY.accountId, name: "Roy" }),
    );
  });

  it("refuses an Account for somebody else", async () => {
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.set(doc(db, "accountIds", ROY.accountId), { uid: ROY.uid });
    batch.set(doc(db, "accounts", ANA.uid), { accountId: ROY.accountId, name: "Roy" });
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

  it("lets only the owner change their name, never their Account ID", async () => {
    await seedAccounts(ROY, ANA);
    await assertSucceeds(updateDoc(doc(as(ROY.uid), "accounts", ROY.uid), { name: "Royston" }));
    await assertFails(updateDoc(doc(as(ROY.uid), "accounts", ROY.uid), { accountId: "roy-9999" }));
    await assertFails(updateDoc(doc(as(ANA.uid), "accounts", ROY.uid), { name: "Mine now" }));
  });

  it("lets only the owner read or delete their Account", async () => {
    await seedAccounts(ROY, ANA);
    await assertSucceeds(getDoc(doc(as(ROY.uid), "accounts", ROY.uid)));
    await assertFails(getDoc(doc(as(ANA.uid), "accounts", ROY.uid)));
    await assertFails(getDoc(doc(anonymous(), "accounts", ROY.uid)));
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
      memberAccountIds: [ROY.accountId, ANA.accountId],
      organizerAccountIds: [ROY.accountId],
    });
    await setDoc(doc(db, "clubs", "c1", "players", "p-roy"), {
      name: "Roy",
      skill: "intermediate",
      link: { accountId: ROY.accountId, role: "organizer" },
    });
    await setDoc(doc(db, "clubs", "c1", "players", "p-ana"), {
      name: "Ana",
      skill: "beginner",
      link: { accountId: ANA.accountId, role: "player" },
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
      memberAccountIds: [ROY.accountId],
      organizerAccountIds: [ROY.accountId],
    });
    batch.set(doc(db, "clubs", "c1", "players", "p-roy"), {
      name: "Roy",
      skill: "intermediate",
      link: { accountId: ROY.accountId, role: "organizer" },
    });
    await assertSucceeds(batch.commit());
  });

  it("refuses a Club that makes somebody else a member or Organizer", async () => {
    await seedAccounts(ROY, ANA);
    const db = as(ROY.uid);
    await assertFails(
      setDoc(doc(db, "clubs", "c1"), {
        name: "Tuesday",
        memberAccountIds: [ROY.accountId, ANA.accountId],
        organizerAccountIds: [ROY.accountId],
      }),
    );
    await assertFails(
      setDoc(doc(db, "clubs", "c2"), {
        name: "Tuesday",
        memberAccountIds: [ANA.accountId],
        organizerAccountIds: [ANA.accountId],
      }),
    );
  });

  it("refuses a Club from somebody without an Account", async () => {
    await assertFails(
      setDoc(doc(as("nobody"), "clubs", "c1"), {
        name: "Tuesday",
        memberAccountIds: ["x"],
        organizerAccountIds: ["x"],
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
    const mine = (uid: string, accountId: string) =>
      getDocs(
        query(collection(as(uid), "clubs"), where("memberAccountIds", "array-contains", accountId)),
      );
    await assertSucceeds(mine(ANA.uid, ANA.accountId));
    await assertFails(mine(BEN.uid, ANA.accountId));
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

  it("keeps an Organizer from adding themselves or others to the member lists", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(
      updateDoc(doc(db, "clubs", "c1"), { memberAccountIds: [ROY.accountId, BEN.accountId] }),
    );
    await assertFails(
      updateDoc(doc(db, "clubs", "c1"), { organizerAccountIds: [ROY.accountId, ANA.accountId] }),
    );
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
  });
});
