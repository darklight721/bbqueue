import { normalizeAccountId, validateAccountId } from "../../domain/accountId.ts";
import type { Account, Role } from "../../domain/types.ts";
import type { PlayerRow } from "./clubForm.ts";

/** Where a row's Account link stands (only where linking is on). */
export type LinkState =
  /**
   * Linked to an Account. `saved` is false for a link made on this screen and not saved yet.
   * `exists` is false once a lookup shows it is gone, null while unknown.
   */
  | {
      kind: "linked";
      accountId: string;
      role: Role;
      isYou: boolean;
      saved: boolean;
      exists: boolean | null;
    }
  /** The name is an ordinary name: nothing to link. */
  | { kind: "none" }
  /** The name starts with `@`, and the rest: */
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "checking" }
  | { kind: "unknown" }
  | { kind: "offline" };

/** Accounts found by Account ID (null: none has it), keyed by normalised Account ID. */
export type Lookups = Record<string, Account | null>;

/** The messages that stop a Save. */
export function linkBlocksSave(state: LinkState): boolean {
  return ["invalid", "duplicate", "checking", "unknown", "offline"].includes(state.kind);
}

const PROBLEM_MESSAGE: Partial<Record<LinkState["kind"], string>> = {
  invalid: "That doesn't look like an Account ID, such as roy-7k3f.",
  duplicate: "That Account is already on this roster.",
  unknown: "No Account has that Account ID.",
  offline: "Linking an Account needs a connection.",
};

/**
 * The problem to show under a name field holding an `@Account ID`, if any. A half-typed ID isn't
 * scolded until the field is left or Save is tried (`complete`).
 */
export function linkProblem(state: LinkState, complete: boolean): string | null {
  const problem = PROBLEM_MESSAGE[state.kind];
  if (!problem) return null;
  return state.kind === "invalid" && !complete ? null : problem;
}

/**
 * The Account ID typed in a name field: the text after a leading `@`, or null when the text
 * doesn't start with `@` (an ordinary name).
 */
export function accountIdFromName(name: string): string | null {
  const text = name.trimStart();
  return text.startsWith("@") ? text.slice(1).trim() : null;
}

/** Account IDs worth looking up: typed ones that look right, and the ones rows are linked to. */
export function accountIdsToLookUp(rows: readonly PlayerRow[]): string[] {
  const wanted = new Set<string>();
  for (const row of rows) {
    if (row.link) {
      wanted.add(normalizeAccountId(row.link.accountId));
      continue;
    }
    const typed = accountIdFromName(row.name);
    if (typed && validateAccountId(typed) === null) wanted.add(normalizeAccountId(typed));
  }
  return [...wanted];
}

export interface LinkContext {
  lookups: Lookups;
  /** False offline; null while not known yet. */
  online: boolean | null;
  /** The signed-in Account's ID. */
  viewer: string | undefined;
  /** Saved links, by row id (normalised Account ID), to tell new links from saved ones. */
  savedLinks: ReadonlyMap<string, string>;
}

/** Where each row's Account link stands, by row id. */
export function linkStates(rows: readonly PlayerRow[], context: LinkContext) {
  const { lookups, online, viewer, savedLinks } = context;
  const states = new Map<string, LinkState>();
  const claimed = new Set<string>();
  for (const row of rows) if (row.link) claimed.add(normalizeAccountId(row.link.accountId));
  for (const row of rows) {
    if (row.link) {
      const key = normalizeAccountId(row.link.accountId);
      states.set(row.id, {
        kind: "linked",
        accountId: row.link.accountId,
        role: row.link.role,
        isYou: !!viewer && key === normalizeAccountId(viewer),
        saved: savedLinks.get(row.id) === key,
        exists: key in lookups ? lookups[key] !== null : null,
      });
      continue;
    }
    const typed = accountIdFromName(row.name);
    if (typed === null) {
      states.set(row.id, { kind: "none" });
      continue;
    }
    const key = normalizeAccountId(typed);
    if (validateAccountId(typed) !== null) states.set(row.id, { kind: "invalid" });
    else if (claimed.has(key)) states.set(row.id, { kind: "duplicate" });
    else {
      claimed.add(key);
      if (online === false) states.set(row.id, { kind: "offline" });
      else if (!(key in lookups)) states.set(row.id, { kind: "checking" });
      // Found rows become links straight away (see `applyFoundAccounts`); until then, checking.
      else states.set(row.id, { kind: lookups[key] === null ? "unknown" : "checking" });
    }
  }
  return states;
}

/**
 * Rows whose `@Account ID` matches an Account (that isn't on the roster yet) become linked to
 * it, as a Player, and take the Account's name. Returns the same array when nothing changed.
 */
export function applyFoundAccounts(
  rows: PlayerRow[],
  lookups: Lookups,
  online: boolean | null,
): PlayerRow[] {
  if (online === false) return rows;
  const claimed = new Set<string>();
  for (const row of rows) if (row.link) claimed.add(normalizeAccountId(row.link.accountId));
  let changed = false;
  const next = rows.map((row): PlayerRow => {
    if (row.link) return row;
    const typed = accountIdFromName(row.name);
    if (typed === null || validateAccountId(typed) !== null) return row;
    const key = normalizeAccountId(typed);
    const found = lookups[key];
    if (claimed.has(key) || !found) return row;
    claimed.add(key);
    changed = true;
    return { ...row, name: found.name, link: { accountId: found.accountId, role: "player" } };
  });
  return changed ? next : rows;
}
