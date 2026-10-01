import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { SessionSummary } from "../../domain/types.ts";
import { getSummary, resetStoreForTests, setSummary } from "../../storage/store.ts";
import { formatSessionDuration, ordinal } from "./summaryFormat.ts";

const START = Date.UTC(2026, 9, 2, 18, 0, 0);
const MIN = 60_000;

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionName: "Thursday Smash",
    totalMatches: 12,
    totalPlayers: 16,
    startedAt: START,
    endedAt: START + 135 * MIN,
    topWinners: [
      { place: 1, name: "Ana", skill: "advanced", wins: 4, played: 5 },
      { place: 1, name: "Ben", skill: "intermediate", wins: 4, played: 5 },
      { place: 3, name: "Cat", skill: "beginner", wins: 3, played: 4 },
      { place: 3, name: "Dan", skill: "intermediate", wins: 3, played: 4 },
    ],
    ...overrides,
  };
}

function renderAt(path = "/session/summary") {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

describe("formatSessionDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatSessionDuration(135 * MIN)).toBe("2 h 15 min");
    expect(formatSessionDuration(45 * MIN)).toBe("45 min");
    expect(formatSessionDuration(60 * MIN)).toBe("1 h");
    expect(formatSessionDuration(119.6 * MIN)).toBe("2 h");
    expect(formatSessionDuration(89.4 * MIN)).toBe("1 h 29 min");
    expect(formatSessionDuration(61_000)).toBe("1 min");
    expect(formatSessionDuration(59_999)).toBe("Under 1 min");
    expect(formatSessionDuration(0)).toBe("Under 1 min");
    expect(formatSessionDuration(-5 * MIN)).toBe("Under 1 min");
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
  });
});

describe("SessionSummaryScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreForTests();
  });

  it("redirects Home when there is no summary", () => {
    const location = renderAt();
    expect(location.current()).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeInTheDocument();
  });

  it("shows the Session name and totals", () => {
    setSummary(summary());
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByText("Thursday Smash")).toBeInTheDocument();

    const totals = Object.fromEntries(
      screen
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(totals).toEqual({ "Matches played": "12", Players: "16", Duration: "2 h 15 min" });
  });

  it("lists top winners with shared places, showing everyone placed 3rd or better", () => {
    setSummary(summary());
    renderAt();
    const list = within(screen.getByRole("region", { name: "Top winners" })).getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Joint 1stAna.*Advanced.*Joint 1st · 5 matches played4wins$/),
      expect.stringMatching(/^Joint 1stBen.*Intermediate.*5 matches played4wins$/),
      expect.stringMatching(/^Joint 3rdCat.*Beginner.*4 matches played3wins$/),
      expect.stringMatching(/^Joint 3rdDan.*/),
    ]);
  });

  it("shows a single winner without 'Joint'", () => {
    setSummary(
      summary({
        topWinners: [
          { place: 1, name: "Ana", skill: "advanced", wins: 1, played: 1 },
          { place: 2, name: "Ben", skill: "beginner", wins: 1, played: 2 },
        ],
      }),
    );
    renderAt();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/^1stAna.*1 match played1win$/);
    expect(rows[1]).toHaveTextContent(/^2ndBen.*2 matches played1win$/);
    expect(screen.queryByText(/Joint/)).not.toBeInTheDocument();
  });

  it("says when there were no scored matches", () => {
    setSummary(summary({ topWinners: [] }));
    renderAt();
    expect(screen.getByText("No scored matches")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("goes Home, which clears the summary", async () => {
    setSummary(summary());
    const location = renderAt();
    await userEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(location.current()).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeInTheDocument();
    expect(getSummary()).toBeNull();
  });
});
