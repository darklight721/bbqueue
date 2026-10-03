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

  it("lets an Organizer rename but never empty the Organizer list or name nobody an Organizer without making them a member", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerAccountIds: [] }));
    await assertFails(
      updateDoc(doc(db, "clubs", "c1"), { organizerAccountIds: [ROY.accountId, BEN.accountId] }),
    );
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { createdBy: ROY.accountId }));
  });
});

/** Roy (Organizer) and Ana (Player) are on Club `c1`; Cat is an unlinked row. */
const club = (uid: string) => doc(as(uid), "clubs", "c1");

describe("Linking Accounts and Roles", () => {
  it("lets an Organizer link a row, with the Club's lists changed in the same batch", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), {
      link: { accountId: BEN.accountId, role: "player" },
    });
    batch.update(doc(db, "clubs", "c1"), { memberAccountIds: arrayUnion(BEN.accountId) });
    await assertSucceeds(batch.commit());
  });

  it("lets an Organizer link an Account as Organizer, listing it as one", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), {
      link: { accountId: BEN.accountId, role: "organizer" },
    });
    batch.update(doc(db, "clubs", "c1"), {
      memberAccountIds: arrayUnion(BEN.accountId),
      organizerAccountIds: arrayUnion(BEN.accountId),
    });
    await assertSucceeds(batch.commit());
  });

  it("refuses a link when the Club's lists don't change with it", async () => {
    await seedClub();
    const db = as(ROY.uid);
    await assertFails(
      updateDoc(doc(db, "clubs", "c1", "players", "p-cat"), {
        link: { accountId: BEN.accountId, role: "player" },
      }),
    );
    // Linked as Organizer but listed only as a member.
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), {
      link: { accountId: BEN.accountId, role: "organizer" },
    });
    batch.update(doc(db, "clubs", "c1"), { memberAccountIds: arrayUnion(BEN.accountId) });
    await assertFails(batch.commit());
  });

  it("refuses a Player linking anybody, even themselves", async () => {
    await seedClub();
    const db = as(ANA.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-cat"), {
      link: { accountId: BEN.accountId, role: "player" },
    });
    batch.update(doc(db, "clubs", "c1"), { memberAccountIds: arrayUnion(BEN.accountId) });
    await assertFails(batch.commit());

    const promote = writeBatch(db);
    promote.update(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    promote.update(doc(db, "clubs", "c1"), { organizerAccountIds: arrayUnion(ANA.accountId) });
    await assertFails(promote.commit());
  });

  it("lets an Organizer change a Role, with the Organizer list in step", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const promote = writeBatch(db);
    promote.update(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    promote.update(doc(db, "clubs", "c1"), { organizerAccountIds: arrayUnion(ANA.accountId) });
    await assertSucceeds(promote.commit());
  });

  it("lets an Organizer unlink another Account and take it off the lists", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-ana"), { link: deleteField() });
    batch.update(doc(db, "clubs", "c1"), { memberAccountIds: arrayRemove(ANA.accountId) });
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
    batch.update(doc(db, "clubs", "c1"), { memberAccountIds: arrayRemove(ANA.accountId) });
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
    batch.update(doc(db, "clubs", "c1"), { organizerAccountIds: arrayRemove(ROY.accountId) });
    await assertFails(batch.commit());
  });

  it("can't be unlinked, removed or leave", async () => {
    await seedClub();
    const db = as(ROY.uid);
    const unlink = writeBatch(db);
    unlink.update(doc(db, "clubs", "c1", "players", "p-roy"), { link: deleteField() });
    unlink.update(doc(db, "clubs", "c1"), {
      memberAccountIds: arrayRemove(ROY.accountId),
      organizerAccountIds: arrayRemove(ROY.accountId),
    });
    await assertFails(unlink.commit());

    const remove = writeBatch(db);
    remove.delete(doc(db, "clubs", "c1", "players", "p-roy"));
    remove.update(doc(db, "clubs", "c1"), {
      memberAccountIds: arrayRemove(ROY.accountId),
      organizerAccountIds: arrayRemove(ROY.accountId),
    });
    await assertFails(remove.commit());
  });

  it("can step down once another Organizer exists", async () => {
    await seedClub();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), {
        organizerAccountIds: [ROY.accountId, ANA.accountId],
      });
      await updateDoc(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    });
    const db = as(ROY.uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", "p-roy"), { "link.role": "player" });
    batch.update(doc(db, "clubs", "c1"), { organizerAccountIds: arrayRemove(ROY.accountId) });
    await assertSucceeds(batch.commit());
  });
});

describe("Leaving a Club", () => {
  const leave = (
    uid: string,
    rowId: string,
    accountId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.update(doc(db, "clubs", "c1", "players", rowId), { link: deleteField(), ...extra });
    batch.update(doc(db, "clubs", "c1"), {
      memberAccountIds: arrayRemove(accountId),
      organizerAccountIds: arrayRemove(accountId),
    });
    return batch.commit();
  };

  it("lets a linked Account unlink itself: its row stays, and it leaves the lists", async () => {
    await seedClub();
    await assertSucceeds(leave(ANA.uid, "p-ana", ANA.accountId));
    // The row is still on the roster.
    await env.withSecurityRulesDisabled(async (context) => {
      const row = await getDoc(doc(context.firestore(), "clubs", "c1", "players", "p-ana"));
      await assertSucceeds(
        Promise.resolve(row.exists() ? row : Promise.reject(new Error("row gone"))),
      );
    });
  });

  it("refuses leaving without taking the Account off the lists", async () => {
    await seedClub();
    await assertFails(
      updateDoc(doc(as(ANA.uid), "clubs", "c1", "players", "p-ana"), { link: deleteField() }),
    );
  });

  it("refuses changing the row while leaving", async () => {
    await seedClub();
    await assertFails(leave(ANA.uid, "p-ana", ANA.accountId, { name: "Somebody else" }));
  });

  it("refuses unlinking somebody else", async () => {
    await seedClub();
    await assertFails(leave(ANA.uid, "p-roy", ROY.accountId));
    await assertFails(leave(ANA.uid, "p-roy", ANA.accountId));
  });

  it("refuses taking others off the lists", async () => {
    await seedClub();
    const db = as(ANA.uid);
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { memberAccountIds: [ANA.accountId] }));
    await assertFails(updateDoc(doc(db, "clubs", "c1"), { organizerAccountIds: [] }));
  });

  it("is open to an Organizer when another Organizer remains", async () => {
    await seedClub();
    await seed(async (db) => {
      await updateDoc(doc(db, "clubs", "c1"), {
        organizerAccountIds: [ROY.accountId, ANA.accountId],
      });
      await updateDoc(doc(db, "clubs", "c1", "players", "p-ana"), { "link.role": "organizer" });
    });
    await assertSucceeds(leave(ROY.uid, "p-roy", ROY.accountId));
  });

  it("lets a Club that has been left no longer be read by the one who left", async () => {
    await seedClub();
    await leave(ANA.uid, "p-ana", ANA.accountId);
    await assertFails(getDoc(club(ANA.uid)));
  });
});
