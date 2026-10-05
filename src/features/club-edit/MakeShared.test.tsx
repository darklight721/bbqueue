import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import {
  setBackendForTests,
  startAccountSync,
  startActiveSessionSync,
  startSharedClubSync,
} from "../../backend/index.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { Club, EndedSession } from "../../domain/types.ts";
import {
  addEndedSession,
  getClubs,
  getLocalClubs,
  getSession,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setSession,
  setWelcomeDone,
} from "../../storage/store.ts";

const garage: Club = {
  id: "c1",
  name: "Garage",
  kind: "local",
  players: [
    { id: "p-ana", name: "Ana", skill: "beginner" },
    { id: "p-roy", name: "Roy S.", skill: "advanced" },
    { id: "p-cat", name: "Cat", skill: "intermediate" },
    { id: "p-dan", name: "Dan", skill: "intermediate" },
  ],
};

let backend: InMemoryBackend;
let stops: (() => void)[] = [];

function renderClub() {
  render(
    <Router hook={memoryLocation({ path: "/clubs/c1", record: true }).hook}>
      <App />
    </Router>,
  );
}

async function start(options: { signedIn: boolean } = { signedIn: true }) {
  backend = createInMemoryBackend();
  setBackendForTests(backend);
  setWelcomeDone();
  if (options.signedIn) setAccount(await backend.createAccount("Roy Smith"));
  setLocalClubs([garage]);
  stops = [
    startAccountSync(backend),
    startSharedClubSync(backend),
    startActiveSessionSync(backend),
  ];
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  stops = [];
  setBackendForTests(null);
  vi.restoreAllMocks();
});

const makeButton = () => screen.getByRole("button", { name: "Make shared club" });

describe("Make shared club", () => {
  it("is offered on a Local club to a signed-in person", async () => {
    await start();
    renderClub();
    expect(makeButton()).toBeEnabled();
  });

  it("says what it needs when there is no Account, and isn't there without a Backend", async () => {
    await start({ signedIn: false });
    renderClub();
    expect(screen.queryByRole("button", { name: "Make shared club" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Create an Account to share this club with other people."),
    ).toBeInTheDocument();
  });

  it("isn't offered without a Backend at all", () => {
    setWelcomeDone();
    setLocalClubs([garage]);
    renderClub();
    expect(screen.queryByText(/Make shared club|Create an Account/)).not.toBeInTheDocument();
  });

  it("offline: turned off, with the reason", async () => {
    await start();
    renderClub();

    act(() => backend.setOnline(false));

    expect(makeButton()).toBeDisabled();
    expect(
      screen.getByText("You're offline. Sharing a club needs a connection."),
    ).toBeInTheDocument();
  });

  it("with unsaved changes: turned off until they are saved", async () => {
    await start();
    renderClub();

    await userEvent.type(screen.getByRole("textbox", { name: "Club name" }), "!");

    expect(makeButton()).toBeDisabled();
    expect(screen.getByText("Save your changes first.")).toBeInTheDocument();
  });

  it("asks which player you are, with no way to skip, then confirms that it can't be undone", async () => {
    await start();
    renderClub();

    await userEvent.click(makeButton());
    const sheet = screen.getByRole("dialog", { name: "Which player are you?" });
    const proceed = within(sheet).getByRole("button", { name: "Continue" });
    expect(proceed).toBeDisabled();
    expect(within(sheet).getAllByRole("radio")).toHaveLength(5);
    expect(within(sheet).getByRole("radio", { name: /Add me/ })).toBeEnabled();

    await userEvent.click(within(sheet).getByRole("radio", { name: "Roy S." }));
    await userEvent.click(proceed);

    const confirm = screen.getByRole("dialog", { name: "Make Garage a shared club?" });
    expect(confirm).toHaveTextContent(
      "Anyone you add can see this club and its sessions. This can't be undone.",
    );
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));

    // Nothing happened.
    expect(getLocalClubs().map((club) => club.id)).toEqual(["c1"]);
  });

  it("makes the Club shared with the chosen row linked, once, with Account linking available", async () => {
    await start();
    renderClub();

    await userEvent.click(makeButton());
    await userEvent.click(screen.getByRole("radio", { name: "Roy S." }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Make Garage a shared club?" })).getByRole(
        "button",
        {
          name: "Make shared club",
        },
      ),
    );

    await vi.waitFor(() => expect(getLocalClubs()).toEqual([]));
    const clubs = getClubs();
    expect(clubs).toHaveLength(1);
    expect(clubs[0]).toMatchObject({ id: "c1", name: "Garage", kind: "shared" });
    expect(clubs[0]?.players.map((p) => [p.id, p.link?.role ?? null])).toEqual([
      ["p-ana", null],
      ["p-roy", "organizer"],
      ["p-cat", null],
      ["p-dan", null],
    ]);
    // The screen follows: no Make shared club, no "This device only", and rows can be linked now.
    expect(screen.queryByRole("button", { name: "Make shared club" })).not.toBeInTheDocument();
    expect(screen.queryByText("This device only")).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("Ana")).toHaveAttribute(
      "placeholder",
      "Name or @Account ID",
    );
  });

  it("Add me adds the Account as a new row, and is refused when the name is on the roster", async () => {
    await start();
    renderClub();
    await userEvent.click(makeButton());
    await userEvent.click(screen.getByRole("radio", { name: /Add me/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Make Garage a shared club?" })).getByRole(
        "button",
        {
          name: "Make shared club",
        },
      ),
    );

    await vi.waitFor(() => expect(getLocalClubs()).toEqual([]));
    const me = getClubs()[0]!.players.at(-1)!;
    expect(me).toMatchObject({
      name: "Roy Smith",
      skill: "intermediate",
      link: { role: "organizer" },
    });
    expect(getClubs()[0]!.players).toHaveLength(5);
  });

  it("refuses Add me when a player called that is on the roster", async () => {
    await start();
    setLocalClubs([
      {
        ...garage,
        players: [...garage.players, { id: "p-me", name: "roy smith", skill: "beginner" }],
      },
    ]);
    renderClub();

    await userEvent.click(makeButton());

    expect(screen.getByRole("radio", { name: /Add me/ })).toBeDisabled();
    expect(screen.getByText(/Roy Smith is on the roster already/)).toBeInTheDocument();
  });

  it("brings the Club's Ended sessions and its running Session, making this Account the host", async () => {
    await start();
    const ended: EndedSession = {
      id: "e1",
      name: "Last week",
      clubId: "c1",
      clubName: "Garage",
      pointSystem: 21,
      startedAt: 1,
      endedAt: 2,
      players: [],
      matches: [],
    };
    addEndedSession(ended);
    addEndedSession({ ...ended, id: "e2", clubId: null, clubName: null, endedAt: 3 });
    const running = createSession(
      {
        name: "Tonight",
        clubId: "c1",
        clubName: "Garage",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: garage.players.map((p) => ({ name: p.name, skill: p.skill, clubPlayerId: p.id })),
      },
      { now: 1, rng: createRng(1) },
    );
    setSession(running);
    renderClub();

    await userEvent.click(makeButton());
    await userEvent.click(screen.getByRole("radio", { name: "Roy S." }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Make Garage a shared club?" })).getByRole(
        "button",
        {
          name: "Make shared club",
        },
      ),
    );

    await vi.waitFor(() => expect(getLocalClubs()).toEqual([]));
    // The device slot is empty; the Session is the Club's, hosted here, with Roy's link kept on his player.
    expect(getSession()).toBeNull();
    const [hosted] = getSharedSessions();
    expect(hosted).toMatchObject({ clubId: "c1", hostName: "Roy Smith" });
    expect(hosted?.session.players.find((p) => p.name === "Roy S.")?.accountId).toBe(
      hosted?.hostAccountId,
    );
    expect(hosted?.session.players.find((p) => p.name === "Ana")).not.toHaveProperty("accountId");
    // The server has all of it; the Ended session of no Club stays on the device only.
    let onServer: string[] = [];
    backend.observeEndedSessions((report) => (onServer = report.sessions.map((s) => s.id)))();
    expect(onServer).toEqual(["e1"]);
    let active: string[] = [];
    backend.observeActiveSessions(
      (report) => (active = report.sessions.map((s) => s.session.id)),
    )();
    expect(active).toEqual([running.id]);
  });

  it("a failed conversion leaves the Local club, its Session and its Ended sessions as they were", async () => {
    await start();
    const running = createSession(
      {
        name: "Tonight",
        clubId: "c1",
        clubName: "Garage",
        pointSystem: 21,
        plannedHours: 1,
        courts: 1,
        players: garage.players.map((p) => ({ name: p.name, skill: p.skill, clubPlayerId: p.id })),
      },
      { now: 1, rng: createRng(1) },
    );
    setSession(running);
    const spy = vi.spyOn(backend, "makeSharedClub").mockRejectedValue(new BackendError("failed"));
    const cleanup = vi.spyOn(backend, "deleteSharedClub");
    renderClub();

    await userEvent.click(makeButton());
    await userEvent.click(screen.getByRole("radio", { name: "Roy S." }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Make Garage a shared club?" })).getByRole(
        "button",
        {
          name: "Make shared club",
        },
      ),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't make this club shared. It's still on this device only. Try again.",
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(getLocalClubs()).toEqual([garage]);
    expect(getClubs()).toEqual([garage]);
    expect(getSession()).toBe(running);
    expect(getSharedSessions()).toEqual([]);
    // A half-made Club on the server is cleaned up.
    expect(cleanup).toHaveBeenCalledWith("c1");
    expect(makeButton()).toBeEnabled();
  });

  it("shows a Club once, even while the server already lists it", async () => {
    await start();
    // The server has the Club (a conversion in progress); the device still has the Local one.
    await backend.createSharedClub({ id: "c1", name: "Garage", players: [] });
    await vi.waitFor(() => expect(getClubs().filter((club) => club.id === "c1")).toHaveLength(1));
    expect(getClubs()[0]?.kind).toBe("local");
  });
});
