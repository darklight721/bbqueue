import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { createInMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import type { Account, Club, EndedSession } from "../../domain/types.ts";
import {
  addEndedSession,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setWelcomeDone,
} from "../../storage/store.ts";
import { sessionDay } from "../session-summary/summaryFormat.ts";

const ROY: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const DAY = 86_400_000;
const T0 = new Date(2026, 8, 1, 19).getTime();

const garage: Club = {
  id: "c1",
  name: "Garage",
  kind: "local",
  players: [
    {
      id: "p-ann",
      name: "Ann",
      skill: "intermediate",
      link: { accountId: ROY.accountId, role: "player" },
    },
    { id: "p-bob", name: "Bob", skill: "intermediate" },
    { id: "p-cat", name: "Cat", skill: "beginner" },
    { id: "p-dan", name: "Dan", skill: "advanced" },
  ],
} as Club;

const hall: Club = {
  id: "c2",
  name: "Sports Hall",
  kind: "local",
  players: [
    {
      id: "h-roy",
      name: "Roy",
      skill: "advanced",
      link: { accountId: ROY.accountId, role: "player" },
    },
    { id: "h-eve", name: "Eve", skill: "advanced" },
  ],
} as Club;

type Score = [number, number] | null;

/** One Ended session: Ann & Bob against Cat & a Guest, with the given scores (Ann's side first). */
function ended(id: string, at: number, scores: Score[], overrides: Partial<EndedSession> = {}) {
  const session: EndedSession = {
    id,
    name: `Night ${id}`,
    clubId: "c1",
    clubName: "Garage",
    pointSystem: 21,
    startedAt: at - 3_600_000,
    endedAt: at,
    players: [
      { id: "ann", name: "Ann", skill: "intermediate", clubPlayerId: "p-ann" },
      { id: "bob", name: "Bob", skill: "intermediate", clubPlayerId: "p-bob" },
      { id: "cat", name: "Cat", skill: "beginner", clubPlayerId: "p-cat" },
      { id: "gus", name: "Gus", skill: "beginner", clubPlayerId: null },
    ],
    matches: scores.map((score, index) => ({
      number: index + 1,
      courtNumber: 1,
      teams: [
        ["ann", "bob"],
        ["cat", "gus"],
      ],
      target: 21,
      startedAt: at - 3_000_000 + index * 60_000,
      endedAt: at - 2_900_000 + index * 60_000,
      score,
    })),
    ...overrides,
  };
  return session;
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  const user = userEvent.setup();
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { user, current: () => location.history.at(-1) };
}

const stat = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement!.querySelector("dd")!.textContent;

const sectionHeadings = () =>
  screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setWelcomeDone();
});

afterEach(() => {
  setBackendForTests(null);
});

describe("Club view", () => {
  beforeEach(() => {
    setLocalClubs([garage]);
    addEndedSession(
      ended("s1", T0, [
        [21, 10],
        [15, 21],
      ]),
    );
    addEndedSession(ended("s2", T0 + DAY, [[21, 19], [21, 5], null]));
  });

  it("shows header, numbers, chart, Partners and Sessions, in that order", () => {
    renderAt("/clubs/c1/players/p-ann/stats");
    expect(screen.getByRole("heading", { level: 1, name: "Stats" })).toBeInTheDocument();
    expect(sectionHeadings()).toEqual(["Ann", "Win rate", "Partners", "Sessions"]);
    expect(screen.getByRole("region", { name: "Ann" })).toHaveTextContent("Garage");

    // The numbers sit between the header and the chart.
    const numbers = screen.getByText("Matches", { selector: "dt" }).closest("dl")!;
    const chart = screen.getByRole("heading", { name: "Win rate" });
    const header = screen.getByRole("heading", { name: "Ann" });
    expect(header.compareDocumentPosition(numbers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(numbers.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(stat("Matches")).toBe("5");
    expect(stat("Wins")).toBe("3");
    expect(stat("Losses")).toBe("1");
    expect(stat("Win rate")).toBe("75%");
    expect(stat("Sessions")).toBe("2");

    // Bob is the Partner; the Guest is never one.
    const partners = screen.getByRole("region", { name: "Partners" });
    expect(
      within(partners).getByRole("article", { name: "Most frequent partner" }),
    ).toHaveTextContent("Bob");
    expect(within(partners).getByRole("article", { name: "Best partner" })).toHaveTextContent(
      "75%",
    );

    // Newest first, each opening its Ended session (whose Back returns here).
    const rows = within(screen.getByRole("list", { name: "Sessions" })).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      `${sessionDay(T0 + DAY - 3_600_000)}: 2 wins, 0 losses, 1st place`,
      `${sessionDay(T0 - 3_600_000)}: 1 win, 1 loss, 1st place`,
    ]);
    expect(rows[0]).toHaveAttribute("href", "/sessions/s2?statsClub=c1&statsPlayer=p-ann");
    // One Club only: rows don't repeat its name.
    expect(rows[0]).not.toHaveTextContent("Garage");
    expect(
      screen.getByText(/Only sessions ended since Stats were added count/),
    ).toBeInTheDocument();
  });

  it("labels each chart dot and highlights its Session row when tapped", async () => {
    const { user } = renderAt("/clubs/c1/players/p-ann/stats");
    const dots = within(screen.getByRole("group", { name: "Win rate per session" })).getAllByRole(
      "button",
    );
    // Oldest on the left.
    expect(dots.map((dot) => dot.getAttribute("aria-label"))).toEqual([
      `${sessionDay(T0 - 3_600_000)}: 1 win, 1 loss, 2 matches`,
      `${sessionDay(T0 + DAY - 3_600_000)}: 2 wins, 0 losses, 3 matches`,
    ]);
    await user.click(dots[0]!);
    const row = screen.getByRole("link", { name: new RegExp(`^${sessionDay(T0 - 3_600_000)}:`) });
    expect(row).toHaveAttribute("data-highlighted", "true");
    expect(row).toHaveFocus();
  });

  it("shows a plain empty state for an unknown Club player, keeping Back", async () => {
    const { user, current } = renderAt("/clubs/c1/players/nobody/stats");
    expect(screen.getByText("No stats to show")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Win rate" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(current()).toBe("/clubs/c1/sessions");
  });

  it("opened directly, Back goes to the Club's Past sessions", async () => {
    const { user, current } = renderAt("/clubs/c1/players/p-ann/stats");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(current()).toBe("/clubs/c1/sessions");
  });
});

describe("Club view with no win or loss", () => {
  it("shows – for the Win rate and a gap in the chart, not 0%", () => {
    setLocalClubs([garage]);
    addEndedSession(ended("s3", T0, [null, null]));
    renderAt("/clubs/c1/players/p-ann/stats");
    expect(stat("Matches")).toBe("2");
    expect(stat("Win rate")).toBe("–");
    expect(screen.queryByTestId("overall-line")).not.toBeInTheDocument();
    expect(screen.getByText("No win or loss")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Win rate per session" })).getByRole("button", {
        name: `${sessionDay(T0 - 3_600_000)}: 0 wins, 0 losses, 2 matches`,
      }),
    ).toBeInTheDocument();
  });
});

describe("Ended session Standings", () => {
  beforeEach(() => {
    setLocalClubs([garage]);
    addEndedSession(
      ended("s1", T0, [
        [21, 10],
        [15, 21],
      ]),
    );
  });

  it("links Club players to their Stats; Guests stay plain", async () => {
    const { user, current } = renderAt("/sessions/s1?fromClub=c1");
    const standings = screen.getByRole("list", { name: "Standings" });
    const ann = within(standings).getByRole("link", { name: "Stats for Ann" });
    expect(ann).toHaveAttribute("href", "/clubs/c1/players/p-ann/stats?session=s1&fromClub=c1");
    expect(within(standings).queryByRole("link", { name: /Gus/ })).not.toBeInTheDocument();
    expect(within(standings).getByText("Gus")).toBeInTheDocument();

    await user.click(ann);
    expect(screen.getByRole("heading", { level: 2, name: "Ann" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    // Back to the Ended session, which still knows its own list.
    expect(current()).toBe("/sessions/s1?fromClub=c1");
  });

  it("has no links in a Session without a Club", () => {
    addEndedSession(
      ended("s9", T0 + DAY, [[21, 10]], {
        clubId: null,
        clubName: null,
      }),
    );
    renderAt("/sessions/s9");
    expect(
      within(screen.getByRole("list", { name: "Standings" })).queryAllByRole("link"),
    ).toHaveLength(0);
  });

  it("a Session row in the Stats opens it, and its Back returns to the Stats", async () => {
    const { user, current } = renderAt("/clubs/c1/players/p-ann/stats");
    await user.click(within(screen.getByRole("list", { name: "Sessions" })).getByRole("link"));
    expect(current()).toBe("/sessions/s1?statsClub=c1&statsPlayer=p-ann");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(current()).toBe("/clubs/c1/players/p-ann/stats");
  });
});

describe("Account view", () => {
  beforeEach(() => {
    setBackendForTests(createInMemoryBackend({ account: ROY }));
  });

  it("without an Account goes to the Account page", () => {
    const { current } = renderAt("/account/stats");
    expect(current()).toBe("/account");
  });

  it("explains that stats need a Club, and shows nothing else", () => {
    setAccount(ROY);
    setLocalClubs([
      {
        ...garage,
        players: garage.players.map((p) => ({ id: p.id, name: p.name, skill: p.skill })),
      },
    ]);
    addEndedSession(ended("s1", T0, [[21, 10]]));
    renderAt("/account/stats");
    expect(screen.getByRole("heading", { level: 1, name: "Your stats" })).toBeInTheDocument();
    expect(
      screen.getByText(/once an Organizer adds you to their Club with your Account ID/),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.queryByText("Win rate")).not.toBeInTheDocument();
  });

  it("combines every linked Club under the Account's name, naming the Club on each row", async () => {
    setAccount(ROY);
    setLocalClubs([garage, hall]);
    addEndedSession(
      ended("s1", T0, [
        [21, 10],
        [15, 21],
      ]),
    );
    addEndedSession({
      ...ended("h1", T0 + DAY, [[21, 3]]),
      clubId: "c2",
      clubName: "Sports Hall",
      players: [
        { id: "ann", name: "Roy", skill: "advanced", clubPlayerId: "h-roy" },
        { id: "bob", name: "Eve", skill: "advanced", clubPlayerId: "h-eve" },
        { id: "cat", name: "Zed", skill: "beginner", clubPlayerId: null },
        { id: "gus", name: "Gus", skill: "beginner", clubPlayerId: null },
      ],
    });
    const { user, current } = renderAt("/account");
    await user.click(screen.getByRole("link", { name: "Your stats" }));
    expect(current()).toBe("/account/stats");

    expect(sectionHeadings()[0]).toBe("Roy Smith");
    expect(stat("Sessions")).toBe("2");
    expect(stat("Win rate")).toBe("67%");
    const rows = within(screen.getByRole("list", { name: "Sessions" })).getAllByRole("link");
    expect(rows[0]).toHaveTextContent("Sports Hall");
    expect(rows[1]).toHaveTextContent("Garage");
    expect(rows[0]).toHaveAttribute("href", "/sessions/h1?accountStats=1");

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(current()).toBe("/account");
  });
});
