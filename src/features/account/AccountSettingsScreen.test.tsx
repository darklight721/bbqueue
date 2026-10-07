import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../../app/App.tsx";
import { BackendError, type Backend } from "../../backend/backend.ts";
import { createInMemoryBackend, type InMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import type { Account } from "../../domain/types.ts";
import {
  getAccount,
  getInstallHintDismissed,
  resetStoreForTests,
  setAccount,
  setWelcomeDone,
} from "../../storage/store.ts";

const ROY: Account = { accountId: "roy-7k3f", name: "Roy Smith" };
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
  setWelcomeDone();
});

afterEach(() => {
  setBackendForTests(null);
  vi.restoreAllMocks();
  for (const key of ["userAgent", "clipboard", "storage"]) Reflect.deleteProperty(navigator, key);
});

/** A Backend that already has `account` (also on the device, as after creating it here). */
function withAccount(account: Account | null = ROY): InMemoryBackend {
  const backend = createInMemoryBackend({ account });
  setBackendForTests(backend);
  if (account) setAccount(account);
  return backend;
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  const user = userEvent.setup();
  const { unmount } = render(
    <Router hook={location.hook}>
      <App />
    </Router>,
  );
  return { user, location, unmount };
}

const card = () => screen.getByRole("region", { name: "Your Account" });
const avatarLink = () => screen.getByRole("link", { name: /^Account settings/ });

describe("Home avatar", () => {
  it("isn't there without a Backend", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Account settings/ })).not.toBeInTheDocument();
  });

  it("shows the Account's initials and opens Account settings", async () => {
    withAccount();
    const { user, location } = renderAt("/");

    expect(avatarLink()).toHaveAccessibleName("Account settings, Roy Smith");
    expect(avatarLink()).toHaveTextContent("RS");

    await user.click(avatarLink());
    expect(location.history?.at(-1)).toBe("/account");
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  });

  it("shows a default icon with no Account", () => {
    withAccount(null);
    renderAt("/");
    expect(avatarLink()).toHaveAccessibleName("Account settings, no Account");
    expect(avatarLink()).toHaveTextContent("");
    expect(avatarLink().querySelector("svg")).not.toBeNull();
  });
});

describe("Account settings", () => {
  it("goes Home without a Backend", () => {
    const { location } = renderAt("/account");
    expect(location.history?.at(-1)).toBe("/");
    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
  });

  it("shows the name and the Account ID; Back goes Home", async () => {
    withAccount();
    const { user, location } = renderAt("/account");

    expect(within(card()).getByText("Roy Smith")).toBeInTheDocument();
    expect(within(card()).getByText("roy-7k3f")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(location.history?.at(-1)).toBe("/");
  });

  it("renames in place: Enter saves to the Backend and the device, and keeps the Account ID", async () => {
    const backend = withAccount();
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const input = screen.getByLabelText("Your name");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("Roy Smith");

    await user.clear(input);
    await user.type(input, "  Ana   Bell {Enter}");

    expect(await within(card()).findByText("Ana Bell")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Name saved");
    expect(getAccount()).toEqual({ accountId: "roy-7k3f", name: "Ana Bell" });
    expect(await backend.getCurrentAccount()).toEqual(getAccount());
    expect(within(card()).getByText("AB")).toBeInTheDocument();
  });

  it("previews the new initials while typing", async () => {
    withAccount();
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    await user.type(screen.getByLabelText("Your name"), " Junior");
    expect(within(card()).getByText("RS")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "zoë");
    expect(within(card()).getByText("Z")).toBeInTheDocument();
  });

  it("Escape and Cancel put the name back without saving", async () => {
    const renameAccount = vi.fn<Backend["renameAccount"]>();
    setBackendForTests({ ...createInMemoryBackend({ account: ROY }), renameAccount });
    setAccount(ROY);
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    await user.type(screen.getByLabelText("Your name"), "xyz{Escape}");
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit name" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    expect(screen.getByLabelText("Your name")).toHaveValue("Roy Smith");
    await user.type(screen.getByLabelText("Your name"), "xyz");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(within(card()).getByText("Roy Smith")).toBeInTheDocument();
    expect(renameAccount).not.toHaveBeenCalled();
    expect(getAccount()).toEqual(ROY);
  });

  it("an unchanged name just closes the field", async () => {
    const renameAccount = vi.fn<Backend["renameAccount"]>();
    setBackendForTests({ ...createInMemoryBackend({ account: ROY }), renameAccount });
    setAccount(ROY);
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(renameAccount).not.toHaveBeenCalled();
  });

  it("asks for a name and keeps the field focused", async () => {
    withAccount();
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    const input = screen.getByLabelText("Your name");
    await user.clear(input);
    await user.type(input, "   {Enter}");

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a name");
    expect(getAccount()).toEqual(ROY);
  });

  it("shows a busy Save, then says so when the connection drops", async () => {
    let fail = () => {};
    setBackendForTests({
      ...createInMemoryBackend({ account: ROY }),
      renameAccount: () =>
        new Promise((_, reject) => {
          fail = () => reject(new BackendError("offline"));
        }),
    });
    setAccount(ROY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = renderAt("/account");

    await user.click(screen.getByRole("button", { name: "Edit name" }));
    await user.type(screen.getByLabelText("Your name"), " Jr{Enter}");

    const busy = screen.getByRole("button", { name: "Saving…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await act(async () => fail());
    expect(screen.getByRole("alert")).toHaveTextContent("You're offline. Connect and try again.");
    const normal = screen.getByRole("button", { name: "Save" });
    expect(normal).not.toHaveAttribute("aria-disabled");
    expect(normal).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByLabelText("Your name")).toHaveValue("Roy Smith Jr");
    expect(getAccount()).toEqual(ROY);
  });

  it("turns Edit off while offline, with the reason", () => {
    const backend = withAccount();
    renderAt("/account");

    act(() => backend.setOnline(false));

    const edit = screen.getByRole("button", { name: "Edit name" });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription("Changing your name needs a connection.");

    act(() => backend.setOnline(true));
    expect(screen.getByRole("button", { name: "Edit name" })).toBeEnabled();
  });

  it("copies the Account ID and confirms it", async () => {
    withAccount();
    const { user } = renderAt("/account");
    // After userEvent.setup(), which installs its own clipboard.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(screen.getByRole("button", { name: "Copy Account ID" }));

    expect(writeText).toHaveBeenCalledWith("roy-7k3f");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Account ID copied");
  });

  it("says how to copy by hand when copying fails", async () => {
    withAccount();
    const { user } = renderAt("/account");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });

    await user.click(screen.getByRole("button", { name: "Copy Account ID" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't copy. Press and hold the ID to copy it.",
    );
  });

  describe("with no Account", () => {
    it("“Add your name” creates an Account and asks the browser to keep the data", async () => {
      const backend = withAccount(null);
      const persist = vi.fn(() => Promise.resolve(true));
      Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
      const { user } = renderAt("/account");

      expect(within(card()).getByText("No Account yet")).toBeInTheDocument();
      await user.type(screen.getByLabelText("Your name"), "Roy Smith");
      await user.click(screen.getByRole("button", { name: "Add your name" }));

      expect(await within(card()).findByText("Roy Smith")).toBeInTheDocument();
      expect(getAccount()).toMatchObject({ name: "Roy Smith" });
      expect(await backend.getCurrentAccount()).toEqual(getAccount());
      expect(within(card()).getByText(getAccount()!.accountId)).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Account created");
      expect(persist).toHaveBeenCalledOnce();
    });

    it("explains an Account needs a connection when offline", () => {
      setBackendForTests(createInMemoryBackend({ online: false }));
      renderAt("/account");

      expect(
        screen.getByText("An Account needs a connection. Connect to add your name."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add your name" })).not.toBeInTheDocument();
    });
  });

  describe("Install the app hint", () => {
    const hint = () => screen.queryByRole("region", { name: "Install the app" });

    it("shows in iOS Safari and can be dismissed for good", async () => {
      Object.defineProperty(navigator, "userAgent", { value: IPHONE_SAFARI, configurable: true });
      withAccount();
      const { user } = renderAt("/account");

      await user.click(within(hint()!).getByRole("button", { name: "Dismiss tip" }));

      expect(hint()).not.toBeInTheDocument();
      expect(getInstallHintDismissed()).toBe(true);
    });

    it("stays away once dismissed", () => {
      Object.defineProperty(navigator, "userAgent", { value: IPHONE_SAFARI, configurable: true });
      localStorage.setItem(
        "bq:v1:install-hint-dismissed",
        JSON.stringify({ version: 1, data: true }),
      );
      withAccount();
      renderAt("/account");
      expect(card()).toBeInTheDocument();
      expect(hint()).not.toBeInTheDocument();
    });

    it("isn't shown in other browsers or without an Account", () => {
      withAccount();
      const { unmount } = renderAt("/account");
      expect(hint()).not.toBeInTheDocument();
      unmount();

      Object.defineProperty(navigator, "userAgent", { value: IPHONE_SAFARI, configurable: true });
      localStorage.clear();
      resetStoreForTests();
      setWelcomeDone();
      withAccount(null);
      renderAt("/account");
      expect(hint()).not.toBeInTheDocument();
    });
  });
});
