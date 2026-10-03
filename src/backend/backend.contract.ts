import { describe, expect, it } from "vite-plus/test";
import { ACCOUNT_ID_ALPHABET, validateAccountId } from "../domain/accountId.ts";
import { MAX_NAME_LENGTH } from "../domain/validation.ts";
import type { Account } from "../domain/types.ts";
import { eventually } from "../test/eventually.ts";
import { BackendError, type Backend } from "./backend.ts";

export interface ContractOptions {
  /** Random source for Account IDs. */
  random: () => number;
  /** Account IDs somebody else already has. */
  takenAccountIds: string[];
  online: boolean;
  /** The device's Account to start with, as if it had been created earlier. */
  account: Account | null;
}

/**
 * The behaviour every Backend must have. Run against the in-memory and local fake versions and, on
 * the emulator, the Firebase version (`pnpm test:firebase`).
 */
export function runBackendContract(name: string, create: (options: ContractOptions) => Backend) {
  const make = (overrides: Partial<ContractOptions> = {}) =>
    create({
      random: Math.random,
      takenAccountIds: [],
      online: true,
      account: null,
      ...overrides,
    });

  /** Random source that picks the given alphabet indexes in turn. */
  const pick = (...indexes: number[]) => {
    let call = 0;
    return () => ((indexes[call++ % indexes.length] ?? 0) + 0.5) / ACCOUNT_ID_ALPHABET.length;
  };
  const chars = (...indexes: number[]) =>
    indexes.map((index) => ACCOUNT_ID_ALPHABET[index]).join("");

  async function rejection(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    return undefined;
  }

  describe(`Backend contract: ${name}`, () => {
    it("starts without an Account", async () => {
      expect(await make().getCurrentAccount()).toBeNull();
    });

    it("creates an Account with the name and a readable Account ID", async () => {
      const backend = make();
      const account = await backend.createAccount("  Roy   Smith ");

      expect(account.name).toBe("Roy Smith");
      expect(account.accountId).toMatch(new RegExp(`^roy-[${ACCOUNT_ID_ALPHABET}]{4}$`));
      expect(validateAccountId(account.accountId)).toBeNull();
      expect(await backend.getCurrentAccount()).toEqual(account);
    });

    it("tells observers about the current Account, then about a new one", async () => {
      const backend = make();
      const seen: (Account | null)[] = [];
      const stop = backend.observeCurrentAccount((account) => seen.push(account));

      const account = await backend.createAccount("Ana");
      await eventually(() => expect(seen.at(-1)).toEqual(account));
      stop();

      expect(seen[0]).toBeNull();
    });

    it("stops telling an observer once it unsubscribes", async () => {
      const backend = make();
      const seen: (Account | null)[] = [];
      backend.observeCurrentAccount((account) => seen.push(account))();

      await backend.createAccount("Ana");
      await backend.getCurrentAccount();

      expect(seen.filter((account) => account !== null)).toEqual([]);
    });

    it("tries again with new characters when the Account ID is taken", async () => {
      const taken = `roy-${chars(0, 0, 0, 0)}`;
      const backend = make({ takenAccountIds: [taken], random: pick(0, 0, 0, 0, 1, 1, 1, 1) });

      const account = await backend.createAccount("Roy");

      expect(account.accountId).toBe(`roy-${chars(1, 1, 1, 1)}`);
    });

    it("compares Account IDs ignoring case", async () => {
      const taken = `ROY-${chars(0, 0, 0, 0)}`.toUpperCase();
      const backend = make({ takenAccountIds: [taken], random: pick(0, 0, 0, 0, 1, 1, 1, 1) });

      expect((await backend.createAccount("Roy")).accountId).toBe(`roy-${chars(1, 1, 1, 1)}`);
    });

    it("gives up when every Account ID it tries is taken", async () => {
      const backend = make({
        takenAccountIds: [`roy-${chars(0, 0, 0, 0)}`],
        random: pick(0),
      });

      const error = await rejection(backend.createAccount("Roy"));

      expect(error).toBeInstanceOf(BackendError);
      expect((error as BackendError).code).toBe("id-unavailable");
      expect(await backend.getCurrentAccount()).toBeNull();
    });

    it("needs a connection to create an Account", async () => {
      const backend = make({ online: false });

      const error = await rejection(backend.createAccount("Ana"));

      expect((error as BackendError).code).toBe("offline");
      expect(await backend.getCurrentAccount()).toBeNull();
    });

    it("rejects an empty name", async () => {
      const backend = make();

      expect(((await rejection(backend.createAccount("   "))) as BackendError).code).toBe(
        "invalid-name",
      );
      expect(await backend.getCurrentAccount()).toBeNull();
    });

    it("rejects a name that is too long", async () => {
      const backend = make();

      const error = await rejection(backend.createAccount("x".repeat(MAX_NAME_LENGTH + 1)));

      expect((error as BackendError).code).toBe("invalid-name");
      expect(await backend.getCurrentAccount()).toBeNull();
    });

    it("gives a device only one Account", async () => {
      const backend = make();
      const first = await backend.createAccount("Ana");

      const error = await rejection(backend.createAccount("Ben"));

      expect((error as BackendError).code).toBe("account-exists");
      expect(await backend.getCurrentAccount()).toEqual(first);
    });

    describe("renaming the Account", () => {
      const existing: Account = { accountId: `roy-${chars(2, 3, 4, 5)}`, name: "Roy" };

      it("changes the name and keeps the Account ID", async () => {
        const backend = make({ account: existing });

        const renamed = await backend.renameAccount("  Roy   Smith ");

        expect(renamed).toEqual({ accountId: existing.accountId, name: "Roy Smith" });
        expect(await backend.getCurrentAccount()).toEqual(renamed);
      });

      it("keeps the Account ID of an Account created on this device", async () => {
        const backend = make();
        const created = await backend.createAccount("Ana");

        await backend.renameAccount("Bea");

        expect(await backend.getCurrentAccount()).toEqual({
          accountId: created.accountId,
          name: "Bea",
        });
      });

      it("tells observers about the new name", async () => {
        const backend = make({ account: existing });
        const seen: (Account | null)[] = [];
        const stop = backend.observeCurrentAccount((account) => seen.push(account));

        await backend.renameAccount("Royston");
        await eventually(() => expect(seen.at(-1)).toEqual({ ...existing, name: "Royston" }));
        stop();

        expect(seen).toContainEqual(existing);
      });

      it("needs a connection", async () => {
        const backend = make({ account: existing, online: false });

        const error = await rejection(backend.renameAccount("Royston"));

        expect(error).toBeInstanceOf(BackendError);
        expect((error as BackendError).code).toBe("offline");
        expect(await backend.getCurrentAccount()).toEqual(existing);
      });

      it("rejects an empty name", async () => {
        const backend = make({ account: existing });

        const error = await rejection(backend.renameAccount("   "));

        expect((error as BackendError).code).toBe("invalid-name");
        expect(await backend.getCurrentAccount()).toEqual(existing);
      });

      it("needs an Account", async () => {
        const backend = make();

        const error = await rejection(backend.renameAccount("Roy"));

        expect((error as BackendError).code).toBe("no-account");
        expect(await backend.getCurrentAccount()).toBeNull();
      });
    });
  });
}
