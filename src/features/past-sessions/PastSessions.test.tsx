import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { EndedSession } from "../../domain/types.ts";
import { addEndedSession, resetStoreForTests } from "../../storage/store.ts";
import { sessionDay, sessionTimes } from "../session-summary/summaryFormat.ts";

function ended(id: string, name: string, endedAt: number): EndedSession {
  const team = (a: string, b: string): [string, string] => [a, b];
  return {
    id,
    name,
    clubId: null,
    pointSystem: 21,
    startedAt: endedAt - 3_600_000,
    endedAt,
    players: ["a", "b", "c", "d"].map((p) => ({ id: p, name: p.toUpperCase(), skill: "beginner" })),
    matches: [1, 2].map((number) => ({
      number,
      courtNumber: 1,
      teams: [team("a", "b"), team("c", "d")],
      target: 21,
      startedAt: endedAt - 3_000_000 + number * 1000,
      endedAt: endedAt - 2_000_000 + number * 1000,
      score: number === 1 ? ([21, 10] as [number, number]) : null,
    })),
  };
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

const stat = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement!.querySelector("dd")!;

describe("Home", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("hides Past sessions until a session has ended", () => {
    renderAt("/");
    expect(screen.queryByRole("link", { name: "Past sessions" })).not.toBeInTheDocument();
  });

  it("shows Past sessions with the count and opens the list", async () => {
    addEndedSession(ended("a", "Night", 1_000_000_000_000));
    const location = renderAt("/");
    const link = screen.getByRole("link", { name: "Past sessions" });
    expect(link).toHaveAccessibleDescription("1 session");
    await userEvent.click(link);
    expect(location.current()).toBe("/sessions");
    expect(screen.getByRole("heading", { level: 1, name: "Past sessions" })).toBeInTheDocument();
  });
});

describe("past sessions routes", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("shows an empty state", () => {
    renderAt("/sessions");
    expect(screen.getByText("No past sessions yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /night/i })).not.toBeInTheDocument();
  });

  it("lists Ended sessions newest first with date, matches and players", async () => {
    addEndedSession(ended("old", "Old night", 1_000_000_000_000));
    addEndedSession(ended("new", "New night", 2_000_000_000_000));
    const location = renderAt("/sessions");
    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/sessions/new",
      "/sessions/old",
    ]);
    expect(links[0]).toHaveAccessibleName("New night");
    expect(links[0]).toHaveTextContent("2 matches · 4 players");
    expect(links[0]).toHaveAccessibleDescription(
      `${sessionDay(2_000_000_000_000 - 3_600_000)} · ${sessionTimes(2_000_000_000_000 - 3_600_000, 2_000_000_000_000)} 2 matches · 4 players`,
    );

    await userEvent.click(links[1]!);
    expect(location.current()).toBe("/sessions/old");
  });

  it("shows the details: when, totals, Standings and matches oldest first", async () => {
    const session = ended("old", "Old night", 1_000_000_000_000);
    // E is in the Session but never played: left out of the Standings.
    session.players.push({ id: "e", name: "E", skill: "beginner" });
    addEndedSession(session);
    const location = renderAt("/sessions/old");
    expect(screen.getByRole("heading", { level: 1, name: "Old night" })).toBeInTheDocument();
    const start = 1_000_000_000_000 - 3_600_000;
    expect(screen.getByText(sessionDay(start))).toBeInTheDocument();
    expect(screen.getByText(sessionTimes(start, 1_000_000_000_000))).toBeInTheDocument();
    expect(stat("Matches played")).toHaveTextContent("2");
    expect(stat("Players")).toHaveTextContent("5");
    expect(stat("Duration")).toHaveTextContent("1 h");

    // Standings: open, every player who played, 0-win players included.
    expect(screen.queryByRole("region", { name: "Top winners" })).not.toBeInTheDocument();
    const standings = screen.getByRole("region", { name: "Standings" });
    expect(within(standings).getByText("4 players")).toBeInTheDocument();
    const hideStandings = within(standings).getByRole("button", { name: "Hide standings" });
    expect(hideStandings).toHaveAttribute("aria-expanded", "true");
    const rows = within(standings).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByText(/^[A-E]$/).textContent)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    expect(rows[0]).toHaveTextContent(/^1st.*2 matches played · 0 losses/);
    expect(rows[0]).toHaveTextContent("1win");
    expect(rows[1]).toHaveTextContent(/^1st/);
    expect(rows[2]).toHaveTextContent(/^3rd.*2 matches played · 1 loss/);
    expect(rows[2]).toHaveTextContent("0wins");
    expect(standings).not.toHaveTextContent("Joint");

    await userEvent.click(hideStandings);
    expect(within(standings).queryByRole("listitem")).not.toBeInTheDocument();
    expect(within(standings).getByRole("button", { name: "Show standings" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Matches: closed until its toggle is used.
    const matchesSection = screen.getByRole("region", { name: "Matches" });
    expect(within(matchesSection).getByText("2 matches")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Matches" })).not.toBeInTheDocument();
    const showMatches = within(matchesSection).getByRole("button", { name: "Show matches" });
    expect(showMatches).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(showMatches);
    expect(showMatches).toHaveAccessibleName("Hide matches");
    expect(showMatches).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "Matches" })).toHaveAttribute(
      "id",
      showMatches.getAttribute("aria-controls"),
    );

    const matches = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("listitem");
    expect(matches).toHaveLength(2);
    expect(within(matches[0]!).getByText("Match #1 · Court 1")).toBeInTheDocument();
    expect(within(matches[0]!).getByText("16:40")).toBeInTheDocument();
    expect(within(matches[0]!).getByText("21").parentElement).toHaveTextContent("Won, 21");
    expect(within(matches[1]!).getByText("Match #2 · Court 1")).toBeInTheDocument();
    expect(matches[1]).toHaveTextContent("No score");
    // One Target only: not shown.
    expect(screen.queryByText("21 pts")).not.toBeInTheDocument();

    // Read-only: no delete.
    expect(screen.queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(location.current()).toBe("/sessions");
  });

  it("links to the summary, which opens with a way back to the details", async () => {
    addEndedSession(ended("old", "Old night", 1_000_000_000_000));
    const location = renderAt("/sessions/old");
    const link = screen.getByRole("link", { name: "View summary" });
    expect(link).toHaveAttribute("href", "/sessions/old/summary?from=details");

    await userEvent.click(link);
    expect(location.current()).toBe("/sessions/old/summary?from=details");
    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/sessions/old");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(location.current()).toBe("/sessions/old");
    expect(screen.getByRole("heading", { level: 1, name: "Old night" })).toBeInTheDocument();
  });

  it("shows each match's Target when both 21 and 31 were used", async () => {
    const session = ended("mixed", "Mixed night", 1_000_000_000_000);
    session.matches[1]!.target = 31;
    addEndedSession(session);
    renderAt("/sessions/mixed");
    await userEvent.click(screen.getByRole("button", { name: "Show matches" }));
    const matches = within(screen.getByRole("list", { name: "Matches" })).getAllByRole("listitem");
    expect(matches[0]).toHaveTextContent("21 pts");
    expect(matches[1]).toHaveTextContent("31 pts");
  });

  it("redirects an unknown id to the list", () => {
    addEndedSession(ended("a", "Night", 1_000_000_000_000));
    expect(renderAt("/sessions/xyz").current()).toBe("/sessions");
  });

  it("does not treat 'new' as a session id", () => {
    renderAt("/sessions/new");
    expect(screen.getByRole("heading", { level: 1, name: "New session" })).toBeInTheDocument();
  });
});
