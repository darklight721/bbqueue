import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { EndedSession, EndedSessionMatch, SkillLevel } from "../../domain/types.ts";
import { getEndedSessions, resetStoreForTests, addEndedSession } from "../../storage/store.ts";
import { formatSessionDuration, ordinal } from "./summaryFormat.ts";

const domToBlob = vi.hoisted(() => vi.fn());
vi.mock("modern-screenshot", () => ({ domToBlob }));

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
    // Two Courts, taking turns.
    courtNumber: (index % 2) + 1,
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
    clubName: null,
    pointSystem: 21,
    startedAt: START,
    endedAt: START + 135 * MIN,
    players: PLAYERS.filter(([id]) => played.has(id)).map(([id, skill]) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      skill,
      clubPlayerId: null,
    })),
    matches,
    ...overrides,
  };
}

/** Ana & Ben win 4 of 5, Cat & Dan win 3 of 3 (tied 1st, tied 3rd). */
function tiedSession(): EndedSession {
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
  it("rounds to the nearest half hour, at least 0.5 h", () => {
    expect(formatSessionDuration(135 * MIN)).toBe("2.5 h");
    expect(formatSessionDuration(134 * MIN)).toBe("2 h");
    expect(formatSessionDuration(45 * MIN)).toBe("1 h");
    expect(formatSessionDuration(44 * MIN)).toBe("0.5 h");
    expect(formatSessionDuration(60 * MIN)).toBe("1 h");
    expect(formatSessionDuration(100 * MIN)).toBe("1.5 h");
    expect(formatSessionDuration(5 * MIN)).toBe("0.5 h");
    expect(formatSessionDuration(0)).toBe("0.5 h");
    expect(formatSessionDuration(-5 * MIN)).toBe("0.5 h");
    expect(formatSessionDuration(Number.NaN)).toBe("0.5 h");
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
    addEndedSession(tiedSession());
    const location = renderAt("/sessions/nope/summary");
    expect(location.current()).toBe("/sessions");
    expect(screen.getByRole("heading", { level: 1, name: "Past sessions" })).toBeInTheDocument();
  });

  it("shows the Session name and totals", () => {
    addEndedSession(tiedSession());
    renderAt();
    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByText("Thursday Smash")).toBeInTheDocument();

    // In reading order of the 2×2 grid: Matches · Players / Courts · Duration.
    const totals = screen
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(totals).toEqual([
      ["Matches", "7"],
      ["Players", "8"],
      ["Courts", "2"],
      ["Duration", "2.5 h"],
    ]);
  });

  it("lists top winners with shared places, showing everyone placed 3rd or better", () => {
    addEndedSession(tiedSession());
    renderAt();
    const list = within(screen.getByRole("region", { name: "Top winners" })).getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^1stAna.*Advanced.*5 matches played4wins$/),
      expect.stringMatching(/^1stBen.*Intermediate.*5 matches played4wins$/),
      expect.stringMatching(/^3rdCat.*Beginner.*3 matches played3wins$/),
      expect.stringMatching(/^3rdDan.*/),
    ]);
    expect(screen.queryByText(/Joint/)).not.toBeInTheDocument();
  });

  it("shows single winners with their own places", () => {
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
    addEndedSession(tiedSession());
    const location = renderAt();
    await userEvent.click(screen.getByRole("link", { name: "Home" }));
    expect(location.current()).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getEndedSessions()).toHaveLength(1);
  });

  describe("branding and sharing", () => {
    function setNavigator(props: { canShare?: unknown; share?: unknown }) {
      Object.defineProperty(navigator, "canShare", { value: props.canShare, configurable: true });
      Object.defineProperty(navigator, "share", { value: props.share, configurable: true });
    }

    beforeEach(() => {
      domToBlob.mockReset();
      domToBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
      addEndedSession(tiedSession());
    });

    afterEach(() => {
      setNavigator({});
    });

    it("shows the BBQueue brand in the hero without a level-1 BBQueue heading", () => {
      renderAt();
      const hero = screen.getByRole("banner");
      expect(within(hero).getByText("BBQueue")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1, name: "BBQueue" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Session summary");
    });

    it("ends the shared image with a text-only footer (no logo)", () => {
      renderAt();
      const footer = document.querySelector("[data-share-only]")!;
      expect(footer).not.toBeNull();
      expect(footer).toHaveTextContent("Made with BBQueue");
      expect(footer.querySelector("svg, img")).toBeNull();
    });

    it("keeps the Share button and Home link out of the captured area", () => {
      renderAt();
      const capture = document.querySelector("[data-summary-capture]")!;
      expect(capture).not.toBeNull();
      const share = screen.getByRole("button", { name: "Share summary" });
      const home = screen.getByRole("link", { name: "Home" });
      expect(capture.contains(share)).toBe(false);
      expect(capture.contains(home)).toBe(false);
      expect(capture).toContainElement(screen.getByRole("heading", { level: 1 }));
    });

    it("offers Home, not Back, when opened without ?from=details", () => {
      renderAt();
      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
      expect(screen.queryByRole("link", { name: "Back" })).not.toBeInTheDocument();
    });

    it("offers Back to the details instead of Home when opened from the details", async () => {
      const location = renderAt("/sessions/s1/summary?from=details");
      const back = screen.getByRole("link", { name: "Back" });
      expect(back).toHaveAttribute("href", "/sessions/s1");
      expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
      expect(document.querySelector("[data-summary-capture]")).not.toContainElement(back);

      await userEvent.click(back);
      expect(location.current()).toBe("/sessions/s1");
      expect(screen.getByRole("heading", { level: 1, name: "Thursday Smash" })).toBeInTheDocument();
    });

    it("shares one PNG file when the share sheet is available", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      setNavigator({ canShare: () => true, share });
      renderAt();
      await userEvent.click(screen.getByRole("button", { name: "Share summary" }));

      await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      const arg = share.mock.calls[0]![0] as { files: File[] };
      expect(arg.files).toHaveLength(1);
      expect(arg.files[0]!.type).toBe("image/png");
      expect(arg.files[0]!.name).toMatch(/^bbqueue-thursday-smash-\d{4}-\d{2}-\d{2}\.png$/);
      expect(screen.queryByText("Couldn't create the image")).not.toBeInTheDocument();
    });

    it("shows a short error when the image can't be created", async () => {
      domToBlob.mockRejectedValue(new Error("boom"));
      renderAt();
      await userEvent.click(screen.getByRole("button", { name: "Share summary" }));
      expect(await screen.findByText("Couldn't create the image")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share summary" })).toBeEnabled();
    });
  });
});
