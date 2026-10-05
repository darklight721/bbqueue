import { describe, expect, it } from "vite-plus/test";
import type { PlayerRow } from "./clubForm.ts";
import {
  accountIdFromName,
  accountIdsToLookUp,
  applyFoundAccounts,
  linkProblem,
  linkStates,
  type LinkContext,
} from "./linkState.ts";

const ana = { accountId: "ana-2222", name: "Ana Bell" };
const roy = { accountId: "roy-7k3f", name: "Roy Smith" };
const row = (id: string, name: string, link?: PlayerRow["link"]): PlayerRow => ({
  id,
  name,
  skill: "intermediate",
  ...(link ? { link } : {}),
});
const context = (overrides: Partial<LinkContext> = {}): LinkContext => ({
  lookups: {},
  online: true,
  viewer: roy.accountId,
  savedLinks: new Map([["r", "roy-7k3f"]]),
  ...overrides,
});
const me = row("r", "Roy Smith", { accountId: roy.accountId, role: "organizer" });

describe("accountIdFromName", () => {
  it("reads text that starts with @ as an Account ID", () => {
    expect(accountIdFromName("@ana-2222")).toBe("ana-2222");
    expect(accountIdFromName("  @ Ana-2222 ")).toBe("Ana-2222");
    expect(accountIdFromName("@")).toBe("");
  });

  it("leaves other names alone, @ anywhere else included", () => {
    expect(accountIdFromName("Ana")).toBeNull();
    expect(accountIdFromName("Ana @ home")).toBeNull();
    expect(accountIdFromName("")).toBeNull();
  });
});

describe("accountIdsToLookUp", () => {
  it("wants linked Accounts and typed IDs that look right, once, in lowercase", () => {
    expect(
      accountIdsToLookUp([me, row("a", "@ANA-2222"), row("b", "@ana-2222"), row("c", "@ana")]),
    ).toEqual(["roy-7k3f", "ana-2222"]);
  });
});

describe("linkStates", () => {
  it("tells saved links from new ones, and spots You", () => {
    const states = linkStates(
      [me, row("a", "Ana Bell", { accountId: ana.accountId, role: "player" })],
      context({ lookups: { "ana-2222": ana } }),
    );
    expect(states.get("r")).toMatchObject({ kind: "linked", saved: true, isYou: true });
    expect(states.get("a")).toMatchObject({
      kind: "linked",
      saved: false,
      isYou: false,
      exists: true,
    });
  });

  it("follows a typed @Account ID: invalid, checking, unknown, duplicate, offline", () => {
    const rows = [
      me,
      row("x", "@ana"),
      row("y", "@ana-2222"),
      row("z", "@nobody-abcd"),
      row("d", "@ROY-7K3F"),
      row("n", "Ben"),
    ];
    const states = linkStates(rows, context({ lookups: { "nobody-abcd": null } }));
    expect(Object.fromEntries([...states].map(([id, state]) => [id, state.kind]))).toEqual({
      r: "linked",
      x: "invalid",
      y: "checking",
      z: "unknown",
      d: "duplicate",
      n: "none",
    });
    expect(linkStates([row("y", "@ana-2222")], context({ online: false })).get("y")?.kind).toBe(
      "offline",
    );
  });
});

describe("applyFoundAccounts", () => {
  it("links a row to the Account its @Account ID names, as a Player, with the Account's name", () => {
    const rows = [me, row("a", "@ANA-2222")];
    expect(applyFoundAccounts(rows, { "ana-2222": ana }, true)).toEqual([
      me,
      row("a", "Ana Bell", { accountId: "ana-2222", role: "player" }),
    ]);
  });

  it("changes nothing until found, offline, or for an Account already on the roster", () => {
    const waiting = [me, row("a", "@ana-2222")];
    expect(applyFoundAccounts(waiting, {}, true)).toBe(waiting);
    expect(applyFoundAccounts(waiting, { "ana-2222": ana }, false)).toBe(waiting);
    const again = [me, row("a", `@${roy.accountId}`)];
    expect(applyFoundAccounts(again, { "roy-7k3f": roy }, true)).toBe(again);
  });

  it("links only the first of two rows naming the same Account", () => {
    const rows = [row("a", "@ana-2222"), row("b", "@ana-2222")];
    const next = applyFoundAccounts(rows, { "ana-2222": ana }, true);
    expect(next.map((r) => [r.name, r.link?.accountId ?? null])).toEqual([
      ["Ana Bell", "ana-2222"],
      ["@ana-2222", null],
    ]);
  });
});

describe("linkProblem", () => {
  it("holds back a half-typed Account ID until the field is done with", () => {
    expect(linkProblem({ kind: "invalid" }, false)).toBeNull();
    expect(linkProblem({ kind: "invalid" }, true)).toBe(
      "That doesn't look like an Account ID, such as roy-7k3f.",
    );
    expect(linkProblem({ kind: "unknown" }, false)).toBe("No Account has that Account ID.");
    expect(linkProblem({ kind: "checking" }, true)).toBeNull();
  });
});
