import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../../app/App.tsx";
import {
  createRng,
  createSession,
  setSittingOut,
  startMatch,
} from "../../../domain/engine/index.ts";
import type { Club, Session } from "../../../domain/types.ts";
import {
  getClubs,
  getSession,
  resetStoreForTests,
  setLocalClubs,
  setSession,
} from "../../../storage/store.ts";

const T0 = Date.UTC(2026, 9, 2, 18, 0, 0);
// Deliberately not alphabetical, mixed case.
const NAMES = ["zoe", "Ben", "ana", "Dan", "Cat", "Eve", "Gus", "Fay", "Hal", "Ivy"];

function ctx(seed = 1) {
  return { now: T0, rng: createRng(seed) };
}

function makeSession(options: { clubId?: string | null; players?: number } = {}): Session {
  let id = 0;
  return createSession(
    {
      name: "Thursday",
      clubId: options.clubId ?? null,
      clubName: null,
      pointSystem: 21,
      plannedHours: 2,
      courts: 2,
      players: NAMES.slice(0, options.players ?? 10).map((name) => ({
        name,
        skill: "intermediate" as const,
      })),
    },
    { now: T0, rng: createRng(5), newId: () => `p-${++id}` },
  );
}

function ok(result: { ok: true; session: Session } | { ok: false; reason: string }): Session {
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function renderSession(session: Session) {
  setSession(session);
  const location = memoryLocation({ path: `/sessions/${session.id}`, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

const playersRegion = () => within(screen.getByRole("region", { name: "Players" }));
const nameOf = (id: string) => getSession()!.players.find((p) => p.id === id)!.name;
const idOf = (name: string) => getSession()!.players.find((p) => p.name === name)!.id;
/** The list row for a player, found through its Sit out / Back in button. */
const row = (name: string) =>
  within(
    playersRegion()
      .getByRole("button", { name: new RegExp(`^(Sit out|Back in) ${name}$`) })
      .closest("li")!,
  );
async function openAddPlayers() {
  await userEvent.click(playersRegion().getByRole("button", { name: "Add players" }));
  return within(screen.getByRole("dialog", { name: "Add players" }));
}
async function openMenu(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `More for ${name}` }));
  return within(screen.getByRole("dialog", { name }));
}
const rowNames = () =>
  playersRegion()
    .getAllByRole("button", { name: /^(Sit out|Back in) / })
    .map((button) => button.getAttribute("aria-label")!.replace(/^(Sit out|Back in) /, ""));

describe("PlayersSection", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("lists players alphabetically with their status", () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    const onCourt = session.matches[0]!.teams.flat();
    const inLineup = session.courts[1]!.lineup!.teams.flat();
    const free = session.players
      .map((p) => p.id)
      .filter((id) => !onCourt.includes(id) && !inLineup.includes(id));
    session = ok(setSittingOut(session, free[0]!, true, ctx()));
    renderSession(session);

    expect(screen.getByRole("heading", { level: 2, name: "Players" })).toBeInTheDocument();
    expect(playersRegion().getByText("10 players · 1 sitting out")).toBeInTheDocument();
    expect(rowNames()).toEqual([
      "ana",
      "Ben",
      "Cat",
      "Dan",
      "Eve",
      "Fay",
      "Gus",
      "Hal",
      "Ivy",
      "zoe",
    ]);

    for (const id of onCourt) expect(row(nameOf(id)).getByText("On court 1")).toBeInTheDocument();
    for (const id of inLineup) {
      expect(row(nameOf(id)).getByText("In lineup · court 2")).toBeInTheDocument();
    }
    expect(row(nameOf(free[0]!)).getByText("Sitting out")).toBeInTheDocument();
    expect(row(nameOf(free[1]!)).getByText("Free")).toBeInTheDocument();
    expect(row("ana").getByText("0 played")).toBeInTheDocument();
  });

  it("sitting out takes a player out of their Lineup and a replacement fills in", async () => {
    renderSession(makeSession());
    const lineup = getSession()!.courts[0]!.lineup!.teams.flat();
    const leaving = nameOf(lineup[0]!);

    await userEvent.click(screen.getByRole("button", { name: `Sit out ${leaving}` }));

    expect(row(leaving).getByText("Sitting out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Back in ${leaving}` })).toBeInTheDocument();
    const after = getSession()!.courts[0]!.lineup!.teams.flat();
    expect(after).toHaveLength(4);
    expect(after).not.toContain(lineup[0]);
    const replacement = after.find((id) => !lineup.includes(id))!;
    expect(row(nameOf(replacement)).getByText("In lineup · court 1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: `Back in ${leaving}` }));
    expect(getSession()!.players.find((p) => p.name === leaving)!.sittingOut).toBe(false);
  });

  it("sitting out while on court applies after the match", async () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    renderSession(session);
    const player = nameOf(session.matches[0]!.teams[0][0]);

    await userEvent.click(screen.getByRole("button", { name: `Sit out ${player}` }));

    expect(row(player).getByText("On court 1")).toBeInTheDocument();
    expect(row(player).getByText("Sitting out after this match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Back in ${player}` })).toBeInTheDocument();
  });

  it("blocks Remove while on court, and says why", async () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    renderSession(session);
    const player = nameOf(session.matches[0]!.teams[1][1]);
    const menu = await openMenu(player);
    const remove = menu.getByRole("button", { name: "Remove" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription("On court. End or remove their match first.");

    await userEvent.click(remove);
    expect(screen.queryByRole("dialog", { name: /^Remove / })).not.toBeInTheDocument();
    expect(getSession()!.players.find((p) => p.name === player)!.removed).toBe(false);
  });

  it("asks before removing a player, from the player's menu", async () => {
    renderSession(makeSession());
    await userEvent.click((await openMenu("Gus")).getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Gus from this session?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(rowNames()).toContain("Gus");

    await userEvent.click((await openMenu("Gus")).getByRole("button", { name: "Remove" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Remove Gus from this session?" })).getByRole(
        "button",
        { name: "Remove" },
      ),
    );
    expect(rowNames()).not.toContain("Gus");
    expect(getSession()!.players.find((p) => p.name === "Gus")!.removed).toBe(true);
    expect(playersRegion().getByText("9 players")).toBeInTheDocument();
  });

  it("adds Guests from the sheet; no Club part and no Save to club without a Club", async () => {
    renderSession(makeSession({ players: 4 }));
    let sheet = await openAddPlayers();
    expect(sheet.queryByRole("heading", { name: /^From / })).not.toBeInTheDocument();
    expect(sheet.queryByRole("checkbox", { name: "Save to club" })).not.toBeInTheDocument();
    // The sheet holds a draft, so it is left with Cancel, not a ×.
    expect(sheet.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

    await userEvent.click(sheet.getByRole("button", { name: "Add players" }));
    expect(sheet.getByRole("alert")).toHaveTextContent("Add a guest first.");

    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "Kim{Enter}");
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "kim{Enter}");
    expect(sheet.getByText("Name already used")).toBeInTheDocument();
    await userEvent.clear(sheet.getByRole("textbox", { name: "Player name" }));
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "Lou{Enter}");
    // Nobody joins until the sheet's Add button.
    expect(rowNames()).toEqual(["ana", "Ben", "Dan", "zoe"]);

    await userEvent.click(sheet.getByRole("button", { name: "Remove Lou" }));
    await userEvent.click(sheet.getByRole("button", { name: "Add 1 player" }));
    expect(screen.queryByRole("dialog", { name: "Add players" })).not.toBeInTheDocument();
    expect(rowNames()).toEqual(["ana", "Ben", "Dan", "Kim", "zoe"]);
    expect(row("Kim").getByText(/^(Free|In lineup · court \d)$/)).toBeInTheDocument();

    sheet = await openAddPlayers();
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "KIM{Enter}");
    expect(sheet.getByText("Name already used")).toBeInTheDocument();
  });

  it("saves a new Guest to the Session's Club when asked", async () => {
    setLocalClubs([{ id: "club-1", name: "Riverside", kind: "local", players: [] }]);
    renderSession(makeSession({ clubId: "club-1", players: 4 }));

    const sheet = await openAddPlayers();
    expect(sheet.getByText("Riverside has no players yet.")).toBeInTheDocument();
    const saveToClub = sheet.getByRole("checkbox", { name: "Save to club" });
    expect(saveToClub).not.toBeChecked();
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(saveToClub);
    await userEvent.click(sheet.getByRole("button", { name: "Add guest" }));
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "Lou{Enter}");
    await userEvent.click(sheet.getByRole("button", { name: "Add 2 players" }));

    const saved = getClubs()[0]!.players;
    expect(saved).toEqual([{ id: expect.any(String), name: "Kim", skill: "intermediate" }]);
    expect(getSession()!.players.find((p) => p.name === "Kim")!.clubPlayerId).toBe(saved[0]!.id);
    expect(getSession()!.players.find((p) => p.name === "Lou")!.clubPlayerId).toBeNull();
  });

  it("restores a removed player when their name is added again", async () => {
    renderSession(makeSession());
    const id = idOf("Hal");
    await userEvent.click((await openMenu("Hal")).getByRole("button", { name: "Remove" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Remove Hal from this session?" })).getByRole(
        "button",
        { name: "Remove" },
      ),
    );
    expect(rowNames()).not.toContain("Hal");

    const sheet = await openAddPlayers();
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "hal{Enter}");
    await userEvent.click(sheet.getByRole("button", { name: "Add 1 player" }));
    expect(screen.getByRole("status")).toHaveTextContent("Welcome back, hal");
    expect(rowNames()).toContain("hal");
    const restored = getSession()!.players.filter((p) => p.name.toLowerCase() === "hal");
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(id);
    expect(restored[0]!.removed).toBe(false);
  });
});

describe("Club players joining late", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  const club: Club = {
    id: "club-1",
    name: "Riverside",
    kind: "local",
    players: [
      { id: "cp-zed", name: "Zed", skill: "beginner" },
      {
        id: "cp-kim",
        name: "Kim",
        skill: "advanced",
        link: { accountId: "kim-4f2a", role: "player" },
      },
      { id: "cp-ana", name: "Ana", skill: "beginner" },
      { id: "cp-lou", name: "Lou", skill: "intermediate" },
      { id: "cp-ben", name: "Ben", skill: "intermediate" },
    ],
  };

  /** Ben joined from the Club; "ana" is a Guest who happens to share a Club player's name. */
  function clubSession(): Session {
    const session = makeSession({ clubId: "club-1", players: 4 });
    return {
      ...session,
      clubName: "Riverside",
      players: session.players.map((p) =>
        p.name === "Ben" ? { ...p, clubPlayerId: "cp-ben" } : p,
      ),
    };
  }

  it("lists the Club players not in the Session and adds the ticked ones with a Guest", async () => {
    setLocalClubs([club]);
    renderSession(clubSession());
    const sheet = await openAddPlayers();
    const roster = within(sheet.getByRole("list", { name: "Players in Riverside" }));
    expect(roster.getAllByRole("checkbox").map((box) => box.closest("label")!.title)).toEqual([
      "Ana",
      "Kim",
      "Lou",
      "Zed",
    ]);
    const ana = roster.getByRole("checkbox", { name: "Ana" });
    expect(ana).toBeDisabled();
    expect(ana).toHaveAccessibleDescription("Name taken");

    await userEvent.click(roster.getByRole("checkbox", { name: "Kim" }));
    await userEvent.click(roster.getByRole("checkbox", { name: "Zed" }));
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "lou{Enter}");
    expect(sheet.getByText("Lou is in Riverside. Pick them above.")).toBeInTheDocument();
    await userEvent.clear(sheet.getByRole("textbox", { name: "Player name" }));
    await userEvent.type(sheet.getByRole("textbox", { name: "Player name" }), "Max{Enter}");
    await userEvent.click(sheet.getByRole("button", { name: "Add 3 players" }));

    const players = getSession()!.players;
    expect(players.find((p) => p.name === "Kim")).toMatchObject({
      skill: "advanced",
      clubPlayerId: "cp-kim",
      accountId: "kim-4f2a",
    });
    expect(players.find((p) => p.name === "Zed")).toMatchObject({
      skill: "beginner",
      clubPlayerId: "cp-zed",
    });
    expect(players.find((p) => p.name === "Max")).toMatchObject({ clubPlayerId: null });
    expect(rowNames()).toEqual(["ana", "Ben", "Dan", "Kim", "Max", "Zed", "zoe"]);
  });

  it("a Club player who left shows Left earlier and comes back with their history", async () => {
    setLocalClubs([club]);
    renderSession(clubSession());
    const benId = idOf("Ben");
    await userEvent.click((await openMenu("Ben")).getByRole("button", { name: "Remove" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Remove Ben from this session?" })).getByRole(
        "button",
        { name: "Remove" },
      ),
    );

    const sheet = await openAddPlayers();
    const ben = sheet.getByRole("checkbox", { name: "Ben" });
    expect(ben).toHaveAccessibleDescription("Left earlier");
    await userEvent.click(ben);
    await userEvent.click(sheet.getByRole("button", { name: "Add 1 player" }));

    expect(screen.getByRole("status")).toHaveTextContent("Welcome back, Ben");
    const bens = getSession()!.players.filter((p) => p.name === "Ben");
    expect(bens).toEqual([expect.objectContaining({ id: benId, removed: false })]);
  });

  it("everyone on the roster in the Session: says so", async () => {
    setLocalClubs([{ ...club, players: [club.players[4]!] }]);
    renderSession(clubSession());
    const sheet = await openAddPlayers();
    expect(sheet.getByText("Everyone in Riverside is in this session.")).toBeInTheDocument();
  });
});

describe("Changing a Skill level", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("Save changes the Session player only; Cancel changes nothing", async () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    renderSession(session);
    const courts = getSession()!.courts;

    let menu = await openMenu("Ivy");
    expect(menu.getByRole("radio", { name: "Intermediate" })).toBeChecked();
    // No Club: nothing to update there.
    expect(menu.queryByRole("checkbox", { name: /^Also update in / })).not.toBeInTheDocument();
    // The menu holds a draft, so it is left with Cancel, not a ×.
    expect(menu.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await userEvent.click(menu.getByRole("radio", { name: "Beginner" }));
    await userEvent.click(menu.getByRole("button", { name: "Cancel" }));
    expect(getSession()!.players.find((p) => p.name === "Ivy")!.skill).toBe("intermediate");

    menu = await openMenu("Ivy");
    await userEvent.click(menu.getByRole("radio", { name: "Advanced" }));
    await userEvent.click(menu.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog", { name: "Ivy" })).not.toBeInTheDocument();
    expect(getSession()!.players.find((p) => p.name === "Ivy")!.skill).toBe("advanced");
    expect(getSession()!.courts).toEqual(courts);
  });

  it("Also update in the Club changes the Club player too, only when ticked", async () => {
    setLocalClubs([
      {
        id: "club-1",
        name: "Riverside",
        kind: "local",
        players: [
          { id: "cp-ben", name: "Ben", skill: "intermediate" },
          { id: "cp-ana", name: "ana", skill: "intermediate" },
        ],
      },
    ]);
    const session = makeSession({ clubId: "club-1", players: 4 });
    renderSession({
      ...session,
      players: session.players.map((p) =>
        p.name === "Ben"
          ? { ...p, clubPlayerId: "cp-ben" }
          : p.name === "ana"
            ? { ...p, clubPlayerId: "cp-ana" }
            : p,
      ),
    });

    // A Guest has no Club player to update.
    expect(
      (await openMenu("Dan")).queryByRole("checkbox", { name: /^Also update in / }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    let menu = await openMenu("ana");
    const also = menu.getByRole("checkbox", { name: "Also update in Riverside" });
    expect(also).not.toBeChecked();
    // Nothing to copy to the Club until the Skill level changes.
    expect(also).toBeDisabled();
    await userEvent.click(menu.getByRole("radio", { name: "Advanced" }));
    expect(also).toBeEnabled();
    await userEvent.click(also);
    // Back to where it was: no change, so the tick no longer counts.
    await userEvent.click(menu.getByRole("radio", { name: "Intermediate" }));
    expect(also).toBeDisabled();
    expect(also).not.toBeChecked();
    await userEvent.click(menu.getByRole("radio", { name: "Beginner" }));
    expect(also).toBeChecked();
    await userEvent.click(also);
    await userEvent.click(menu.getByRole("button", { name: "Save" }));
    expect(getClubs()[0]!.players.find((p) => p.id === "cp-ana")!.skill).toBe("intermediate");

    menu = await openMenu("Ben");
    await userEvent.click(menu.getByRole("radio", { name: "Advanced" }));
    await userEvent.click(menu.getByRole("checkbox", { name: "Also update in Riverside" }));
    await userEvent.click(menu.getByRole("button", { name: "Save" }));
    expect(getSession()!.players.find((p) => p.name === "Ben")!.skill).toBe("advanced");
    expect(getClubs()[0]!.players.find((p) => p.id === "cp-ben")!.skill).toBe("advanced");
  });
});

describe("Players collapse and sort", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  /** Court 1 Busy, Court 2 Lineup, one player Sitting out, the rest Free. */
  function mixedSession() {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    const busy = new Set(session.matches[0]!.teams.flat());
    const lineup = new Set(session.courts[1]!.lineup!.teams.flat());
    const rest = session.players.map((p) => p.id).filter((id) => !busy.has(id) && !lineup.has(id));
    session = ok(setSittingOut(session, rest[0]!, true, ctx()));
    return { session, busy, lineup, sitting: rest[0]!, free: rest.slice(1) };
  }

  it("is open by default and collapses to just the header", async () => {
    renderSession(makeSession());
    const toggle = playersRegion().getByRole("button", { name: "Hide players" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(playersRegion().getByRole("button", { name: "Add players" })).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(playersRegion().getByRole("button", { name: "Show players" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(playersRegion().getByText("10 players")).toBeInTheDocument();
    expect(playersRegion().queryByRole("textbox", { name: "Player name" })).not.toBeInTheDocument();
    expect(playersRegion().queryByRole("listitem")).not.toBeInTheDocument();
    expect(playersRegion().queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(playersRegion().getByRole("button", { name: "Show players" }));
    expect(rowNames()).toHaveLength(10);
  });

  it("the jump bar opens a collapsed Players or History section", async () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    renderSession(session);
    await userEvent.click(court1Button("End match"));
    await userEvent.click(screen.getByRole("button", { name: "End without score" }));

    await userEvent.click(playersRegion().getByRole("button", { name: "Hide players" }));
    expect(playersRegion().queryByRole("listitem")).not.toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Sections" }));

    await userEvent.click(nav.getByRole("button", { name: "Players" }));
    expect(rowNames()).toHaveLength(10);

    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.queryByRole("list", { name: "Match history" })).not.toBeInTheDocument();
    await userEvent.click(nav.getByRole("button", { name: "History" }));
    expect(history.getByRole("list", { name: "Match history" })).toBeInTheDocument();
    expect(history.getByRole("button", { name: "Hide history" })).toBeInTheDocument();
  });

  it("sorts by Name, Plays or Status and remembers the choice", async () => {
    const { session, busy, lineup, sitting, free } = mixedSession();
    renderSession(session);
    const nameOfIn = (id: string) => session.players.find((p) => p.id === id)!.name;
    const byName = (ids: Iterable<string>) =>
      [...ids].map(nameOfIn).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    expect(playersRegion().getByRole("radio", { name: "Name" })).toBeChecked();
    expect(rowNames()).toEqual([
      "ana",
      "Ben",
      "Cat",
      "Dan",
      "Eve",
      "Fay",
      "Gus",
      "Hal",
      "Ivy",
      "zoe",
    ]);

    await userEvent.click(playersRegion().getByRole("radio", { name: "Status" }));
    expect(rowNames()).toEqual([
      ...byName(busy),
      ...byName(lineup),
      ...byName(free),
      nameOfIn(sitting),
    ]);
    expect(localStorage.getItem("bq:v1:players-sort")).toBe('"status"');

    // Plays: end Court 1's match, so its four players have 1 played and go last.
    await userEvent.click(court1Button("End match"));
    await userEvent.click(screen.getByRole("button", { name: "End without score" }));
    await userEvent.click(playersRegion().getByRole("radio", { name: "Plays" }));
    const notPlayed = session.players.map((p) => p.id).filter((id) => !busy.has(id));
    expect(rowNames()).toEqual([...byName(notPlayed), ...byName(busy)]);
  });

  it("starts with the remembered sort", () => {
    localStorage.setItem("bq:v1:players-sort", '"plays"');
    renderSession(makeSession());
    expect(playersRegion().getByRole("radio", { name: "Plays" })).toBeChecked();
  });

  it("falls back to Name when the saved sort is unreadable", () => {
    localStorage.setItem("bq:v1:players-sort", "{oops");
    renderSession(makeSession());
    expect(playersRegion().getByRole("radio", { name: "Name" })).toBeChecked();
  });
});

const court1Button = (name: string) =>
  within(screen.getByRole("region", { name: "Court 1" })).getByRole("button", { name });

describe("Section jump bar", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("offers shortcuts to the sections", () => {
    renderSession(makeSession({ players: 4 }));
    const nav = within(screen.getByRole("navigation", { name: "Sections" }));
    expect(nav.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Courts",
      "Queues",
      "Players",
      "History",
    ]);
    expect(nav.getByRole("button", { name: "Courts" })).toHaveAttribute("aria-current", "true");
  });
});
