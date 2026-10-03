import { describe, expect, it } from "vite-plus/test";
import {
  ACCOUNT_ID_ALPHABET,
  accountIdSlug,
  accountIdsEqual,
  generateAccountId,
  normalizeAccountId,
  validateAccountId,
  type RandomSource,
} from "./accountId.ts";

/** Random source that picks the given alphabet indexes in turn. */
function pick(...indexes: number[]): RandomSource {
  let call = 0;
  return () => ((indexes[call++ % indexes.length] ?? 0) + 0.5) / ACCOUNT_ID_ALPHABET.length;
}

describe("ACCOUNT_ID_ALPHABET", () => {
  it("has no look-alikes", () => {
    expect(ACCOUNT_ID_ALPHABET).not.toMatch(/[01oli]/);
    expect(new Set(ACCOUNT_ID_ALPHABET).size).toBe(ACCOUNT_ID_ALPHABET.length);
  });
});

describe("accountIdSlug", () => {
  it("uses the first word, lowercased", () => {
    expect(accountIdSlug("Roy Smith")).toBe("roy");
    expect(accountIdSlug("  ANA  ")).toBe("ana");
  });

  it("strips accents", () => {
    expect(accountIdSlug("Zoë")).toBe("zoe");
    expect(accountIdSlug("José María")).toBe("jose");
  });

  it("drops anything that is not a letter or digit", () => {
    expect(accountIdSlug("O'Brien")).toBe("obrien");
    expect(accountIdSlug("Mary-Jane Lee")).toBe("maryjane");
  });

  it("falls back to player", () => {
    expect(accountIdSlug("")).toBe("player");
    expect(accountIdSlug("   ")).toBe("player");
    expect(accountIdSlug("李雷")).toBe("player");
    expect(accountIdSlug("!!!")).toBe("player");
  });

  it("keeps long names short", () => {
    expect(accountIdSlug("Wolfeschlegelsteinhausenbergerdorff").length).toBeLessThanOrEqual(12);
  });
});

describe("generateAccountId", () => {
  it("is slug, dash and 4 characters from the alphabet", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateAccountId("Roy Smith")).toMatch(
        new RegExp(`^roy-[${ACCOUNT_ID_ALPHABET}]{4}$`),
      );
    }
  });

  it("uses the injected random source", () => {
    const id = generateAccountId("Roy", pick(0, 1, 2, 3));
    expect(id).toBe(`roy-${ACCOUNT_ID_ALPHABET.slice(0, 4)}`);
  });

  it("can reach the last character even when random returns just under 1", () => {
    const id = generateAccountId("Roy", () => 0.9999999999);
    expect(id.endsWith(ACCOUNT_ID_ALPHABET.at(-1)!.repeat(4))).toBe(true);
  });

  it("falls back to player for unusable names", () => {
    expect(generateAccountId("", pick(0))).toMatch(/^player-/);
  });
});

describe("normalizeAccountId / accountIdsEqual", () => {
  it("trims and lowercases", () => {
    expect(normalizeAccountId("  Roy-7K3F ")).toBe("roy-7k3f");
  });

  it("compares ignoring case", () => {
    expect(accountIdsEqual("ROY-7K3F", "roy-7k3f")).toBe(true);
    expect(accountIdsEqual("roy-7k3f", "roy-7k3g")).toBe(false);
  });
});

describe("validateAccountId", () => {
  it("accepts generated IDs in any case", () => {
    expect(validateAccountId("roy-7k3f")).toBeNull();
    expect(validateAccountId(" ROY-7K3F ")).toBeNull();
    expect(validateAccountId(generateAccountId("Ana"))).toBeNull();
  });

  it("requires a value", () => {
    expect(validateAccountId("")).toBe("required");
    expect(validateAccountId("   ")).toBe("required");
  });

  it("rejects the wrong shape", () => {
    expect(validateAccountId("roy")).toBe("invalid");
    expect(validateAccountId("roy-7k3")).toBe("invalid");
    expect(validateAccountId("roy-7k3fx")).toBe("invalid");
    expect(validateAccountId("-7k3f")).toBe("invalid");
    expect(validateAccountId("roy 7k3f")).toBe("invalid");
  });

  it("rejects look-alike characters in the suffix", () => {
    expect(validateAccountId("roy-0k3f")).toBe("invalid");
    expect(validateAccountId("roy-1k3f")).toBe("invalid");
    expect(validateAccountId("roy-oooo")).toBe("invalid");
  });
});
