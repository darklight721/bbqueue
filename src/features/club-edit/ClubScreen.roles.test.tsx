import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
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
/** Open the Club page, then Edit players from it. */
async function editAt(path: string) {
  const location = renderAt(path);
  await userEvent.click(screen.getByRole("link", { name: "Edit players" }));
  return location;
}
/** Off Edit players, back on the Club page. */
const expectSaved = () =>
  expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
/** The name field currently holding `value`. */
const nameField = (value: string) => screen.getByDisplayValue(value) as HTMLInputElement;
const roleSelect = (who: string) => screen.getByRole("combobox", { name: `Role for ${who}` });
/** The linked line's Account ID, e.g. "ana-2222" (the only place it shows as text). */
const linkedLine = (accountId = anaAccount.accountId) => screen.findByText(accountId);
/** Clear the name field holding `value` and type `text` in it. */
async function typeOver(user: ReturnType<typeof userEvent.setup>, value: string, text: string) {
  const field = nameField(value);
  await user.clear(field);
  await user.type(field, text);
  return field;
}
/** The note at the top of Edit players on how to link an Account (its text spans a <b>). */
const LINK_HINT = (_: string, element: Element | null) =>
  element?.tagName === "P" &&
  element.textContent ===
    "To link a player to their Account, type @ and their Account ID in the name field. They'll find it on their Account page.";
const clubOf = (backend: Backend, id = "c1") =>
  new Promise<Club | undefined>((resolve) => {
    const stop = backend.observeSharedClubs((clubs) => resolve(clubs.find((c) => c.id === id)));
    stop();
  });

describe("Club screen for an Organizer", () => {
  it("made a Player while on Edit players, lands on the Club page", async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "organizer");
    const location = await editAt("/clubs/c1");
    expect(location.current()).toBe("/clubs/c1/players");

    const royRow = getClubs()[0]!.players.find(
      (player) => player.link?.accountId === royAccount.accountId,
    )!;
    await act(() => ana.setClubPlayerRole("c1", royRow.id, "player"));

    expect(await screen.findByText("Shared club · You're a Player")).toBeInTheDocument();
    expect(location.current()).toBe("/clubs/c1");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the creator's row linked as Organizer, with You and the Account ID", async () => {
    await editAt("/clubs/c1");

    expect(screen.getByText(royAccount.accountId)).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
    expect(screen.getByText("The only Organizer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
    // Your own row can't be unlinked here (Leave club does that); there is no separate Account
    // ID field.
    expect(screen.queryByRole("button", { name: /Unlink/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Account ID/ })).not.toBeInTheDocument();
  });

  it("marks linked rows on the Club page, Organizers and Players alike, without their Account IDs", async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "player");
    renderAt("/clubs/c1");

    expect(await screen.findByRole("link", { name: "Cat" })).toHaveAccessibleDescription(
      "Linked to an account, Beginner",
    );
    expect(screen.getByRole("link", { name: "Roy Smith" })).toHaveAccessibleDescription(
      /^You, Organizer, Linked to an account, /,
    );
    expect(screen.getByRole("link", { name: "Dan" })).toHaveAccessibleDescription("Advanced");
    expect(screen.queryByText(anaAccount.accountId)).not.toBeInTheDocument();
  });

  it("says a name field also takes an @Account ID, on rows with no link", async () => {
    await editAt("/clubs/c1");

    expect(screen.getByText(LINK_HINT)).toBeInTheDocument();
    expect(nameField("Cat")).toHaveAttribute("placeholder", "Name or @Account ID");
    expect(screen.queryByRole("button", { name: /Link Account/ })).not.toBeInTheDocument();
  });

  it("links a Club player from @Account ID in any capitalisation: the name becomes the Account's, saved as Player", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    const field = await typeOver(user, "Cat", `@${anaAccount.accountId.toUpperCase()}`);
    expect(await linkedLine()).toHaveAttribute("title", anaAccount.accountId);
    expect(field).toHaveValue("Ana Bell");
    expect(field).toHaveFocus();
    expect(roleSelect("Ana Bell")).toHaveValue("player");
    await save();

    expectSaved();
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
    await editAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);

    expect(screen.getByText("Checking…").closest("[role=status]")).toBeInTheDocument();
    await linkedLine();
  });

  it("keeps the link when the name is changed, showing the Account ID and never the Account's name", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await typeOver(user, "Ana Bell", "Ana B.");

    expect(screen.getByText(anaAccount.accountId)).toBeInTheDocument();
    expect(screen.queryByText(/Ana Bell/)).not.toBeInTheDocument();
    await save();
    expect((await clubOf(ana))?.players.find((p) => p.id === CAT.id)).toMatchObject({
      name: "Ana B.",
      link: { accountId: anaAccount.accountId, role: "player" },
    });
  });

  it("Unlink on a link that isn't saved yet takes it back and clears the name", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    const field = await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await user.click(screen.getByRole("button", { name: "Unlink Ana Bell" }));

    expect(screen.queryByText(anaAccount.accountId)).not.toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    await save();
    expect(screen.getByText("Enter a name")).toBeInTheDocument();

    await user.type(field, "Cat");
    await save();
    expectSaved();
    expect((await clubOf(roy))?.players.find((p) => p.id === CAT.id)).toEqual(CAT);
  });

  it("links as Organizer when that Role is picked", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    await typeOver(user, "Cat", `@${anaAccount.accountId}`);
    await linkedLine();
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await save();

    expect((await clubOf(ana))?.players.find((p) => p.id === CAT.id)?.link?.role).toBe("organizer");
  });

  it("styles the Role like the Skill level, in the same column, with no Organizer tint", async () => {
    await editAt("/clubs/c1");

    const role = roleSelect("Roy Smith");
    const skill = screen.getByRole("combobox", { name: "Skill level for Roy Smith" });
    expect(role).toHaveValue("organizer");
    expect(role.className).toBe(skill.className);
    expect(role.parentElement?.className).toContain("w-[8.75rem]");
    expect(skill.parentElement?.className).toContain("w-[8.75rem]");
  });

  it("rejects an Account ID nobody has, under the field, and doesn't save", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    const field = await typeOver(user, "Cat", "@nobody-abcd");
    expect(await screen.findByText("No Account has that Account ID.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("No Account has that Account ID.");
    await save();

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("Fix the highlighted fields to save.")).toBeInTheDocument();
    // It's an Account ID, not a name: no name problems for it.
    expect(screen.queryByText("Enter a name")).not.toBeInTheDocument();
  });

  it("rejects an Account that is already on the roster", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

    await typeOver(user, "Cat", `@${royAccount.accountId.toUpperCase()}`);

    expect(await screen.findByText("That Account is already on this roster.")).toBeInTheDocument();
    expect(nameField(`@${royAccount.accountId.toUpperCase()}`)).toBeInTheDocument();
  });

  it("says so when the text doesn't look like an Account ID, once the field is left or Save is tried", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

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
    await editAt("/clubs/c1");

    await user.selectOptions(roleSelect("Roy Smith"), "player");

    expect(screen.getByRole("alert")).toHaveTextContent("A Club needs at least one Organizer.");
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
  });

  it("lets the last Organizer hand over and step down in one Save", async () => {
    const user = userEvent.setup();
    await editAt("/clubs/c1");

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
    await editAt("/clubs/c1");

    act(() => roy.setOnline(false));

    expect(roleSelect("Roy Smith")).toBeDisabled();
    expect(
      screen.getByText("You're offline. Linking Accounts and changing Roles need a connection."),
    ).toBeInTheDocument();
    // The offline note takes the hint's place.
    expect(screen.queryByText(LINK_HINT)).not.toBeInTheDocument();
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
    await editAt("/clubs/c2");

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
    await editAt("/clubs/c1");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Skill level for Cat" }),
      "advanced",
    );
    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can't change this Club. Only Organizers can.",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("blocks Leave club for the last Organizer, with the reason", () => {
    renderAt("/clubs/c1");

    expect(screen.getByRole("button", { name: "Leave club" })).toBeDisabled();
    expect(screen.getByText(/You're the only Organizer/)).toBeInTheDocument();
  });
});

describe("New club while signed in", () => {
  /** Clubs → Add club → name → Create club: Edit players for the new Club. */
  async function create(user: ReturnType<typeof userEvent.setup>, name: string) {
    const location = renderAt("/clubs");
    await user.click(screen.getByRole("button", { name: "Add club" }));
    const sheet = screen.getByRole("dialog", { name: "New club" });
    await user.type(within(sheet).getByRole("textbox", { name: "Club name" }), name);
    await user.click(within(sheet).getByRole("button", { name: "Create club" }));
    await screen.findByRole("button", { name: "Save" });
    return location;
  }

  it("starts with my own row (my name, Intermediate, the only Organizer) and an empty row after it", async () => {
    await create(userEvent.setup(), "Friday");

    expect(screen.getAllByRole("textbox", { name: "Player name" })).toHaveLength(2);
    expect(nameField("Roy Smith")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Skill level for Roy Smith" })).toHaveValue(
      "intermediate",
    );
    expect(screen.getByText(royAccount.accountId)).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(roleSelect("Roy Smith")).toHaveValue("organizer");
    expect(screen.getByText("The only Organizer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Roy Smith" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlink/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Player name" })[1]).toHaveFocus();
  });

  it("leaves for the new Club page without asking when nothing was typed", async () => {
    const location = await create(userEvent.setup(), "Friday");
    const created = getClubs().find((club) => club.name === "Friday")!;
    expect(location.current()).toBe(`/clubs/${created.id}/players`);

    await userEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(location.current()).toBe(`/clubs/${created.id}`);
    expect(screen.getByRole("heading", { level: 2, name: "Friday" })).toBeInTheDocument();
  });

  it("links another Account with @ in the empty row, saved after the Club is made", async () => {
    const user = userEvent.setup();
    await create(user, "Friday");

    await user.type(nameField("Roy Smith"), "{End} S.");
    const blank = screen.getAllByRole("textbox", { name: "Player name" }).at(-1)!;
    await user.type(blank, "@");
    expect(nameField("@")).toHaveAttribute("placeholder", "Name or @Account ID");
    await user.type(nameField("@"), anaAccount.accountId);
    await linkedLine();
    await user.selectOptions(roleSelect("Ana Bell"), "organizer");
    await save();

    expectSaved();
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
});

describe("Leave club as one of several Organizers", () => {
  it("shows it's busy while the server answers and keeps Back and the form still", async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "organizer");
    signInAs(roy, royAccount);
    let fail!: (error: unknown) => void;
    vi.spyOn(roy, "leaveClub").mockReturnValue(new Promise((_, reject) => (fail = reject)));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const location = renderAt("/clubs/c1");

    await user.click(await screen.findByRole("button", { name: "Leave club" }));
    const dialog = screen.getByRole("dialog", { name: "Leave Tuesday?" });
    await user.click(within(dialog).getByRole("button", { name: "Leave club" }));

    expect(within(dialog).getByRole("button", { name: "Leaving…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Back", hidden: true }));
    expect(location.current()).toBe("/clubs/c1");

    await act(async () => fail(new BackendError("failed")));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your changes. Try again.");
    expect(screen.getByRole("button", { name: "Leave club" })).toBeEnabled();
  });
});

describe("Club screen for a Player", () => {
  beforeEach(async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "player");
    signInAs(ana, anaAccount);
  });

  it("opening Edit players lands on the Club page instead", () => {
    const location = renderAt("/clubs/c1/players");
    expect(location.current()).toBe("/clubs/c1");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("sees the same Club page without Edit: the roster, You on their row, and no Account IDs or controls", () => {
    renderAt("/clubs/c1");

    expect(screen.getByRole("heading", { level: 1, name: "Club" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tuesday" })).toBeInTheDocument();
    expect(screen.getByText("Shared club · You're a Player")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit club name" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit players" })).not.toBeInTheDocument();
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
    // Each row still opens that Club player's Stats.
    expect(screen.getByRole("link", { name: "Dan" })).toHaveAttribute(
      "href",
      `/clubs/c1/players/${DAN.id}/stats?clubPage=1`,
    );
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

  it("Leave club shows it's busy while the server answers, then is normal again after a failure", async () => {
    let fail!: (error: unknown) => void;
    const leave = vi
      .spyOn(ana, "leaveClub")
      .mockReturnValue(new Promise((_, reject) => (fail = reject)));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const location = renderAt("/clubs/c1");

    await user.click(screen.getByRole("button", { name: "Leave club" }));
    const dialog = screen.getByRole("dialog", { name: "Leave Tuesday?" });
    await user.click(within(dialog).getByRole("button", { name: "Leave club" }));

    const busy = within(dialog).getByRole("button", { name: "Leaving…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(busy);
    expect(leave).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "Leave Tuesday?" })).toBeInTheDocument();

    await act(async () => fail(new BackendError("failed")));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your changes. Try again.");
    expect(location.current()).toBe("/clubs/c1");
    expect(screen.getByRole("button", { name: "Leave club" })).toBeEnabled();
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
