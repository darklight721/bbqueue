import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { App } from "../../app/App.tsx";
import { BackendError, type Backend } from "../../backend/backend.ts";
import {
  createInMemoryBackend,
  createInMemoryServer,
  type InMemoryBackend,
} from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import type { Account, Club, ClubPlayer } from "../../domain/types.ts";
import {
  getClubs,
  resetStoreForTests,
  setAccount,
  setSharedClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

const CAT: ClubPlayer = { id: "p-cat", name: "Cat", skill: "beginner" };
const DAN: ClubPlayer = { id: "p-dan", name: "Dan", skill: "advanced" };

let server = createInMemoryServer();
let roy: InMemoryBackend;
let ana: InMemoryBackend;
let royAccount: Account;
let anaAccount: Account;
let stops: (() => void)[] = [];

/** Sign in as `person` on this device, as the app does at startup. */
function signInAs(backend: Backend, account: Account) {
  for (const stop of stops.splice(0)) stop();
  resetStoreForTests();
  localStorage.clear();
  setWelcomeDone();
  setBackendForTests(backend);
  setAccount(account);
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
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

beforeEach(async () => {
  server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  ana = createInMemoryBackend({ server });
  royAccount = await roy.createAccount("Roy Smith");
  anaAccount = await ana.createAccount("Ana Bell");
  await roy.createSharedClub({ id: "c1", name: "Tuesday", players: [CAT, DAN] });
  signInAs(roy, royAccount);
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
});

const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));
const idField = (who: string) =>
  screen.getByRole("textbox", { name: new RegExp(`Account ID.* for ${who}`) });
const roleSelect = (who: string) => screen.getByRole("combobox", { name: `Role for ${who}` });
const clubOf = (backend: Backend) =>
  new Promise<Club | undefined>((resolve) => {
    const stop = backend.observeSharedClubs((clubs) => resolve(clubs.find((c) => c.id === "c1")));
    stop();
  });

describe("Club screen for an Organizer", () => {
  it("shows the creator's row linked as Organizer, with You and the Account ID", () => {
    renderAt("/clubs/c1");

    expect(screen.getByText(royAccount.accountId)).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
    expect(screen.getByText("The only Organizer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
  });

  it("links a Club player to an Account typed in any capitalisation: ✓ Name, then saves as Player", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), anaAccount.accountId.toUpperCase());
    expect(await screen.findByText("✓ Ana Bell")).toBeInTheDocument();
    await save();

    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
    const theirs = await clubOf(ana);
    expect(theirs?.name).toBe("Tuesday");
    expect(theirs?.players.find((p) => p.id === CAT.id)?.link).toEqual({
      accountId: anaAccount.accountId,
      role: "player",
    });
  });

  it("links as Organizer when that Role is picked", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), anaAccount.accountId);
    await screen.findByText("✓ Ana Bell");
    await user.selectOptions(roleSelect("Cat"), "organizer");
    await save();

    expect((await clubOf(ana))?.players.find((p) => p.id === CAT.id)?.link?.role).toBe("organizer");
  });

  it("rejects an Account ID nobody has, and doesn't save", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), "nobody-abcd");
    expect(await screen.findByText("No Account has that Account ID.")).toBeInTheDocument();
    expect(idField("Cat")).toHaveAttribute("aria-invalid", "true");
    await save();

    expect(screen.getByRole("heading", { level: 1, name: "Edit club" })).toBeInTheDocument();
    expect(screen.getByText("Fix the highlighted fields to save.")).toBeInTheDocument();
  });

  it("rejects an Account that is already on the roster", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), royAccount.accountId.toUpperCase());

    expect(await screen.findByText("That Account is already on this roster.")).toBeInTheDocument();
  });

  it("says so when the text doesn't look like an Account ID, once Save is tried", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), "ana");
    await save();

    expect(screen.getByText(/doesn't look like an Account ID/)).toBeInTheDocument();
  });

  it("blocks demoting the last Organizer, with the reason", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.selectOptions(roleSelect("Roy Smith"), "player");

    expect(screen.getByRole("alert")).toHaveTextContent("A Club needs at least one Organizer.");
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
  });

  it("lets the last Organizer hand over and step down in one Save", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await user.type(idField("Cat"), anaAccount.accountId);
    await screen.findByText("✓ Ana Bell");
    await user.selectOptions(roleSelect("Cat"), "organizer");
    await user.selectOptions(roleSelect("Roy Smith"), "player");
    await save();

    const theirs = await clubOf(ana);
    expect(theirs?.players.filter((p) => p.link?.role === "organizer").map((p) => p.id)).toEqual([
      CAT.id,
    ]);
  });

  it("turns Account IDs and Roles off while offline, with the reason", async () => {
    renderAt("/clubs/c1");

    act(() => roy.setOnline(false));

    expect(idField("Cat")).toBeDisabled();
    expect(roleSelect("Roy Smith")).toBeDisabled();
    expect(
      screen.getByText("You're offline. Linking Accounts and changing Roles need a connection."),
    ).toBeInTheDocument();
  });

  it("lets Organizers unlink an Account that no longer exists", async () => {
    const user = userEvent.setup();
    const ghost: Club = {
      id: "c2",
      name: "Haunted",
      kind: "shared",
      players: [
        {
          id: "p-roy",
          name: "Roy Smith",
          skill: "intermediate",
          link: { accountId: royAccount.accountId, role: "organizer" },
        },
        {
          id: "p-ghost",
          name: "Gus",
          skill: "beginner",
          link: { accountId: "ghost-abcd", role: "player" },
        },
      ],
    };
    server.clubs = [...server.clubs, ghost];
    setSharedClubs(await new Promise<Club[]>((resolve) => roy.observeSharedClubs(resolve)()));
    renderAt("/clubs/c2");

    expect(await screen.findByText("This Account no longer exists.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Unlink Gus" }));
    await save();

    const after = getClubs().find((c) => c.id === "c2");
    expect(after?.players.find((p) => p.id === "p-ghost")?.link).toBeUndefined();
    expect(after?.players.map((p) => p.id)).toContain("p-ghost");
  });

  it("tells the person when the server refuses a change, and stays on the screen", async () => {
    const user = userEvent.setup();
    setBackendForTests({
      ...roy,
      updateClubPlayer: () => Promise.reject(new BackendError("forbidden")),
    });
    renderAt("/clubs/c1");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Skill level for Cat" }),
      "advanced",
    );
    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can't change this Club. Only Organizers can.",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Edit club" })).toBeInTheDocument();
  });

  it("blocks Leave club for the last Organizer, with the reason", () => {
    renderAt("/clubs/c1");

    expect(screen.getByRole("button", { name: "Leave club" })).toBeDisabled();
    expect(screen.getByText(/You're the only Organizer/)).toBeInTheDocument();
  });
});

describe("Club screen for a Player", () => {
  beforeEach(async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "player");
    signInAs(ana, anaAccount);
  });

  it("is read-only: the roster, You on their row, and no Account IDs or controls", () => {
    renderAt("/clubs/c1");

    expect(screen.getByRole("heading", { level: 1, name: "Tuesday" })).toBeInTheDocument();
    expect(screen.getByText("You're a Player")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Cat"),
      expect.stringContaining("Dan"),
      expect.stringContaining("Roy Smith"),
    ]);
    expect(within(rows[0]!).getByText("You")).toBeInTheDocument();
    expect(screen.getAllByText("You")).toHaveLength(1);
    expect(screen.queryByText(royAccount.accountId)).not.toBeInTheDocument();
    expect(screen.queryByText(anaAccount.accountId)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add player" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete club" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /New session/ })).not.toBeInTheDocument();
  });

  it("leaves the Club: it goes from their list and the row stays on the roster", async () => {
    const user = userEvent.setup();
    const location = renderAt("/clubs/c1");

    await user.click(screen.getByRole("button", { name: "Leave club" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Leave club" }),
    );

    expect(location.current()).toBe("/clubs");
    expect(getClubs()).toEqual([]);
    const stays = server.clubs.find((c) => c.id === "c1")?.players.find((p) => p.id === CAT.id);
    expect(stays).toEqual(CAT);
  });

  it("turns Leave club off while offline, with the reason", () => {
    renderAt("/clubs/c1");

    act(() => ana.setOnline(false));

    expect(screen.getByRole("button", { name: "Leave club" })).toBeDisabled();
    expect(
      screen.getByText("You're offline. Leaving a Club needs a connection."),
    ).toBeInTheDocument();
  });

  it("doesn't offer a Club they can't organise in New session", async () => {
    renderAt("/sessions/new");

    expect(screen.queryByRole("option", { name: "Tuesday" })).not.toBeInTheDocument();
  });
});
