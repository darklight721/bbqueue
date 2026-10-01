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
  setClubs,
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
  const location = memoryLocation({ path: "/session", record: true });
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

  it("blocks Remove while on court", async () => {
    let session = makeSession();
    session = ok(startMatch(session, session.courts[0]!.id, ctx()));
    renderSession(session);
    const player = nameOf(session.matches[0]!.teams[1][1]);
    const remove = screen.getByRole("button", { name: `Remove ${player}` });
    expect(remove).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(remove);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("End or remove their match first.");
    expect(getSession()!.players.find((p) => p.name === player)!.removed).toBe(false);
  });

  it("asks before removing a player", async () => {
    renderSession(makeSession());
    await userEvent.click(screen.getByRole("button", { name: "Remove Gus" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Gus from this session?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(rowNames()).toContain("Gus");

    await userEvent.click(screen.getByRole("button", { name: "Remove Gus" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    expect(rowNames()).not.toContain("Gus");
    expect(getSession()!.players.find((p) => p.name === "Gus")!.removed).toBe(true);
    expect(playersRegion().getByText("9 players")).toBeInTheDocument();
  });

  it("adds a player; no Save to club without a Club", async () => {
    renderSession(makeSession({ players: 4 }));
    expect(screen.queryByRole("checkbox", { name: "Save to club" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    expect(rowNames()).toEqual(["ana", "Ben", "Dan", "Kim", "zoe"]);
    expect(row("Kim").getByText(/^(Free|In lineup · court \d)$/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "KIM{Enter}");
    expect(screen.getByText("Name already used")).toBeInTheDocument();
  });

  it("saves a new player to the Session's Club when asked", async () => {
    const club: Club = { id: "club-1", name: "Riverside", players: [] };
    setClubs([club]);
    renderSession(makeSession({ clubId: "club-1", players: 4 }));

    const saveToClub = screen.getByRole("checkbox", { name: "Save to club" });
    expect(saveToClub).not.toBeChecked();
    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Kim");
    await userEvent.click(saveToClub);
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));

    const saved = getClubs()[0]!.players;
    expect(saved).toEqual([{ id: expect.any(String), name: "Kim", skill: "intermediate" }]);
    expect(getSession()!.players.find((p) => p.name === "Kim")!.clubPlayerId).toBe(saved[0]!.id);

    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "Lou");
    await userEvent.click(screen.getByRole("button", { name: "Add player" }));
    expect(getClubs()[0]!.players).toHaveLength(1);
    expect(getSession()!.players.find((p) => p.name === "Lou")!.clubPlayerId).toBeNull();
  });

  it("restores a removed player when their name is added again", async () => {
    renderSession(makeSession());
    const id = idOf("Hal");
    await userEvent.click(screen.getByRole("button", { name: "Remove Hal" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    expect(rowNames()).not.toContain("Hal");

    await userEvent.type(screen.getByRole("textbox", { name: "Player name" }), "hal{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Welcome back, hal");
    expect(rowNames()).toContain("hal");
    const restored = getSession()!.players.filter((p) => p.name.toLowerCase() === "hal");
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(id);
    expect(restored[0]!.removed).toBe(false);
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
    expect(playersRegion().getByRole("textbox", { name: "Player name" })).toBeInTheDocument();

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
