import { describe, expect, it } from "vite-plus/test";
import type { Club } from "../../domain/types.ts";
import {
  clashingGuestIds,
  defaultSessionName,
  initialClubChoice,
  newSessionForClubPath,
  NO_CHOICE,
  NO_CLUB,
  planStart,
  selectedLabel,
  sessionClubParam,
} from "./newSession.ts";

const club = (id: string, names: string[] = []): Club => ({
  id,
  name: id,
  players: names.map((name, index) => ({ id: `${id}-${index}`, name, skill: "intermediate" })),
});

describe("newSession helpers", () => {
  it("formats the default name with the device locale", () => {
    const date = new Date(2026, 9, 1);
    expect(defaultSessionName(date)).toBe(
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date),
    );
  });

  it("pre-selects the Club only when the choice is obvious", () => {
    expect(initialClubChoice([])).toBe(NO_CLUB);
    expect(initialClubChoice([club("a")])).toBe("a");
    expect(initialClubChoice([club("a"), club("b")])).toBe(NO_CHOICE);
  });

  it("reads a known Club from ?club= and ignores unknown or missing ones", () => {
    const clubs = [club("a"), club("b")];
    expect(sessionClubParam("?club=b", clubs)).toBe("b");
    expect(sessionClubParam("club=a", clubs)).toBe("a");
    expect(sessionClubParam("?club=nope", clubs)).toBeNull();
    expect(sessionClubParam("", clubs)).toBeNull();
  });

  it("builds the New session path for a Club, round-tripping odd ids", () => {
    const odd = club("a b&c");
    expect(newSessionForClubPath("c1")).toBe("/sessions/new?club=c1");
    const search = newSessionForClubPath(odd.id).split("?")[1]!;
    expect(sessionClubParam(search, [odd])).toBe(odd.id);
  });

  it("pluralises the selected count", () => {
    expect(selectedLabel(0)).toBe("No players selected");
    expect(selectedLabel(1)).toBe("1 player selected");
    expect(selectedLabel(8)).toBe("8 players selected");
  });

  it("finds Guests clashing with the chosen Club's players", () => {
    const guests = [
      { id: "g1", name: "sam", skill: "beginner" as const, saveToClub: false },
      { id: "g2", name: "Jo", skill: "beginner" as const, saveToClub: false },
    ];
    expect([...clashingGuestIds(guests, club("a", ["Sam"]))]).toEqual(["g1"]);
    expect(clashingGuestIds(guests, null).size).toBe(0);
  });

  it("plans the Session and the Club roster update", () => {
    const riverside = club("r", ["Zed", "Amy", "Bob"]);
    const other = club("o", ["Kim"]);
    let next = 0;
    const plan = planStart({
      name: "  Thu   night ",
      club: riverside,
      allClubs: [riverside, other],
      checkedIds: new Set(["r-0", "r-1"]),
      guests: [
        { id: "g1", name: " Dana ", skill: "advanced", saveToClub: true },
        { id: "g2", name: "Eve", skill: "beginner", saveToClub: false },
      ],
      courts: 2,
      hours: 2,
      pointSystem: 31,
      newId: () => `new-${next++}`,
    });
    expect(plan.input).toEqual({
      name: "Thu night",
      clubId: "r",
      clubName: "r",
      pointSystem: 31,
      plannedHours: 2,
      courts: 2,
      players: [
        { name: "Amy", skill: "intermediate", clubPlayerId: "r-1" },
        { name: "Zed", skill: "intermediate", clubPlayerId: "r-0" },
        { name: "Dana", skill: "advanced", clubPlayerId: "new-0" },
        { name: "Eve", skill: "beginner", clubPlayerId: null },
      ],
    });
    expect(plan.clubs?.[0]?.players.at(-1)).toEqual({
      id: "new-0",
      name: "Dana",
      skill: "advanced",
    });
    expect(plan.clubs?.[1]).toBe(other);
  });

  it("leaves Clubs alone when no Guest is saved", () => {
    const plan = planStart({
      name: "x",
      club: null,
      allClubs: [],
      checkedIds: new Set(),
      guests: [{ id: "g", name: "Eve", skill: "beginner", saveToClub: true }],
      courts: 1,
      hours: 1,
      pointSystem: 21,
      newId: () => "id",
    });
    expect(plan.clubs).toBeNull();
    expect(plan.input.clubName).toBeNull();
    expect(plan.input.players).toEqual([{ name: "Eve", skill: "beginner", clubPlayerId: null }]);
  });
});
