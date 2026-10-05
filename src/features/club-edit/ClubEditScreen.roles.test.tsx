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
/** The name field currently holding `value`. */
const nameField = (value: string) => screen.getByDisplayValue(value) as HTMLInputElement;
const roleSelect = (who: string) => screen.getByRole("combobox", { name: `Role for ${who}` });
/** The linked line's text, e.g. "Linked to ana-2222". */
const linkedLine = () => screen.findByText(/Linked to/);
/** Clear the name field holding `value` and type `text` in it. */
async function typeOver(user: ReturnType<typeof userEvent.setup>, value: string, text: string) {
  const field = nameField(value);
  await user.clear(field);
  await user.type(field, text);
  return field;
}
const clubOf = (backend: Backend, id = "c1") =>
  new Promise<Club | undefined>((resolve) => {
    const stop = backend.observeSharedClubs((clubs) => resolve(clubs.find((c) => c.id === id)));
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
    // Saved links can't be taken back with ✕; there is no separate Account ID field.
    expect(screen.queryByRole("button", { name: /Remove link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Account ID/ })).not.toBeInTheDocument();
  });

  it("says a name field also takes an @Account ID, on rows with no link", () => {
    renderAt("/clubs/c1");

    expect(nameField("Cat")).toHaveAttribute("placeholder", "Name or @Account ID");
    expect(screen.queryByRole("button", { name: /Link Account/ })).not.toBeInTheDocument();
  });

  it("links a Club player from @Account ID in any capitalisation: the name becomes the Account's, saved as Player", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    const field = await typeOver(user, "Cat", `@${anaAccount.accountId.toUpperCase()}`);
    expect(await linkedLine()).toHaveTextContent(`Linked to ${anaAccount.accountId}`);
    expect(field).toHaveValue("Ana Bell");
    expect(field).toHaveFocus();
    expect(roleSelect("Ana Bell")).toHaveValue("player");
    await save();

    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
    const theirs = await clubOf(ana);
    expect(theirs?.name).toBe("Tuesday");
    expect(theirs?.players.find((p) => p.id === CAT.id)).toEqual({
      ...CAT,
      name: "Ana Bell",
      link: { accountId: anaAccount.accountId, role: "player" },
    });
  });

  it("shows Checking… while it looks the Account ID up", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);

    expect(screen.getByRole("status")).toHaveTextContent("Checking…");
    await linkedLine();
  });

  it("keeps the link when the name is changed, and then shows the Account's name too", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await typeOver(user, "Ana Bell", "Ana B.");

    expect(screen.getByText(/Linked to/)).toHaveTextContent(
      `Linked to ${anaAccount.accountId} · Ana Bell`,
    );
    await save();
    expect((await clubOf(ana))?.players.find((p) => p.id === CAT.id)).toMatchObject({
      name: "Ana B.",
      link: { accountId: anaAccount.accountId, role: "player" },
    });
  });

  it("✕ on a link that isn't saved yet takes it back and clears the name", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    const field = await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await user.click(screen.getByRole("button", { name: "Remove link for Ana Bell" }));

    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    await save();
    expect(screen.getByText("Enter a name")).toBeInTheDocument();

    await user.type(field, "Cat");
    await save();
    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
    expect((await clubOf(roy))?.players.find((p) => p.id === CAT.id)).toEqual(CAT);
  });

  it("links as Organizer when that Role is picked", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await save();

    expect((await clubOf(ana))?.players.find((p) => p.id === CAT.id)?.link?.role).toBe("organizer");
  });

  it("styles the Role like the Skill level, in the same column, with no Organizer tint", () => {
    renderAt("/clubs/c1");

    const role = roleSelect("Roy Smith");
    const skill = screen.getByRole("combobox", { name: "Skill level for Roy Smith" });
    expect(role).toHaveValue("organizer");
    expect(role.className).toBe(skill.className);
    expect(role.parentElement?.className).toContain("w-[8.75rem]");
    expect(skill.parentElement?.className).toContain("w-[8.75rem]");
  });

  it("rejects an Account ID nobody has, under the field, and doesn't save", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    const field = await typeOver(user, "Cat", "@nobody-abcd");
    expect(await screen.findByText("No Account has that Account ID.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("No Account has that Account ID.");
    await save();

    expect(screen.getByRole("heading", { level: 1, name: "Edit club" })).toBeInTheDocument();
    expect(screen.getByText("Fix the highlighted fields to save.")).toBeInTheDocument();
    // It's an Account ID, not a name: no name problems for it.
    expect(screen.queryByText("Enter a name")).not.toBeInTheDocument();
  });

  it("rejects an Account that is already on the roster", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await typeOver(user, "Cat", `@${royAccount.accountId.toUpperCase()}`);

    expect(await screen.findByText("That Account is already on this roster.")).toBeInTheDocument();
    expect(nameField(`@${royAccount.accountId.toUpperCase()}`)).toBeInTheDocument();
  });

  it("says so when the text doesn't look like an Account ID, once the field is left or Save is tried", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    await typeOver(user, "Cat", "@ana");
    expect(screen.queryByText(/doesn't look like an Account ID/)).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByText(/doesn't look like an Account ID/)).toBeInTheDocument();

    await typeOver(user, "@ana", "@an");
    expect(screen.queryByText(/doesn't look like an Account ID/)).not.toBeInTheDocument();
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

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await user.selectOptions(roleSelect("Roy Smith"), "player");
    await save();

    const theirs = await clubOf(ana);
    expect(theirs?.players.filter((p) => p.link?.role === "organizer").map((p) => p.id)).toEqual([
      CAT.id,
    ]);
  });

  it("turns linking and Roles off while offline, with the reason", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/c1");

    act(() => roy.setOnline(false));

    expect(roleSelect("Roy Smith")).toBeDisabled();
    expect(
      screen.getByText("You're offline. Linking Accounts and changing Roles need a connection."),
    ).toBeInTheDocument();
    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    expect(screen.getByText("Linking an Account needs a connection.")).toBeInTheDocument();
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

describe("New club while signed in", () => {
  it("starts with my own row: my name, Intermediate, linked to me as the only Organizer", () => {
    renderAt("/clubs/new");

    expect(screen.getAllByRole("textbox", { name: "Player name" })).toHaveLength(1);
    expect(nameField("Roy Smith")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Skill level for Roy Smith" })).toHaveValue(
      "intermediate",
    );
    expect(screen.getByText(royAccount.accountId)).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
    expect(screen.getByText("The only Organizer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove link/ })).not.toBeInTheDocument();
  });

  it("leaves without asking when nothing was typed", async () => {
    const location = renderAt("/clubs/new");

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe("/clubs");
  });

  it("links another Account with @ and saves the Club, my row and the link in one go", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/new");

    await user.type(screen.getByRole("textbox", { name: "Club name" }), "Friday");
    await user.type(nameField("Roy Smith"), "{End} S.");
    await user.click(screen.getByRole("button", { name: "Add player" }));
    await user.type(screen.getAllByRole("textbox", { name: "Player name" }).at(-1)!, "@");
    expect(nameField("@")).toHaveAttribute("placeholder", "Name or @Account ID");
    await user.type(nameField("@"), anaAccount.accountId);
    expect(await linkedLine()).toHaveTextContent(`Linked to ${anaAccount.accountId}`);
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await save();

    expect(screen.getByRole("heading", { level: 1, name: "Clubs" })).toBeInTheDocument();
    const created = getClubs().find((club) => club.name === "Friday");
    const theirs = await clubOf(ana, created!.id);
    expect(theirs?.name).toBe("Friday");
    expect(
      [...(theirs?.players ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => [p.name, p.skill, p.link]),
    ).toEqual([
      ["Ana Bell", "intermediate", { accountId: anaAccount.accountId, role: "organizer" }],
      ["Roy Smith S.", "intermediate", { accountId: royAccount.accountId, role: "organizer" }],
    ]);
  });

  it("keeps me an Organizer of the Club I create", async () => {
    const user = userEvent.setup();
    renderAt("/clubs/new");

    await user.click(screen.getByRole("button", { name: "Add player" }));
    await user.type(
      screen.getAllByRole("textbox", { name: "Player name" }).at(-1)!,
      `@${anaAccount.accountId}`,
    );
    await linkedLine();
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await user.selectOptions(roleSelect("Roy Smith"), "player");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You start as an Organizer. Change your Role after saving.",
    );
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
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
    expect(within(rows[2]!).getByText("Organizer")).toBeInTheDocument();
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
