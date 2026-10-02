import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { EndedSession, EndedSessionMatch, SkillLevel } from "../../domain/types.ts";
import { getEndedSessions, resetStoreForTests, addEndedSession } from "../../storage/store.ts";
import { formatSessionDuration, ordinal } from "./summaryFormat.ts";

const START = Date.UTC(2026, 9, 2, 18, 0, 0);
const MIN = 60_000;

const PLAYERS: [string, SkillLevel][] = [
  ["ana", "advanced"],
  ["ben", "intermediate"],
  ["cat", "beginner"],
  ["dan", "intermediate"],
  ["eve", "intermediate"],
  ["fay", "intermediate"],
  ["gus", "intermediate"],
  ["hal", "intermediate"],
];

/** Matches as [team A, team B, score]; ids are the lowercase names above. */
function endedSession(
  rows: [[string, string], [string, string], [number, number] | null][],
  overrides: Partial<EndedSession> = {},
): EndedSession {
  const matches: EndedSessionMatch[] = rows.map(([a, b, score], index) => ({
    number: index + 1,
    courtNumber: 1,
    teams: [a, b],
    target: 21,
    startedAt: START + index * 10 * MIN,
    endedAt: START + index * 10 * MIN + 8 * MIN,
    score,
  }));
  const played = new Set(rows.flatMap(([a, b]) => [...a, ...b]));
  return {
    id: "s1",
    name: "Thursday Smash",
    clubId: null,
    pointSystem: 21,
    startedAt: START,
    endedAt: START + 135 * MIN,
    players: PLAYERS.filter(([id]) => played.has(id)).map(([id, skill]) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      skill,
    })),
    matches,
    ...overrides,
  };
}

/** Ana & Ben win 4 of 5, Cat & Dan win 3 of 3 (Joint 1st, Joint 3rd). */
function jointSession(): EndedSession {
  const abWin = (): [[string, string], [string, string], [number, number]] => [
    ["ana", "ben"],
    ["eve", "fay"],
    [21, 5],
  ];
  const cdWin = (): [[string, string], [string, string], [number, number]] => [
    ["cat", "dan"],
    ["gus", "hal"],
    [21, 5],
  ];
  return endedSession([
    abWin(),
    abWin(),
    abWin(),
    abWin(),
    [
      ["ana", "ben"],
      ["cat", "dan"],
      [10, 21],
    ],
    cdWin(),
    cdWin(),
  ]);
}

function renderAt(path = "/sessions/s1/summary") {
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

  it("redirects to the past sessions list for an unknown id", () => {
    addEndedSession(jointSession());
    const location = renderAt("/sessions/nope/summary");
    expect(location.current()).toBe("/sessions");
    expect(screen.getByRole("heading", { level: 1, name: "Past sessions" })).toBeInTheDocument();
  });

  it("shows the Session name and totals", () => {
    addEndedSession(jointSession());
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByText("Thursday Smash")).toBeInTheDocument();

    const totals = Object.fromEntries(
      screen
        .getAllByRole("term")
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(totals).toEqual({ "Matches played": "7", Players: "8", Duration: "2 h 15 min" });
  });

  it("lists top winners with shared places, showing everyone placed 3rd or better", () => {
    addEndedSession(jointSession());
    renderAt();
    const list = within(screen.getByRole("region", { name: "Top winners" })).getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Joint 1stAna.*Advanced.*Joint 1st · 5 matches played4wins$/),
      expect.stringMatching(/^Joint 1stBen.*Intermediate.*5 matches played4wins$/),
      expect.stringMatching(/^Joint 3rdCat.*Beginner.*3 matches played3wins$/),
      expect.stringMatching(/^Joint 3rdDan.*/),
    ]);
  });

  it("shows single winners without 'Joint'", () => {
    addEndedSession(
      endedSession([
        [
          ["ana", "ben"],
          ["cat", "dan"],
          [21, 5],
        ],
        [
          ["ana", "eve"],
          ["ben", "fay"],
          [21, 10],
        ],
      ]),
    );
    renderAt();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/^1stAna.*2 matches played2wins$/);
    expect(rows[1]).toHaveTextContent(/^2ndEve.*1 match played1win$/);
    expect(rows[2]).toHaveTextContent(/^3rdBen.*2 matches played1win$/);
    expect(screen.queryByText(/Joint/)).not.toBeInTheDocument();
  });

  it("says when there were no scored matches", () => {
    addEndedSession(endedSession([[["ana", "ben"], ["cat", "dan"], null]]));
    renderAt();
    expect(screen.getByText("No scored matches")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("goes Home and keeps the Ended session", async () => {
    addEndedSession(jointSession());
    const location = renderAt();
    await userEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(location.current()).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeInTheDocument();
    expect(getEndedSessions()).toHaveLength(1);
  });
});
