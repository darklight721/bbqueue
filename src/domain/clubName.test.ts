import { describe, expect, it } from "vite-plus/test";
import { displayClubName } from "./clubName.ts";
import type { Club } from "./types.ts";

const clubs: Club[] = [{ id: "c1", name: "Riverside", kind: "local", players: [] }];

describe("displayClubName", () => {
  it("uses the Club's current name while the Club exists", () => {
    expect(displayClubName("c1", "Old name", clubs)).toBe("Riverside");
    expect(displayClubName("c1", null, clubs)).toBe("Riverside");
  });

  it("falls back to the saved name when the Club was deleted", () => {
    expect(displayClubName("gone", "Hilltop", clubs)).toBe("Hilltop");
  });

  it("is null for a deleted Club with no saved name (old data)", () => {
    expect(displayClubName("gone", null, clubs)).toBeNull();
  });

  it("is null when there is no Club", () => {
    expect(displayClubName(null, null, clubs)).toBeNull();
    expect(displayClubName(null, "Stale", clubs)).toBeNull();
  });
});
