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
import type { Account, ClubPlayer } from "../../domain/types.ts";
import {
  getClubs,
  resetStoreForTests,
  setAccount,
  setLocalClubs,
  setWelcomeDone,
} from "../../storage/store.ts";

const CAT: ClubPlayer = { id: "p-cat", name: "Cat", skill: "beginner" };

let server = createInMemoryServer();
let roy: InMemoryBackend;
let ana: InMemoryBackend;
let royAccount: Account;
let anaAccount: Account;
let stops: (() => void)[] = [];
let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

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
}

const card = () => screen.getByRole("region", { name: "Join link" });
const shareButton = () => within(card()).getByRole("button", { name: "Share link" });
const tokenOf = (clubId = "c1") => getClubs().find((club) => club.id === clubId)?.joinToken;

beforeEach(async () => {
  server = createInMemoryServer();
  roy = createInMemoryBackend({ server });
  ana = createInMemoryBackend({ server });
  royAccount = await roy.createAccount("Roy Smith");
  anaAccount = await ana.createAccount("Ana Bell");
  await roy.createSharedClub({ id: "c1", name: "Tuesday", players: [CAT] });
  signInAs(roy, royAccount);
  writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  setBackendForTests(null);
  Reflect.deleteProperty(navigator, "clipboard");
  Reflect.deleteProperty(navigator, "share");
});

describe("Join link card", () => {
  it("is on an Organizer's Club page, with Share link and no Reset before there is a link", () => {
    renderAt("/clubs/c1");

    expect(
      within(card()).getByText(
        "Anyone with this link can link their Account to an unlinked player and see the club.",
      ),
    ).toBeInTheDocument();
    expect(shareButton()).toBeEnabled();
    expect(within(card()).queryByRole("button", { name: "Reset link" })).not.toBeInTheDocument();
  });

  it("isn't shown to a Player", async () => {
    await roy.linkClubPlayer("c1", CAT.id, anaAccount.accountId, "player");
    signInAs(ana, anaAccount);
    renderAt("/clubs/c1");

    expect(await screen.findByText("Shared club · You're a Player")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Join link" })).not.toBeInTheDocument();
  });

  it("isn't shown on a Local club", () => {
    setLocalClubs([{ id: "local", name: "Garage", kind: "local", players: [] }]);
    renderAt("/clubs/local");

    expect(screen.getByRole("heading", { name: "Garage" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Join link" })).not.toBeInTheDocument();
  });

  it("isn't on Edit players", async () => {
    renderAt("/clubs/c1/players");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Edit players" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Join link" })).not.toBeInTheDocument();
  });

  it("Share link without a share sheet makes the link, copies it and says Link copied", async () => {
    renderAt("/clubs/c1");

    await userEvent.click(shareButton());

    expect(await within(card()).findByRole("status")).toHaveTextContent("Link copied");
    const token = tokenOf();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/${token}`);
    expect(await within(card()).findByRole("button", { name: "Reset link" })).toBeEnabled();
  });

  it("shows on the card why the link couldn't be made", async () => {
    vi.spyOn(roy, "getJoinLink").mockRejectedValueOnce(new BackendError("forbidden"));
    renderAt("/clubs/c1");

    await userEvent.click(shareButton());

    expect(await within(card()).findByRole("alert")).toHaveTextContent(
      "You can't change this Club. Only Organizers can.",
    );
    expect(writeText).not.toHaveBeenCalled();
  });

  it("Share link opens the share sheet with the link where there is one", async () => {
    const token = await roy.getJoinLink("c1");
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderAt("/clubs/c1");

    await userEvent.click(shareButton());

    expect(share).toHaveBeenCalledWith({ url: `${window.location.origin}/join/${token}` });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies instead when the share sheet is refused", async () => {
    const token = await roy.getJoinLink("c1");
    const share = vi.fn(() => Promise.reject(new DOMException("No tap", "NotAllowedError")));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderAt("/clubs/c1");

    await userEvent.click(shareButton());

    expect(await within(card()).findByRole("status")).toHaveTextContent("Link copied");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/${token}`);
  });

  it("offline, shares a link it has, but can't make one or reset it", async () => {
    renderAt("/clubs/c1");
    act(() => roy.setOnline(false));

    expect(shareButton()).toBeDisabled();
    expect(shareButton()).toHaveAccessibleDescription(
      "You're offline. Making the link needs a connection.",
    );

    act(() => roy.setOnline(true));
    await act(() => roy.getJoinLink("c1"));
    act(() => roy.setOnline(false));

    const reset = await within(card()).findByRole("button", { name: "Reset link" });
    expect(reset).toBeDisabled();
    expect(reset).toHaveAccessibleDescription(
      "You're offline. Resetting the link needs a connection.",
    );
    await userEvent.click(shareButton());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/${tokenOf()}`);
  });

  it("Reset link asks first, then makes a new link and the old one stops working", async () => {
    const old = await roy.getJoinLink("c1");
    renderAt("/clubs/c1");

    await userEvent.click(await within(card()).findByRole("button", { name: "Reset link" }));
    const dialog = screen.getByRole("dialog", { name: "Reset the Join link?" });
    expect(dialog).toHaveAccessibleDescription(
      "The old link stops working. People already linked stay linked.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Reset link" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(tokenOf()).not.toBe(old);
    expect(await ana.getJoinLinkInfo(old)).toBeNull();
    expect(await ana.getJoinLinkInfo(tokenOf()!)).toEqual({ clubId: "c1", clubName: "Tuesday" });
  });

  it("Cancel keeps the link", async () => {
    const old = await roy.getJoinLink("c1");
    renderAt("/clubs/c1");

    await userEvent.click(await within(card()).findByRole("button", { name: "Reset link" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(tokenOf()).toBe(old);
  });
});
