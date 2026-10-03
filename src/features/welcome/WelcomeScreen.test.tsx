import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import { createInMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import { getAccount, getWelcomeDone, resetStoreForTests } from "../../storage/store.ts";

beforeEach(() => {
  localStorage.clear();
  resetStoreForTests();
});

afterEach(() => {
  setBackendForTests(null);
});

describe("Welcome screen", () => {
  it("is not shown without a Backend", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /welcome/i })).not.toBeInTheDocument();
  });

  it("creates an Account from the name and then shows Home", async () => {
    const backend = createInMemoryBackend();
    setBackendForTests(backend);
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Your name"), "Roy Smith");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Roy Smith" });
    expect(getAccount()?.accountId).toMatch(/^roy-/);
    expect(await backend.getCurrentAccount()).toEqual(getAccount());
    expect(getWelcomeDone()).toBe(true);
  });

  it("asks the browser to keep the app's data once the Account exists", async () => {
    setBackendForTests(createInMemoryBackend());
    const persist = vi.fn(() => Promise.resolve(true));
    Object.defineProperty(navigator, "storage", { value: { persist }, configurable: true });
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.type(screen.getByLabelText("Your name"), "Roy");
      expect(persist).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Continue" }));

      await screen.findByRole("heading", { level: 1, name: "BBQueue" });
      expect(persist).toHaveBeenCalledOnce();
    } finally {
      Reflect.deleteProperty(navigator, "storage");
    }
  });

  it("asks for a name before creating an Account", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    const input = screen.getByLabelText("Your name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/^Enter a name Creates your Account/);
    expect(input).toHaveFocus();
    expect(getWelcomeDone()).toBe(false);
  });

  it("Skip goes Home without an Account and is remembered", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toBeNull();
    expect(getWelcomeDone()).toBe(true);

    unmount();
    resetStoreForTests();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
  });

  it("offline: explains an Account needs a connection and continues without one", async () => {
    const backend = createInMemoryBackend({ online: false });
    setBackendForTests(backend);
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("status")).toHaveTextContent("An Account needs a connection");
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue without an Account" }));

    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toBeNull();
    expect(getWelcomeDone()).toBe(true);
  });

  it("switches to the name form when the connection comes back", () => {
    const backend = createInMemoryBackend({ online: false });
    setBackendForTests(backend);
    render(<App />);

    act(() => backend.setOnline(true));

    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  });

  it("shows an error and stays on the screen when creating fails", async () => {
    const backend = createInMemoryBackend();
    setBackendForTests({
      ...backend,
      createAccount: () => Promise.reject(new Error("boom")),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Your name"), "Roy");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Couldn't create your Account. Try again.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(getWelcomeDone()).toBe(false);

    // Typing again clears the message.
    await user.type(screen.getByLabelText("Your name"), "!");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("says so when the connection drops while creating", async () => {
    setBackendForTests({
      ...createInMemoryBackend(),
      createAccount: () => Promise.reject(new BackendError("offline")),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Your name"), "Roy");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("You're offline. Connect and try again, or skip for now."),
    ).toHaveAttribute("role", "alert");
  });

  it("shows a busy Continue while creating, and Skip can't be used meanwhile", async () => {
    const backend = createInMemoryBackend();
    let finish = () => {};
    setBackendForTests({
      ...backend,
      createAccount: (name) =>
        new Promise((resolve) => {
          finish = () => void backend.createAccount(name).then(resolve);
        }),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Your name"), "Roy");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const busy = screen.getByRole("button", { name: "Creating your Account…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeDisabled();
    expect(screen.getByLabelText("Your name")).toHaveAttribute("readonly");

    await act(async () => finish());
    expect(await screen.findByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Roy" });
  });

  it("explains the name and the Skip", () => {
    setBackendForTests(createInMemoryBackend());
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to BBQueue" })).toBeVisible();
    expect(screen.getByLabelText("Your name")).toHaveAccessibleDescription(
      "Creates your Account, so your Club can add you by your Account ID and you'll see Sessions live.",
    );
    expect(screen.getByRole("button", { name: "Skip for now" })).toHaveAccessibleDescription(
      "No Account needed. You can add your name later.",
    );
  });

  it("Enter in the name field submits: dismisses the keyboard and creates the Account", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText("Your name");

    await user.type(input, "Roy{Enter}");

    expect(input).not.toHaveFocus();
    expect(await screen.findByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Roy" });
    expect(getWelcomeDone()).toBe(true);
  });

  it("Enter with no name keeps the field focused and asks for one", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText("Your name");

    await user.type(input, "  {Enter}");

    expect(input).toHaveFocus();
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(getWelcomeDone()).toBe(false);
  });
});
