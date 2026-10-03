import { describe, expect, it } from "vite-plus/test";
import { ACCOUNT_ID_ALPHABET, validateAccountId } from "../domain/accountId.ts";
import type { Account } from "../domain/types.ts";
import { BackendError, type Backend } from "./backend.ts";

export interface ContractOptions {
  /** Random source for Account IDs. */
  random: () => number;
  /** Account IDs somebody else already has. */
  takenAccountIds: string[];
  online: boolean;
}

/**
 * The behaviour every Backend must have. Run against the in-memory and local fake versions; the
 * Firebase version joins once the emulator is wired in (pass a factory that points at it).
 */
export function runBackendContract(name: string, create: (options: ContractOptions) => Backend) {
  const make = (overrides: Partial<ContractOptions> = {}) =>
    create({ random: Math.random, takenAccountIds: [], online: true, ...overrides });

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
      stop();
      await backend.getCurrentAccount();

      expect(seen).toEqual([null, account]);
    });

    it("stops telling an observer once it unsubscribes", async () => {
      const backend = make();
      const seen: (Account | null)[] = [];
      backend.observeCurrentAccount((account) => seen.push(account))();

      await backend.createAccount("Ana");

      expect(seen).toEqual([null]);
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

    it("gives a device only one Account", async () => {
      const backend = make();
      const first = await backend.createAccount("Ana");

      const error = await rejection(backend.createAccount("Ben"));

      expect((error as BackendError).code).toBe("account-exists");
      expect(await backend.getCurrentAccount()).toEqual(first);
    });
  });
}
