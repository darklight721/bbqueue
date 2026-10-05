import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { setBackendForTests } from "../../backend/index.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { ActiveSession, Session } from "../../domain/types.ts";
import { setFlash } from "../../storage/flash.ts";
import {
  applyActiveSessionsReport,
  resetStoreForTests,
  setAccount,
  setSession,
  setSharedClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

function makeSession(name: string, clubId: string | null, clubName: string | null): Session {
  return createSession(
    {
      name,
      clubId,
      clubName,
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: ["Ana", "Ben", "Cat", "Dan"].map((player) => ({
        name: player,
        skill: "intermediate" as const,
      })),
    },
    { now: 1, rng: createRng(1) },
  );
}

const shared = (
  session: Session,
  clubId: string,
  hostAccountId: string,
  hostName: string,
): ActiveSession => ({
  clubId,
  session,
  hostAccountId,
  hostName,
  updatedAt: 1,
});

function renderHome() {
  render(
    <Router hook={memoryLocation({ path: "/", record: true }).hook}>
      <App />
    </Router>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setFlash(null);
  setWelcomeDone();
  setSharedClubs([
    { id: "c1", name: "Riverside", kind: "shared", players: [] },
    { id: "c2", name: "Beacon", kind: "shared", players: [] },
  ]);
  setAccount({ accountId: "roy-7k3f", name: "Roy" });
});

afterEach(() => setBackendForTests(null));

describe("Home: Active sessions", () => {
  it("lists the device's own Session and one session per Shared club, saying which one I host", () => {
    const own = makeSession("Local night", null, null);
    setSession(own);
    const mine = makeSession("Thursday", "c1", "Riverside");
    const theirs = makeSession("Friday", "c2", "Beacon");
    applyActiveSessionsReport({
      sessions: [shared(mine, "c1", "roy-7k3f", "Roy"), shared(theirs, "c2", "ana-2222", "Ana")],
      unknown: [],
    });

    renderHome();

    const resume = screen.getAllByRole("link", { name: "Resume session" });
    expect(resume).toHaveLength(2);
    expect(resume[0]).toHaveAttribute("href", `/sessions/${own.id}`);
    expect(resume[0]).toHaveTextContent("Local night");
    expect(resume[1]).toHaveAttribute("href", `/sessions/${mine.id}`);
    expect(resume[1]).toHaveTextContent("Thursday · Riverside · You're the host");
    const view = screen.getByRole("link", { name: "View session" });
    expect(view).toHaveAttribute("href", `/sessions/${theirs.id}`);
    expect(view).toHaveTextContent("Friday · Beacon · Host: Ana");
  });

  it("only says New session replaces the current session when the device has its own Session", () => {
    applyActiveSessionsReport({
      sessions: [shared(makeSession("Friday", "c2", "Beacon"), "c2", "ana-2222", "Ana")],
      unknown: [],
    });
    renderHome();
    expect(screen.getByRole("link", { name: "New session" })).toHaveTextContent(
      "Pick players and courts",
    );
  });

  it("shows a notice left by another screen, once", () => {
    setFlash("'Friday' has ended.");
    renderHome();
    expect(screen.getByRole("status")).toHaveTextContent("'Friday' has ended.");
  });
});
