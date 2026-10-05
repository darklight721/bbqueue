import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "../../backend/inMemoryBackend.ts";
import {
  setBackendForTests,
  startAccountSync,
  startActiveSessionSync,
  startSharedClubSync,
} from "../../backend/index.ts";
import { takeOverSession } from "../../backend/sessions.ts";
import { createRng, createSession } from "../../domain/engine/index.ts";
import type { Account, ActiveSession, Session } from "../../domain/types.ts";
import { setFlash } from "../../storage/flash.ts";
import {
  applyActiveSessionsReport,
  getSharedSessions,
  resetStoreForTests,
  setAccount,
  setWelcomeDone,
} from "../../storage/store.ts";

let ana: InMemoryBackend; // the Session host
let roy: InMemoryBackend; // another Organizer, on this device
let cat: InMemoryBackend; // a Player
let royAccount: Account;
let stops: (() => void)[] = [];
let session: Session;

function renderSession() {
  const location = memoryLocation({ path: `/sessions/${session.id}`, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
}

/** Ana hosts Riverside's session; Roy is an Organizer, Cat a Player. This device is `me`. */
async function setup(me: "roy" | "cat") {
  const server = createInMemoryServer();
  ana = createInMemoryBackend({ server });
  roy = createInMemoryBackend({ server });
  cat = createInMemoryBackend({ server });
  const anaAccount = await ana.createAccount("Ana");
  royAccount = await roy.createAccount("Roy");
  const catAccount = await cat.createAccount("Cat");
  await ana.createSharedClub({
    id: "c1",
    name: "Riverside",
    players: [
      { id: "p-roy", name: "Roy", skill: "intermediate" },
      { id: "p-cat", name: "Cat", skill: "intermediate" },
    ],
  });
  await ana.linkClubPlayer("c1", "p-roy", royAccount.accountId, "organizer");
  await ana.linkClubPlayer("c1", "p-cat", catAccount.accountId, "player");
  session = createSession(
    {
      name: "Thursday",
      clubId: "c1",
      clubName: "Riverside",
      pointSystem: 21,
      plannedHours: 1,
      courts: 1,
      players: ["Ana", "Roy", "Cat", "Dan"].map((name) => ({
        name,
        skill: "intermediate" as const,
      })),
    },
    { now: Date.now(), rng: createRng(1) },
  );
  await ana.startSharedSession("c1", session);
  const mine = me === "roy" ? roy : cat;
  setBackendForTests(mine);
  setWelcomeDone();
  setAccount(me === "roy" ? royAccount : catAccount);
  stops = [startAccountSync(mine), startSharedClubSync(mine), startActiveSessionSync(mine)];
  void anaAccount;
  return mine;
}

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setFlash(null);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

describe("Take over", () => {
  it("is offered to an Organizer who isn't the host, not to a Player", async () => {
    await setup("cat");
    renderSession();
    expect(screen.getByText("Watching. Ana runs this session.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take over" })).not.toBeInTheDocument();
  });

  it("is offered nowhere to the host", async () => {
    await setup("roy");
    await takeOverSession("c1");
    renderSession();
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take over" })).not.toBeInTheDocument();
  });

  it("asks first, warning that unuploaded changes are lost, and Cancel changes nothing", async () => {
    await setup("roy");
    renderSession();

    await userEvent.click(screen.getByRole("button", { name: "Take over" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Take over as host?");
    expect(dialog).toHaveTextContent("Changes Ana made but never uploaded will be lost");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Watching. Ana runs this session.")).toBeInTheDocument();
    expect(getSharedSessions()[0]?.hostName).toBe("Ana");
  });

  it("makes this Account the host straight away, with every control back", async () => {
    await setup("roy");
    renderSession();
    expect(screen.queryByRole("button", { name: "Start match" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Take over" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Take over" }),
    );

    expect(await screen.findByRole("button", { name: "Start match" })).toBeInTheDocument();
    expect(screen.queryByText(/Watching\./)).not.toBeInTheDocument();
    expect(getSharedSessions()[0]).toMatchObject({ hostName: "Roy" });
    expect((await ana.getActiveSession("c1"))?.hostName).toBe("Roy");
  });

  it("needs a connection: the button is off and says why", async () => {
    await setup("roy");
    renderSession();

    act(() => roy.setOnline(false));

    expect(screen.getByRole("button", { name: "Take over" })).toBeDisabled();
    expect(screen.getByText("Taking over needs a connection.")).toBeInTheDocument();
  });

  it("explains to the former host what happened, and drops their controls", async () => {
    await setup("roy");
    await roy.takeOverSession("c1");
    const mine = getSharedSessions();
    expect(mine).toHaveLength(1);
    // Roy's device took over (the server says so), then Ana takes it back.
    applyActiveSessionsReport({
      sessions: [{ ...(await roy.getActiveSession("c1"))! }],
      unknown: [],
    });
    renderSession();
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();

    act(() =>
      applyActiveSessionsReport({
        sessions: [
          {
            ...(getSharedSessions()[0] as ActiveSession),
            hostAccountId: "ana-2222",
            hostName: "Ana",
          },
        ],
        unknown: [],
      }),
    );

    expect(screen.queryByRole("button", { name: "End session" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Ana took over. Changes you hadn't uploaded were dropped."),
    ).toBeInTheDocument();
  });
});
