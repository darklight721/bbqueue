import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import type { Club, EndedSession } from "../../domain/types.ts";
import {
  addEndedSession,
  applyEndedSessionsReport,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSharedClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

function ended(
  id: string,
  name: string,
  endedAt: number,
  clubId: string | null,
  clubName: string | null,
): EndedSession {
  return {
    id,
    name,
    clubId,
    clubName,
    pointSystem: 21,
    startedAt: endedAt - 3_600_000,
    endedAt,
    players: ["a", "b", "c", "d"].map((p) => ({
      id: p,
      name: p.toUpperCase(),
      skill: "beginner",
      clubPlayerId: null,
    })),
    matches: [
      {
        number: 1,
        courtNumber: 1,
        teams: [
          ["a", "b"],
          ["c", "d"],
        ],
        target: 21,
        startedAt: endedAt - 3_000_000,
        endedAt: endedAt - 2_000_000,
        score: [21, 10],
      },
    ],
  };
}

const T = Date.UTC(2026, 9, 1, 20, 0, 0);
const riverside: Club = { id: "c1", name: "Riverside", kind: "shared", players: [] };
const garage: Club = { id: "c2", name: "Garage", kind: "local", players: [] };

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { current: () => location.history.at(-1) };
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setWelcomeDone();
  setAccount({ accountId: "ana-2222", name: "Ana" });
  setSharedClubs([riverside]);
  setLocalClubs([garage]);
  addEndedSession(ended("own", "Garage night", T - 2 * 86_400_000, "c2", "Garage"));
  applyEndedSessionsReport({
    sessions: [ended("shared-1", "Thursday at Riverside", T, "c1", "Riverside")],
    clubIds: ["c1"],
  });
});

describe("Ended sessions of Shared clubs", () => {
  it("Home counts them with the device's own", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Past sessions" })).toHaveAccessibleDescription(
      "2 sessions",
    );
  });

  it("Past sessions lists them with the device's own, newest first", () => {
    renderAt("/sessions");

    const rows = screen
      .getAllByRole("link")
      .filter((link) => /night|Thursday/.test(link.textContent ?? ""));
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Thursday at Riverside"),
      expect.stringContaining("Garage night"),
    ]);
  });

  it("the Club filter finds a Shared club's sessions, and the Club's own list does too", async () => {
    renderAt("/sessions?club=c1");
    expect(screen.getByRole("link", { name: /Thursday at Riverside/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Garage night/ })).not.toBeInTheDocument();
  });

  it("the Club's sessions list shows them, and a Player reaches it from the Club screen", async () => {
    renderAt("/clubs/c1");
    await userEvent.click(screen.getByRole("link", { name: /Sessions/ }));

    expect(screen.getByRole("link", { name: /Thursday at Riverside/ })).toBeInTheDocument();
  });

  it("opens the details and the Session summary", async () => {
    renderAt("/sessions");
    await userEvent.click(screen.getByRole("link", { name: /Thursday at Riverside/ }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Thursday at Riverside" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "View summary" }));

    expect(screen.getByRole("heading", { level: 1, name: "Session summary" })).toBeInTheDocument();
    expect(screen.getByText("Thursday at Riverside")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share/ })).toBeInTheDocument();
  });

  it("works from the copy on the device after a reload", () => {
    resetStoreForTests();
    renderAt("/sessions");
    expect(screen.getByRole("link", { name: /Thursday at Riverside/ })).toBeInTheDocument();
  });

  it("is gone once the Account is no longer on the Club", () => {
    setSharedClubs([]);
    renderAt("/sessions");
    expect(screen.queryByRole("link", { name: /Thursday at Riverside/ })).not.toBeInTheDocument();
    expect(within(document.body).getByRole("link", { name: /Garage night/ })).toBeInTheDocument();
  });
});
