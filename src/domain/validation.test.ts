import { describe, expect, it } from "vite-plus/test";
import {
  findDuplicateName,
  hasClubErrors,
  MAX_NAME_LENGTH,
  namesEqual,
  normalizeName,
  validateClub,
  validateName,
} from "./validation.ts";

describe("normalizeName / namesEqual", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeName("  Ann   Lee \t")).toBe("Ann Lee");
  });

  it("drops control, bidi and zero-width characters, and the spaces they leave behind", () => {
    expect(normalizeName("Ann\u200BLee")).toBe("AnnLee");
    expect(normalizeName("Ann \u200B Lee")).toBe("Ann Lee");
    expect(normalizeName("\u202EAnn\u202C")).toBe("Ann");
    expect(normalizeName("A\u0007n\u0000n")).toBe("Ann");
    expect(normalizeName("\uFEFFAnn")).toBe("Ann");
    // Whitespace of any kind still just separates words.
    expect(normalizeName("Ann\nLee\tSmith")).toBe("Ann Lee Smith");
  });

  it("keeps letters, accents and emoji", () => {
    expect(normalizeName("  José Núñez ")).toBe("José Núñez");
    expect(normalizeName("Zoë 🏸")).toBe("Zoë 🏸");
  });

  it("compares case-insensitively after normalizing", () => {
    expect(namesEqual("  ann  LEE", "Ann Lee")).toBe(true);
    expect(namesEqual("Ann", "Anna")).toBe(false);
  });
});

describe("findDuplicateName", () => {
  it("returns the index of the first equal entry or -1", () => {
    expect(findDuplicateName("bob", ["Al", "BOB", "Bob"])).toBe(1);
    expect(findDuplicateName("Cy", ["Al", "Bob"])).toBe(-1);
    expect(findDuplicateName("Cy", [])).toBe(-1);
  });
});

describe("validateName", () => {
  it("flags empty and whitespace-only names as required", () => {
    expect(validateName("", [])).toBe("required");
    expect(validateName("   ", ["x"])).toBe("required");
  });

  it("flags names longer than the maximum, counted after normalizing", () => {
    expect(validateName("a".repeat(MAX_NAME_LENGTH), [])).toBeNull();
    expect(validateName(`  ${"a".repeat(MAX_NAME_LENGTH)}   `, [])).toBeNull();
    expect(validateName("a".repeat(MAX_NAME_LENGTH + 1), [])).toBe("too-long");
  });

  it("treats a name of only invisible characters as empty", () => {
    expect(validateName("\u200B\u200B", [])).toBe("required");
    expect(validateName("\u202E", [])).toBe("required");
  });

  it("flags duplicates, ignoring case and padding", () => {
    expect(validateName(" ann ", ["Ann"])).toBe("duplicate");
  });

  it("accepts unique names", () => {
    expect(validateName("Ann", ["Bob"])).toBeNull();
  });
});

describe("validateClub", () => {
  it("returns no errors for a valid club", () => {
    const errors = validateClub({ name: "Club A", players: [{ name: "Ann" }, { name: "Bob" }] }, [
      "Club B",
    ]);
    expect(errors).toEqual({ name: null, players: [null, null] });
    expect(hasClubErrors(errors)).toBe(false);
  });

  it("checks the club name against other club names", () => {
    expect(validateClub({ name: "club b", players: [] }, ["Club B"]).name).toBe("duplicate");
    expect(validateClub({ name: " ", players: [] }, []).name).toBe("required");
  });

  it("flags both rows of a duplicate player pair", () => {
    const errors = validateClub(
      { name: "A", players: [{ name: "Ann" }, { name: "Bob" }, { name: " ANN" }] },
      [],
    );
    expect(errors.players).toEqual(["duplicate", null, "duplicate"]);
    expect(hasClubErrors(errors)).toBe(true);
  });

  it("flags empty player rows as required", () => {
    const errors = validateClub({ name: "A", players: [{ name: "" }, { name: "Bob" }] }, []);
    expect(errors.players).toEqual(["required", null]);
    expect(hasClubErrors(errors)).toBe(true);
  });
});
