import { describe, expect, it } from "vite-plus/test";
import { initials } from "./initials.ts";

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Roy Smith")).toBe("RS");
    expect(initials("roy smith")).toBe("RS");
    expect(initials("Ana María López García")).toBe("AM");
  });

  it("gives one letter for a one-word name", () => {
    expect(initials("Roy")).toBe("R");
    expect(initials("  ana  ")).toBe("A");
  });

  it("keeps accents", () => {
    expect(initials("émile zola")).toBe("ÉZ");
    expect(initials("Łukasz Ölund")).toBe("ŁÖ");
    // Decomposed (e + combining acute) comes out as one letter.
    expect(initials("e\u0301mile")).toBe("É");
  });

  it("works in other scripts", () => {
    expect(initials("Дмитрий Иванов")).toBe("ДИ");
    expect(initials("李 小龍")).toBe("李小");
  });

  it("ignores extra spaces and skips leading punctuation", () => {
    expect(initials("  Roy \t  Smith  ")).toBe("RS");
    expect(initials("(Roy) 'Smith'")).toBe("RS");
  });

  it("skips words without a letter", () => {
    expect(initials("🏸 Roy - Smith")).toBe("RS");
    expect(initials("Roy 2")).toBe("R2");
  });

  it("is empty when there is nothing to show", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
    expect(initials("🏸")).toBe("");
  });
});
