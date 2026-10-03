import { describe, expect, it } from "vite-plus/test";
import type { Club, ClubPlayer } from "../domain/types.ts";
import { BackendError, type Backend } from "./backend.ts";

export interface ClubsContractHarness {
  backend: Backend;
  /** Lose or regain the connection (the emulator version uses disableNetwork/enableNetwork). */
  setOnline: (online: boolean) => void;
}

const ana: ClubPlayer = { id: "p-ana", name: "Ana", skill: "beginner" };

/**
 * Shared clubs behaviour every Backend must have. Run against the in-memory and local fake
 * versions; the Firebase version joins once the emulator is wired in.
 */
export function runSharedClubsContract(name: string, create: () => ClubsContractHarness) {
  /** A Backend whose device already has an Account called Roy, plus a way to watch Shared clubs. */
  async function signedIn() {
    const harness = create();
    const account = await harness.backend.createAccount("Roy");
    let latest: Club[] = [];
    const stop = harness.backend.observeSharedClubs((clubs) => (latest = clubs));
    return { ...harness, account, clubs: () => latest, stop };
  }

  async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    return undefined;
  }

  describe(`Shared clubs contract: ${name}`, () => {
    it("has no Shared clubs without an Account", () => {
      const { backend } = create();
      let seen: Club[] | null = null;
      backend.observeSharedClubs((clubs) => (seen = clubs))();
      expect(seen).toEqual([]);
    });

    it("needs an Account to create a Shared club", async () => {
      const { backend } = create();

      const error = await rejection(
        backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] }),
      );

      expect((error as BackendError).code).toBe("no-account");
    });

    it("creates a Shared club with the creator as Organizer, Intermediate, first on the roster", async () => {
      const { backend, account, clubs } = await signedIn();

      const created = await backend.createSharedClub({
        id: "c1",
        name: " Tuesday  Club ",
        players: [ana],
      });

      expect(created).toMatchObject({ id: "c1", name: "Tuesday Club", kind: "shared" });
      expect(created.players).toHaveLength(2);
      expect(created.players[0]).toMatchObject({
        name: "Roy",
        skill: "intermediate",
        link: { accountId: account.accountId, role: "organizer" },
      });
      expect(created.players[1]).toEqual(ana);
      expect(clubs()).toEqual([created]);
    });

    it("rejects an empty Club name", async () => {
      const { backend } = await signedIn();

      const error = await rejection(
        backend.createSharedClub({ id: "c1", name: "  ", players: [] }),
      );

      expect((error as BackendError).code).toBe("invalid-name");
    });

    it("tells observers about the Club right away when they subscribe later", async () => {
      const { backend } = await signedIn();
      const created = await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });

      let seen: Club[] = [];
      backend.observeSharedClubs((clubs) => (seen = clubs))();

      expect(seen).toEqual([created]);
    });

    it("stops telling an observer once it unsubscribes", async () => {
      const { backend, stop, clubs } = await signedIn();
      stop();

      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });

      expect(clubs()).toEqual([]);
    });

    it("renames the Club", async () => {
      const { backend, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });

      await backend.renameSharedClub("c1", " Friday ");

      expect(clubs()[0]?.name).toBe("Friday");
    });

    it("edits one Club player row, leaving the others alone", async () => {
      const { backend, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [ana] });
      const before = clubs()[0]!.players;

      await backend.updateClubPlayer("c1", ana.id, { skill: "advanced" });
      await backend.updateClubPlayer("c1", ana.id, { name: "Anna" });

      const after = clubs()[0]!.players;
      expect(after.find((p) => p.id === ana.id)).toEqual({
        ...ana,
        name: "Anna",
        skill: "advanced",
      });
      expect(after[0]).toEqual(before[0]);
    });

    it("adds and removes a Club player row", async () => {
      const { backend, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });

      await backend.addClubPlayer("c1", ana);
      expect(clubs()[0]?.players.map((p) => p.id)).toContain(ana.id);

      await backend.removeClubPlayer("c1", ana.id);
      expect(clubs()[0]?.players.map((p) => p.id)).not.toContain(ana.id);
    });

    it("deletes the Club", async () => {
      const { backend, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });

      await backend.deleteSharedClub("c1");

      expect(clubs()).toEqual([]);
    });

    it("rejects changes to a Club that doesn't exist", async () => {
      const { backend } = await signedIn();

      const error = await rejection(backend.renameSharedClub("nope", "X"));

      expect((error as BackendError).code).toBe("not-found");
    });

    it("needs a connection to add a Club player row", async () => {
      const { backend, setOnline, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });
      setOnline(false);

      const error = await rejection(backend.addClubPlayer("c1", ana));

      expect((error as BackendError).code).toBe("offline");
      expect(clubs()[0]?.players.map((p) => p.id)).not.toContain(ana.id);
    });

    it("keeps edits made offline, and the latest change to a row wins once back online", async () => {
      const { backend, setOnline, clubs } = await signedIn();
      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [ana] });
      setOnline(false);

      await backend.updateClubPlayer("c1", ana.id, { skill: "intermediate" });
      await backend.updateClubPlayer("c1", ana.id, { skill: "advanced" });
      await backend.renameSharedClub("c1", "Friday");
      await backend.removeClubPlayer("c1", "nobody");

      // Offline, the device already shows its own changes.
      expect(clubs()[0]?.name).toBe("Friday");
      expect(clubs()[0]?.players.find((p) => p.id === ana.id)?.skill).toBe("advanced");

      setOnline(true);

      expect(clubs()[0]?.name).toBe("Friday");
      expect(clubs()[0]?.players.find((p) => p.id === ana.id)?.skill).toBe("advanced");
    });

    it("lets a Club be created offline and keeps it once back online", async () => {
      const { backend, setOnline, clubs } = await signedIn();
      setOnline(false);

      await backend.createSharedClub({ id: "c1", name: "Tuesday", players: [] });
      expect(clubs().map((club) => club.id)).toEqual(["c1"]);

      setOnline(true);
      expect(clubs().map((club) => club.id)).toEqual(["c1"]);
    });
  });
}
