import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  type InMemoryServer,
} from "../../backend/inMemoryBackend.ts";
import { setBackendForTests, startAccountSync, startSharedClubSync } from "../../backend/index.ts";
import type { Account, ClubPlayer } from "../../domain/types.ts";
import { getAccount, resetStoreForTests, setAccount, setWelcomeDone } from "../../storage/store.ts";

const ALEX: ClubPlayer = { id: "p-alex", name: "Alex", skill: "beginner" };
const BEA: ClubPlayer = { id: "p-bea", name: "Bea", skill: "advanced" };
const CLUB = "Thursday Smashers";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

let server: InMemoryServer;
/** The Organizer, on their own device: made the Club and its Join link. */
let roy: InMemoryBackend;
let royAccount: Account;
/** This device, holding the Join link. */
let device: InMemoryBackend;
let token: string;
let stops: (() => void)[] = [];

/** Use `backend` on this device, as the app does at startup; with `account`, signed in. */
function startDevice(backend: Backend, account?: Account) {
  for (const stop of stops.splice(0)) stop();
  resetStoreForTests();
  localStorage.clear();
  setBackendForTests(backend);
  if (account) {
    setWelcomeDone();
    setAccount(account);
  }
  stops = [startAccountSync(backend), startSharedClubSync(backend)];
}

function renderAt(path = `/join/${token}`) {
  const location = memoryLocation({ path, record: true });
  render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { history: () => location.history, current: () => location.history.at(-1) };
}

/** The Club's row named `name`, on the server. */
const row = (name: string) =>
  server.clubs.find((club) => club.id === "c1")!.players.find((player) => player.name === name)!;
const confirmSheet = (name: string) =>
  screen.findByRole("dialog", { name: `You're ${name} in ${CLUB}?` });
const nameInClubField = () => screen.findByRole("textbox", { name: `Your name in ${CLUB}` });
const OFFLINE = "Connect to the internet to join this club.";
const explanation = () => screen.queryByRole("heading", { name: "What happens next" });
/** Lets the in-memory Backend's answers land while the timers are fake. */
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(async () => {
  server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  royAccount = await roy.createAccount("Roy Smith");
  await roy.createSharedClub({ id: "c1", name: CLUB, players: [ALEX, BEA] });
  const ana = createInMemoryBackend({ server });
  await roy.linkClubPlayer("c1", BEA.id, (await ana.createAccount("Ana Bell")).accountId, "player");
  token = await roy.getJoinLink("c1");
  device = createInMemoryBackend({ server });
  startDevice(device);
});

afterEach(() => {
  vi.useRealTimers();
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
  for (const key of ["userAgent", "clipboard"]) Reflect.deleteProperty(navigator, key);
});

describe("Join page without an Account", () => {
  it("opens without Welcome, with the Club's name and no roster, and only a way Home", async () => {
    renderAt();

    expect(await screen.findByRole("heading", { name: CLUB })).toBeInTheDocument();
    expect(screen.getByText("Welcome to")).toBeInTheDocument();
    expect(screen.queryByText("Join club")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /welcome/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Alex")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  });

  it("checks the name as Welcome does", async () => {
    renderAt();
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your name" })).toHaveFocus();
  });

  it("a matching name: Confirm, then the Account is made with it and the Club page opens in place", async () => {
    const location = renderAt();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), " alex ");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const sheet = await confirmSheet("alex");
    expect(sheet).toHaveAccessibleDescription(
      "You'll be linked as a Player and see the club and its sessions.",
    );
    expect(getAccount()).toBeNull();
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
    expect(location.history()).toEqual(["/clubs/c1"]);
    expect(getAccount()).toMatchObject({ name: "alex" });
    expect(row("Alex").link).toEqual({ accountId: getAccount()!.accountId, role: "player" });
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("no match: the name in the Club is asked for, and the Account keeps the first name", async () => {
    renderAt();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), "Jordan");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    await userEvent.type(await nameInClubField(), "Alex");
    await userEvent.click(screen.getByRole("button", { name: "Find me" }));
    await userEvent.click(
      within(await confirmSheet("Alex")).getByRole("button", { name: "Yes, that's me" }),
    );

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Jordan" });
    expect(row("Alex").link?.accountId).toBe(getAccount()!.accountId);
  });

  it("a Claim that fails after the Account was made keeps the Account, and Yes tries again", async () => {
    vi.spyOn(device, "claimClubPlayer").mockRejectedValueOnce(new BackendError("failed"));
    renderAt();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), "Alex");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const sheet = await confirmSheet("Alex");
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Couldn't link you. Try again.",
    );
    const account = getAccount();
    expect(account).toMatchObject({ name: "Alex" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
    expect(getAccount()).toEqual(account);
    expect(row("Alex").link?.accountId).toBe(account!.accountId);
  });

  it("no match on the name in the Club either: Ask an Organizer, and no Account is made", async () => {
    renderAt();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), "Jordan");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.type(await nameInClubField(), "Sammy");
    await userEvent.click(screen.getByRole("button", { name: "Find me" }));

    expect(
      await screen.findByText(
        `No one called Sammy in ${CLUB}. Ask an Organizer to add you, then open this link again.`,
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try another name" }));

    const field = await nameInClubField();
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(getAccount()).toBeNull();
    expect(await device.getCurrentAccount()).toBeNull();
    expect(server.accounts).toHaveLength(2);
  });

  it("a name already linked says so", async () => {
    renderAt();
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), "Bea");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "Bea is already linked to an Account. If that's not you, ask an Organizer to unlink it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another name" })).toBeInTheDocument();
    expect(getAccount()).toBeNull();
  });

  it("Go to Home from a dead end shows Welcome on a device that never opened the app", async () => {
    renderAt("/join/AAAAAAAAAAAAAAAAAAAAAA");

    expect(
      await screen.findByText(
        "This Join link doesn't work any more. Ask an Organizer for a new one.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to Home" }));

    expect(await screen.findByRole("heading", { name: /welcome/i })).toBeInTheDocument();
  });
});

describe("Join page with an Account", () => {
  async function signedInAs(name: string) {
    const account = await device.createAccount(name);
    startDevice(device, account);
    return account;
  }

  it("asks Confirm straight away when the Account's Name matches", async () => {
    await signedInAs("Alex");
    renderAt();

    const sheet = await confirmSheet("Alex");
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
    expect(row("Alex").link?.accountId).toBe(getAccount()!.accountId);
  });

  it("I go by another name, or closing the sheet, asks for the name in the Club", async () => {
    await signedInAs("Alex");
    renderAt();

    await userEvent.click(
      within(await confirmSheet("Alex")).getByRole("button", { name: "I go by another name" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await nameInClubField()).toHaveFocus();

    await userEvent.type(await nameInClubField(), "alex{Enter}");
    await userEvent.click(
      within(await confirmSheet("alex")).getByRole("button", { name: "Close" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await nameInClubField()).toHaveValue("");
  });

  it("asks for the name in the Club when the Account's Name doesn't match, and never renames it", async () => {
    await signedInAs("Jordan");
    renderAt();

    await userEvent.type(await nameInClubField(), "Alex");
    await userEvent.click(screen.getByRole("button", { name: "Find me" }));
    await userEvent.click(
      within(await confirmSheet("Alex")).getByRole("button", { name: "Yes, that's me" }),
    );

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Jordan" });
  });

  it("says when someone else Claimed the name first", async () => {
    await signedInAs("Alex");
    renderAt();
    const sheet = await confirmSheet("Alex");

    const kim = createInMemoryBackend({ server });
    await kim.createAccount("Kim");
    await kim.claimClubPlayer(token, "Alex");
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(await screen.findByText("Alex was just linked to another Account.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try another name" }));
    expect(await nameInClubField()).toHaveValue("");
  });

  it("an Organizer renaming the row before Yes: Ask an Organizer, and Try another name", async () => {
    await signedInAs("Alex");
    renderAt();
    const sheet = await confirmSheet("Alex");

    await roy.updateClubPlayer("c1", ALEX.id, { name: "Alexander" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(
      await screen.findByText(
        `No one called Alex in ${CLUB}. Ask an Organizer to add you, then open this link again.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try another name" }));
    expect(await nameInClubField()).toHaveValue("");
  });

  it("the link reset before Yes: the dead end", async () => {
    await signedInAs("Alex");
    renderAt();
    const sheet = await confirmSheet("Alex");

    await roy.resetJoinLink("c1");
    await userEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));

    expect(
      await screen.findByText(
        "This Join link doesn't work any more. Ask an Organizer for a new one.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("on the Club already by the time of Yes, but the Club doesn't come: its page opens after 10 s", async () => {
    await signedInAs("Alex");
    vi.spyOn(device, "claimClubPlayer").mockRejectedValue(new BackendError("already-linked"));
    const location = renderAt();
    const sheet = await confirmSheet("Alex");

    vi.useFakeTimers();
    fireEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));
    await advance(0);
    await advance(9_999);
    expect(within(sheet).getByRole("button", { name: "Linking…" })).toBeInTheDocument();
    expect(location.current()).toBe(`/join/${token}`);

    await advance(1);
    // The Club isn't on the device: its page sends you on to Clubs.
    expect(location.history()).toEqual(["/clubs"]);
  });

  it("Claimed, but the Club doesn't reach the device: its page opens after 10 s", async () => {
    await signedInAs("Alex");
    const location = renderAt();
    const sheet = await confirmSheet("Alex");
    // Nothing brings the Club to the device.
    for (const stop of stops.splice(0)) stop();

    vi.useFakeTimers();
    fireEvent.click(within(sheet).getByRole("button", { name: "Yes, that's me" }));
    await advance(0);
    await advance(9_999);
    expect(row("Alex").link?.accountId).toBe(getAccount()!.accountId);
    expect(location.current()).toBe(`/join/${token}`);

    await advance(1);
    expect(location.history()).toEqual(["/clubs"]);
  });

  it("opens the Club page in place when the Account is on the Club already", async () => {
    startDevice(roy, royAccount);
    const location = renderAt();

    expect(await screen.findByText("Shared club · You're an Organizer")).toBeInTheDocument();
    expect(location.history()).toEqual(["/clubs/c1"]);
  });
});

describe("Join page explanation", () => {
  async function typeYourName(name: string) {
    await userEvent.type(await screen.findByRole("textbox", { name: "Your name" }), name);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  }

  it("says what happens next and what a Player can do, above Your name", async () => {
    renderAt();
    const field = await screen.findByRole("textbox", { name: "Your name" });

    expect(explanation()).toBeInTheDocument();
    expect(
      screen.getByText(
        "Find your name on the club's list and it becomes yours. No sign-up needed.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Then you can" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Follow sessions live: courts, lineups and who's up next",
      "Look back at past sessions",
      "See your own stats, including matches you've already played",
    ]);
    expect(
      explanation()!.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("stays on the name in the Club, and behind Confirm", async () => {
    renderAt();
    await typeYourName("Jordan");

    await nameInClubField();
    expect(explanation()).toBeInTheDocument();
    await userEvent.type(await nameInClubField(), "Alex{Enter}");
    await confirmSheet("Alex");
    expect(screen.getByText("Look back at past sessions")).toBeInTheDocument();
  });

  it("goes when the page has something else to say", async () => {
    renderAt();
    await typeYourName("Bea");
    await screen.findByText(/is already linked to an Account/);
    expect(explanation()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try another name" }));
    await userEvent.type(await nameInClubField(), "Sammy{Enter}");
    await screen.findByText(/^No one called Sammy/);
    expect(explanation()).not.toBeInTheDocument();
  });

  it("isn't behind Confirm straight from the Account's Name", async () => {
    startDevice(device, await device.createAccount("Alex"));
    renderAt();

    await confirmSheet("Alex");
    expect(screen.queryByText("Look back at past sessions")).not.toBeInTheDocument();
  });

  it("goes when the connection does, and comes back with it", async () => {
    renderAt();
    await screen.findByRole("textbox", { name: "Your name" });

    act(() => device.setOnline(false));
    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    expect(explanation()).not.toBeInTheDocument();

    act(() => device.setOnline(true));
    await screen.findByRole("textbox", { name: "Your name" });
    expect(explanation()).toBeInTheDocument();
  });
});

describe("Join page dead ends", () => {
  const DEAD = "This Join link doesn't work any more. Ask an Organizer for a new one.";

  it("after the link is reset", async () => {
    await roy.resetJoinLink("c1");
    renderAt();

    expect(await screen.findByText(DEAD)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: CLUB })).not.toBeInTheDocument();
  });

  it("for something that isn't a token, without asking the server", async () => {
    const info = vi.spyOn(device, "getJoinLinkInfo");
    renderAt("/join/nope");

    expect(screen.getByText(DEAD)).toBeInTheDocument();
    expect(info).not.toHaveBeenCalled();
  });

  it("without a Backend", () => {
    setBackendForTests(null);
    renderAt();

    expect(screen.getByText(DEAD)).toBeInTheDocument();
  });

  it("offline: asks to connect, and goes on when back online", async () => {
    device.setOnline(false);
    renderAt();

    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    act(() => device.setOnline(true));

    expect(await screen.findByRole("heading", { name: CLUB })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  });
});

describe("Join page losing the connection while the device says it's online", () => {
  it("asks to connect, and Try again opens the link", async () => {
    vi.spyOn(device, "getJoinLinkInfo").mockRejectedValueOnce(new BackendError("offline"));
    renderAt();

    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: CLUB })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your name" })).toBeInTheDocument();
  });

  it("tries again by itself, waiting longer each time", async () => {
    vi.useFakeTimers();
    const info = vi
      .spyOn(device, "getJoinLinkInfo")
      .mockRejectedValueOnce(new BackendError("offline"))
      .mockRejectedValueOnce(new BackendError("offline"));
    renderAt();
    await advance(0);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();

    await advance(2_000);
    expect(info).toHaveBeenCalledTimes(2);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();

    await advance(3_999);
    expect(info).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(info).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("heading", { name: CLUB })).toBeInTheDocument();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
  });

  it("a Claim that lost the connection: Try again brings Confirm back", async () => {
    const account = await device.createAccount("Alex");
    startDevice(device, account);
    vi.spyOn(device, "claimClubPlayer").mockRejectedValueOnce(new BackendError("offline"));
    renderAt();
    await userEvent.click(
      within(await confirmSheet("Alex")).getByRole("button", { name: "Yes, that's me" }),
    );

    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await userEvent.click(
      within(await confirmSheet("Alex")).getByRole("button", { name: "Yes, that's me" }),
    );

    expect(await screen.findByText(`Shared club · You're a Player`)).toBeInTheDocument();
  });
});

describe("Join page in an iOS browser", () => {
  const LINE = "Using BBQueue from your Home Screen? Copy this link and paste it there.";

  it("offers the link to paste into the installed app", async () => {
    Object.defineProperty(navigator, "userAgent", { value: IPHONE_SAFARI, configurable: true });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt();

    expect(await screen.findByText(LINE)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/${token}`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("isn't shown on Android or desktop", async () => {
    Object.defineProperty(navigator, "userAgent", { value: ANDROID_CHROME, configurable: true });
    renderAt();

    expect(await screen.findByRole("heading", { name: CLUB })).toBeInTheDocument();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });
});
