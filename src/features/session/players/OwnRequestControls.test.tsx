import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../../app/App.tsx";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "../../../backend/inMemoryBackend.ts";
import {
  setBackendForTests,
  startAccountSync,
  startActiveSessionSync,
  startSharedClubSync,
} from "../../../backend/index.ts";
import { applyRequests, createRng, createSession } from "../../../domain/engine/index.ts";
import type { Session, SessionRequest } from "../../../domain/types.ts";
import { setFlash } from "../../../storage/flash.ts";
import {
  applyActiveSessionsReport,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setWelcomeDone,
} from "../../../storage/store.ts";

let roy: InMemoryBackend; // host
let cat: InMemoryBackend; // a Player, on this device
let dan: InMemoryBackend; // on the Club, but not a Session player
let session: Session;
let stops: (() => void)[] = [];

const requestsOf = async (): Promise<SessionRequest[]> => {
  let latest: SessionRequest[] = [];
  roy.observeSessionRequests("c1", "all", (requests) => (latest = requests))();
  return latest;
};

async function setup(me: "cat" | "dan" = "cat") {
  const server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  cat = createInMemoryBackend({ server });
  dan = createInMemoryBackend({ server });
  const royAccount = await roy.createAccount("Roy");
  const catAccount = await cat.createAccount("Cat");
  const danAccount = await dan.createAccount("Dan");
  await roy.createSharedClub({
    id: "c1",
    name: "Riverside",
    players: [
      { id: "p-cat", name: "Cat", skill: "beginner" },
      { id: "p-dan", name: "Dan", skill: "beginner" },
    ],
  });
  await roy.linkClubPlayer("c1", "p-cat", catAccount.accountId, "player");
  await roy.linkClubPlayer("c1", "p-dan", danAccount.accountId, "player");
  const accounts: Record<string, string | undefined> = {
    Roy: royAccount.accountId,
    Cat: catAccount.accountId,
    Eve: undefined,
    Fay: undefined,
    Gus: undefined,
  };
  session = createSession(
    {
      name: "Thursday",
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: Object.entries(accounts).map(([name, accountId]) => ({
        name,
        skill: "intermediate" as const,
        ...(accountId ? { accountId } : {}),
      })),
    },
    { now: Date.now(), rng: createRng(1) },
  );
  await roy.startSharedSession("c1", session);
  const mine = me === "cat" ? cat : dan;
  setBackendForTests(mine);
  setWelcomeDone();
  setAccount(me === "cat" ? catAccount : danAccount);
  stops = [startAccountSync(mine), startSharedClubSync(mine), startActiveSessionSync(mine)];
  return mine;
}

function renderSession() {
  render(
    <Router hook={memoryLocation({ path: `/sessions/${session.id}`, record: true }).hook}>
      <App />
    </Router>,
  );
}

const rowOf = (name: string) =>
  screen
    .getAllByRole("listitem")
    .find(
      (item) =>
        item.textContent?.startsWith(name) &&
        within(item).queryByText(/Free|Sitting|On court|In lineup/),
    )!;

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setFlash(null);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

describe("A Player's requests while watching", () => {
  it("only the Player's own Session player gets controls", async () => {
    await setup();
    renderSession();

    expect(screen.getAllByRole("button", { name: "Ask to sit out" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Leave this session" })).toHaveLength(1);
    expect(
      within(rowOf("Cat")).getByRole("button", { name: "Ask to sit out" }),
    ).toBeInTheDocument();
    expect(within(rowOf("Roy")).queryByRole("button")).not.toBeInTheDocument();
    // Still nothing that changes the Session itself.
    expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
  });

  it("an Account that isn't a Session player only watches", async () => {
    await setup("dan");
    renderSession();

    expect(screen.getByText("Watching. Roy runs this session.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to sit out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Leave this session" })).not.toBeInTheDocument();
  });

  it("sends a Sitting out request, shows Waiting for host, and then the new state once it is applied", async () => {
    await setup();
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: "Ask to sit out" }));

    expect(within(rowOf("Cat")).getByText("Waiting for host")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask to sit out" })).not.toBeInTheDocument();
    const [request] = await requestsOf();
    expect(request).toMatchObject({ kind: "sit-out", status: "pending", sessionId: session.id });

    // The host's device applies it, uploads the Session, and marks the request.
    const host = getSharedSessions()[0]!;
    const { session: applied } = applyRequests(host.session, [request!], {
      now: Date.now(),
      rng: Math.random,
    });
    await roy.publishActiveSession("c1", applied);
    await roy.resolveSessionRequests("c1", [{ id: request!.id, status: "applied" }]);
    await act(async () => {});

    expect(screen.queryByText("Waiting for host")).not.toBeInTheDocument();
    expect(within(rowOf("Cat")).getByText("Sitting out")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask to be back in" })).toBeInTheDocument();
  });

  it("says when a request wasn't needed", async () => {
    await setup();
    renderSession();
    await userEvent.click(screen.getByRole("button", { name: "Ask to sit out" }));
    const [request] = await requestsOf();

    await roy.resolveSessionRequests("c1", [{ id: request!.id, status: "skipped" }]);
    await act(async () => {});

    expect(screen.getByText("Your last request wasn't needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask to sit out" })).toBeInTheDocument();
  });

  it("asks before leaving, and Cancel sends nothing", async () => {
    await setup();
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: "Leave this session" }));
    const dialog = screen.getByRole("dialog", { name: "Leave this session?" });
    expect(dialog).toHaveTextContent("Only an Organizer can add you back");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(await requestsOf()).toEqual([]);
  });

  it("leaving waits for the host, then the Player has left and has no way back in", async () => {
    await setup();
    renderSession();
    await userEvent.click(screen.getByRole("button", { name: "Leave this session" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Leave" }),
    );

    expect(within(rowOf("Cat")).getByText("Waiting for host")).toBeInTheDocument();
    const [request] = await requestsOf();
    expect(request).toMatchObject({ kind: "leave" });

    const host = getSharedSessions()[0]!;
    const { session: applied } = applyRequests(host.session, [request!], {
      now: Date.now(),
      rng: Math.random,
    });
    await roy.publishActiveSession("c1", applied);
    await roy.resolveSessionRequests("c1", [{ id: request!.id, status: "applied" }]);
    await act(async () => {});

    expect(
      screen.getByText("You left this session. An Organizer can add you back."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Cat")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sit out|back in|Leave|Join|Rejoin/i }),
    ).not.toBeInTheDocument();
  });

  it("offline: the controls are off and say why", async () => {
    const mine = await setup();
    renderSession();

    act(() => (mine as InMemoryBackend).setOnline(false));

    expect(screen.getByRole("button", { name: "Ask to sit out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave this session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ask to sit out" })).toHaveAttribute(
      "title",
      "Needs a connection",
    );
  });

  it("the host has no request controls: they run the Session directly", async () => {
    await setup();
    // Roy's own device: hosting.
    for (const stop of stops.splice(0)) stop();
    resetStoreForTests();
    setBackendForTests(roy);
    setAccount((await roy.getCurrentAccount())!);
    stops = [startAccountSync(roy), startSharedClubSync(roy), startActiveSessionSync(roy)];
    renderSession();

    expect(screen.queryByRole("button", { name: "Ask to sit out" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sit out Roy" })).toBeInTheDocument();
    applyActiveSessionsReport({ sessions: [], unknown: [] });
  });
});
