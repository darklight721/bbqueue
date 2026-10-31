import { describe, expect, it } from "vite-plus/test";
import { addPlayersLabel, joinNames } from "./roster.ts";

describe("addPlayersLabel", () => {
  it("counts the players to add", () => {
    expect(addPlayersLabel(0)).toBe("Add players");
    expect(addPlayersLabel(1)).toBe("Add 1 player");
    expect(addPlayersLabel(3)).toBe("Add 3 players");
  });
});

describe("joinNames", () => {
  it("joins names with commas and a final and", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Fay"])).toBe("Fay");
    expect(joinNames(["Fay", "Ben"])).toBe("Fay and Ben");
    expect(joinNames(["Fay", "Ben", "Cat"])).toBe("Fay, Ben and Cat");
  });
});
