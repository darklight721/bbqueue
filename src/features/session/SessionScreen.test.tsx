import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createRng, createSession, startMatch } from "../../domain/engine/index.ts";
import type { Session } from "../../domain/types.ts";
import { getSession, resetStoreForTests, setSession } from "../../storage/store.ts";

const T0 = Date.UTC(2026, 9, 1, 18, 0, 0);
const NAMES = ["Ana", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jon", "Kim", "Lou"];

function makeSession(options: { players?: number; courts?: number } = {}): Session {
  let id = 0;
  return createSession(
    {
      name: "Thursday",
      clubId: null,
      pointSystem: 21,
      plannedHours: 2,
      courts: options.courts ?? 2,
      players: NAMES.slice(0, options.players ?? 8).map((name) => ({
        name,
        skill: "intermediate" as const,
      })),
    },
    { now: T0, rng: createRng(7), newId: () => `id-${++id}` },
  );
}

/** Session with Court 1 Busy since T0. */
function busySession(): Session {
  const session = makeSession();
  const result = startMatch(session, session.courts[0]!.id, { now: T0, rng: createRng(3) });
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

function renderAt(path = "/session") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

const court = (n: number) => within(screen.getByRole("region", { name: `Court ${n}` }));
const teamNamesIn = (n: number, team: "Team A" | "Team B") =>
  Array.from(
    court(n).getByRole("list", { name: team }).querySelectorAll("li"),
    (li) => li.querySelector("span span")?.textContent,
  );

describe("SessionScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("redirects Home when there is no saved Session", () => {
    const location = renderAt();
    expect(location.current()).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeInTheDocument();
  });

  it("shows the Session name and Point system in the top bar", () => {
    setSession(makeSession());
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Thursday" })).toBeInTheDocument();
    expect(screen.getByText("21 pts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it("shows Idle courts with disjoint Lineups as Team A vs Team B", () => {
    setSession(makeSession());
    renderAt();
    const one = [...teamNamesIn(1, "Team A"), ...teamNamesIn(1, "Team B")];
    const two = [...teamNamesIn(2, "Team A"), ...teamNamesIn(2, "Team B")];
    expect(one).toHaveLength(4);
    expect(two).toHaveLength(4);
    expect(one.filter((name) => two.includes(name))).toEqual([]);

    expect(court(1).getByText("Idle")).toBeInTheDocument();
    expect(court(1).getByText("Lineup")).toBeInTheDocument();
    expect(court(1).getAllByText("0 played")).toHaveLength(4);
    expect(court(1).getByRole("button", { name: "Start match" })).toBeEnabled();
    expect(court(1).getByRole("button", { name: "Rehash" })).toBeEnabled();
    expect(court(1).getByRole("button", { name: "Remove court" })).toBeEnabled();
  });

  it("shows Waiting for players when a Court has no Lineup", () => {
    setSession(makeSession({ players: 4, courts: 2 }));
    renderAt();
    expect(court(2).getByText("Waiting for players")).toBeInTheDocument();
    expect(court(2).getByRole("button", { name: "Start match" })).toBeDisabled();
    expect(court(2).getByRole("button", { name: "Rehash" })).toBeDisabled();
  });

  it("starts a match; the other Court's Lineup is unchanged", async () => {
    setSession(makeSession());
    renderAt();
    const lineupTwo = teamNamesIn(2, "Team A");
    const lineupOne = teamNamesIn(1, "Team A");

    await userEvent.click(court(1).getByRole("button", { name: "Start match" }));

    expect(court(1).getByText("Playing")).toBeInTheDocument();
    expect(court(1).getByRole("timer", { name: "Match time" })).toBeInTheDocument();
    expect(teamNamesIn(1, "Team A")).toEqual(lineupOne);
    expect(teamNamesIn(2, "Team A")).toEqual(lineupTwo);
    expect(getSession()?.matches).toHaveLength(1);

    const removeCourt = court(1).getByRole("button", { name: "Remove court" });
    expect(removeCourt).toBeDisabled();
    expect(removeCourt).toHaveAccessibleDescription("End or remove the match first");
  });

  it("ticks the match timer from startedAt, every second", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(T0 + 5_000);
    setSession(busySession());
    renderAt();
    const timer = court(1).getByRole("timer");
    expect(timer).toHaveTextContent("00:05");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(timer).toHaveTextContent("01:05");
  });

  it("validates the score before ending a match", async () => {
    setSession(busySession());
    renderAt();
    const match = getSession()!.matches[0]!;
    const byId = new Map(getSession()!.players.map((p) => [p.id, p.name]));
    const labelA = match.teams[0].map((id) => byId.get(id)).join(" & ");
    const labelB = match.teams[1].map((id) => byId.get(id)).join(" & ");

    await userEvent.click(court(1).getByRole("button", { name: "End match" }));
    const dialog = within(screen.getByRole("dialog", { name: "End match — Court 1" }));
    const a = dialog.getByRole("textbox", { name: labelA });
    const b = dialog.getByRole("textbox", { name: labelB });
    expect(a).toHaveAttribute("inputmode", "numeric");
    expect(a).toHaveFocus();

    const save = dialog.getByRole("button", { name: "Save" });
    await userEvent.click(save);
    expect(dialog.getByText("Enter both scores, or end without a score.")).toBeInTheDocument();

    await userEvent.type(a, "21");
    await userEvent.type(b, "21");
    expect(dialog.getByText("Scores can't be level. One team has to win.")).toBeInTheDocument();

    await userEvent.clear(a);
    await userEvent.type(a, "15");
    await userEvent.clear(b);
    await userEvent.type(b, "10");
    expect(dialog.getByText("The winning team needs at least 21 points.")).toBeInTheDocument();

    await userEvent.clear(a);
    await userEvent.type(a, "21.5");
    expect(dialog.getByText("Scores must be whole numbers.")).toBeInTheDocument();

    await userEvent.clear(a);
    await userEvent.type(a, "-3");
    expect(dialog.getByText("Scores can't be negative.")).toBeInTheDocument();
    expect(getSession()!.matches[0]!.status).toBe("active");

    await userEvent.clear(a);
    await userEvent.type(a, "21");
    await userEvent.click(save);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const ended = getSession()!.matches[0]!;
    expect(ended.status).toBe("ended");
    expect(ended.score).toEqual([21, 10]);
    expect(court(1).getByText("Idle")).toBeInTheDocument();
    expect(court(1).getByRole("button", { name: "Start match" })).toBeEnabled();
  });

  it("ends a match without a score", async () => {
    setSession(busySession());
    renderAt();
    await userEvent.click(court(1).getByRole("button", { name: "End match" }));
    await userEvent.click(screen.getByRole("button", { name: "End without score" }));
    const ended = getSession()!.matches[0]!;
    expect(ended.status).toBe("ended");
    expect(ended.score).toBeNull();
    expect(screen.getAllByText("1 played")).toHaveLength(4);
  });

  it("cancels the score dialog without changes", async () => {
    setSession(busySession());
    renderAt();
    await userEvent.click(court(1).getByRole("button", { name: "End match" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getSession()!.matches[0]!.status).toBe("active");
  });

  it("asks before removing a match, which then leaves no trace", async () => {
    setSession(busySession());
    renderAt();
    await userEvent.click(court(1).getByRole("button", { name: "Remove match" }));
    const dialog = screen.getByRole("dialog", { name: "Remove this match?" });
    expect(dialog).toHaveAccessibleDescription("It won't count.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(getSession()!.matches).toHaveLength(1);

    await userEvent.click(court(1).getByRole("button", { name: "Remove match" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove match" }),
    );
    expect(getSession()!.matches).toEqual([]);
    expect(court(1).getByText("Idle")).toBeInTheDocument();
    expect(screen.queryByText("1 played")).not.toBeInTheDocument();
  });

  it("rehashes one Court's Lineup", async () => {
    setSession(makeSession({ players: 12, courts: 2 }));
    renderAt();
    const before = getSession()!.courts[0]!.lineup;
    const other = getSession()!.courts[1]!.lineup;
    await userEvent.click(court(1).getByRole("button", { name: "Rehash" }));
    expect(getSession()!.courts[0]!.lineup).not.toEqual(before);
    expect(getSession()!.courts[1]!.lineup).toEqual(other);
  });

  it("enables Rehash all only with at least 2 Idle courts", async () => {
    setSession(makeSession({ players: 12, courts: 2 }));
    renderAt();
    const rehashAll = screen.getByRole("button", { name: "Rehash all" });
    expect(rehashAll).toBeEnabled();
    await userEvent.click(rehashAll);
    expect(getSession()!.courts.every((c) => c.lineup !== null)).toBe(true);

    await userEvent.click(court(1).getByRole("button", { name: "Start match" }));
    expect(screen.getByRole("button", { name: "Rehash all" })).toBeDisabled();
  });

  it("adds Courts up to 10 and removes Idle ones without asking", async () => {
    setSession(makeSession({ courts: 9 }));
    renderAt();
    const add = screen.getByRole("button", { name: "Add court" });
    await userEvent.click(add);
    expect(screen.getByRole("region", { name: "Court 10" })).toBeInTheDocument();
    expect(add).toBeDisabled();
    expect(screen.getByText("Up to 10 courts.")).toBeInTheDocument();

    await userEvent.click(court(3).getByRole("button", { name: "Remove court" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Court 3" })).not.toBeInTheDocument();
    expect(getSession()!.courts).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Add court" })).toBeEnabled();
  });

  it("shows a short message when the engine rejects an action", async () => {
    setSession(busySession());
    renderAt();
    // Another tab ended the match meanwhile: the stored Session no longer has it active.
    const stale = getSession()!;
    const [match] = stale.matches;
    localStorage.setItem(
      "bq:v1:session",
      JSON.stringify({ version: 1, data: { ...stale, matches: [{ ...match, status: "ended" }] } }),
    );
    resetStoreForTests();
    await userEvent.click(court(1).getByRole("button", { name: "End match" }));
    await userEvent.click(screen.getByRole("button", { name: "End without score" }));
    expect(screen.getByRole("status")).toHaveTextContent("That match has already ended.");
  });
});
