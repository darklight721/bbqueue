import { describe, expect, it } from "vite-plus/test";
import { sparePlayers, spareNotice, spareNoticeText } from "./spare.ts";
import { player, playersNamed, session } from "./test-utils.ts";

const s = (players: number, courts: number) => session({ players: playersNamed(players), courts });

describe("spareNotice boundaries", () => {
  const cases: [number, number, "courts" | "one-court" | null, number][] = [
    // 1 Court: 4 and 5 players only
    [3, 1, null, -1],
    [4, 1, "one-court", 0],
    [5, 1, "one-court", 1],
    [6, 1, null, 2],
    // 2 Courts: 8, 9, 10
    [7, 2, null, -1],
    [8, 2, "courts", 0],
    [9, 2, "courts", 1],
    [10, 2, "courts", 2],
    [11, 2, null, 3],
    // 3 Courts: 12..14
    [11, 3, null, -1],
    [12, 3, "courts", 0],
    [14, 3, "courts", 2],
    [15, 3, null, 3],
    // 4 Courts: 16..18
    [15, 4, null, -1],
    [18, 4, "courts", 2],
    [19, 4, null, 3],
  ];
  it.each(cases)("%i players on %i courts", (players, courts, kind, spare) => {
    const session = s(players, courts);
    expect(sparePlayers(session)).toBe(spare);
    const notice = spareNotice(session);
    if (kind === null) expect(notice).toBeNull();
    else expect(notice).toEqual({ kind, players, courts, spare, key: `${players}/${courts}` });
  });

  it("is null with 0 Courts", () => {
    expect(spareNotice(s(5, 0))).toBeNull();
  });
});

describe("counting", () => {
  it("excludes Sitting out and removed players, and counts all Courts", () => {
    const players = playersNamed(12);
    players[0] = { ...players[0]!, sittingOut: true };
    players[1] = { ...players[1]!, removed: true };
    players[2] = { ...players[2]!, sittingOut: true, removed: true };
    const session2 = session({ players, courts: 2 });
    expect(sparePlayers(session2)).toBe(1);
    expect(spareNotice(session2)).toMatchObject({ players: 9, courts: 2, spare: 1, key: "9/2" });
  });

  it("Sitting out brings a roomy Session into the notice", () => {
    const roomy = playersNamed(12);
    expect(spareNotice(session({ players: roomy, courts: 2 }))).toBeNull();
    const players = roomy.map((p, i) => (i < 3 ? { ...p, sittingOut: true } : p));
    expect(spareNotice(session({ players, courts: 2 }))).toMatchObject({ spare: 1, key: "9/2" });
  });

  it("an extra unlisted player is only a player", () => {
    const players = [...playersNamed(7), player("x")];
    expect(spareNotice(session({ players, courts: 2 }))).toMatchObject({ spare: 0 });
  });
});

describe("spareNoticeText", () => {
  const text = (players: number, courts: number) =>
    spareNoticeText(spareNotice(s(players, courts))!);

  it("2+ courts, 2 spare", () => {
    expect(text(10, 2)).toBe(
      "10 players on 2 courts: only 2 sit out while every court is playing, so players will often play several matches in a row and keep meeting the same people. Use 1 court or add players.",
    );
  });
  it("2+ courts, 1 spare", () => {
    expect(text(13, 3)).toBe(
      "13 players on 3 courts: only 1 sits out while every court is playing, so players will often play several matches in a row and keep meeting the same people. Use 2 courts or add players.",
    );
  });
  it("2+ courts, 0 spare", () => {
    expect(text(16, 4)).toBe(
      "16 players on 4 courts: nobody sits out while every court is playing, so players will often play several matches in a row and keep meeting the same people. Use 3 courts or add players.",
    );
  });
  it("1 court, 1 spare", () => {
    expect(text(5, 1)).toBe(
      "5 players on 1 court: only 1 sits out each match, so players will often play several matches in a row. Add players to give everyone more rests.",
    );
  });
  it("1 court, 0 spare", () => {
    expect(text(4, 1)).toBe(
      "4 players on 1 court: nobody sits out each match, so players will often play several matches in a row. Add players to give everyone more rests.",
    );
  });
});
