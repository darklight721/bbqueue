import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { App } from "../../app/App.tsx";
import { BackendError } from "../../backend/backend.ts";
import { createInMemoryBackend } from "../../backend/inMemoryBackend.ts";
import { setBackendForTests } from "../../backend/index.ts";
import {
  getAccount,
  getInstallHintDismissed,
  getWelcomeDone,
  resetStoreForTests,
} from "../../storage/store.ts";

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
    expect(input).toHaveAccessibleDescription(/^Enter a name We'll use it to create your Account/);
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
      "We'll use it to create your Account. Your Club can then add you by your Account ID, and you'll see Sessions live.",
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

describe("Welcome screen install hint", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const IPHONE_FIREFOX =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

  const installFirst = () =>
    screen.queryByRole("region", { name: "Add BBQueue to your Home Screen first" });
  const anyway = () => screen.queryByRole("button", { name: "Continue in the browser anyway" });
  const sheet = () => screen.queryByRole("dialog", { name: "Continue in the browser" });
  const androidSteps = () =>
    screen.queryByRole("region", { name: "Add BBQueue to your Home Screen" });

  function useBrowser(userAgent: string) {
    Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "userAgent");
  });

  it("on iOS, installing comes first; the form is behind Continue in the browser anyway", async () => {
    useBrowser(IPHONE_SAFARI);
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    expect(installFirst()).toHaveTextContent(
      "Then open it from there. What you set up here stays in this browser.",
    );
    const steps = within(installFirst()!).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Open the browser's Share menu (it may be under ⋯)");
    expect(steps[1]).toHaveTextContent("Choose Add to Home Screen");
    expect(steps[2]).toHaveTextContent("Open BBQueue from your Home Screen");
    // Not dismissible: it goes away with the Welcome screen.
    expect(within(installFirst()!).queryByRole("button")).not.toBeInTheDocument();
    expect(androidSteps()).not.toBeInTheDocument();
    // No form until asked for.
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
    expect(sheet()).not.toBeInTheDocument();

    await user.click(anyway()!);

    expect(sheet()).toHaveAccessibleDescription(
      "What you set up here stays in this browser. The app on your Home Screen won't have it.",
    );
    // The title has focus, not the field, so the iOS keyboard doesn't cover the sheet.
    expect(
      within(sheet()!).getByRole("heading", { name: "Continue in the browser" }),
    ).toHaveFocus();
    await user.type(within(sheet()!).getByLabelText("Your name"), "Roy{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Roy" });
  });

  it("on iOS, Skip in the sheet still goes Home, and doesn't dismiss the tip on Account settings", async () => {
    useBrowser(IPHONE_FIREFOX);
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    await user.click(anyway()!);
    await user.click(within(sheet()!).getByRole("button", { name: "Skip for now" }));

    expect(screen.getByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getWelcomeDone()).toBe(true);
    expect(getInstallHintDismissed()).toBe(false);
  });

  it("on iOS, closing the sheet goes back to the install steps", async () => {
    useBrowser(IPHONE_SAFARI);
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    await user.click(anyway()!);
    await user.click(within(sheet()!).getByRole("button", { name: "Close" }));

    expect(sheet()).not.toBeInTheDocument();
    expect(installFirst()).toBeInTheDocument();
    expect(anyway()).toHaveFocus();
    expect(getWelcomeDone()).toBe(false);
    expect(getAccount()).toBeNull();
  });

  it("on iOS offline, the same button leads to continuing without an Account", async () => {
    useBrowser(IPHONE_SAFARI);
    setBackendForTests(createInMemoryBackend({ online: false }));
    const user = userEvent.setup();
    render(<App />);

    expect(installFirst()).toBeInTheDocument();
    await user.click(anyway()!);
    expect(within(sheet()!).getByRole("status")).toHaveTextContent("An Account needs a connection");
    await user.click(within(sheet()!).getByRole("button", { name: "Continue without an Account" }));
    expect(getWelcomeDone()).toBe(true);
  });

  it("on Android, the same layout with Android's own steps, and no claim that data stays behind", async () => {
    useBrowser(ANDROID_CHROME);
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    expect(androidSteps()).toHaveTextContent(
      "It opens full screen, and the browser is less likely to clear your data.",
    );
    expect(androidSteps()).not.toHaveTextContent("stays in this browser");
    const steps = within(androidSteps()!).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Open the browser's ⋮ menu");
    expect(steps[1]).toHaveTextContent("Choose Install app or Add to Home Screen");
    expect(steps[2]).toHaveTextContent("Open BBQueue from your Home Screen");
    expect(within(androidSteps()!).queryByRole("button")).not.toBeInTheDocument();
    expect(installFirst()).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();

    await user.click(anyway()!);
    expect(sheet()).toHaveAccessibleDescription(
      "You can still install the app later, from the browser's ⋮ menu.",
    );
    expect(sheet()).not.toHaveTextContent("stays in this browser");
    await user.type(within(sheet()!).getByLabelText("Your name"), "Roy");
    await user.click(within(sheet()!).getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { level: 1, name: "BBQueue" })).toBeInTheDocument();
    expect(getAccount()).toMatchObject({ name: "Roy" });
  });

  it("on Android offline, the same button leads to continuing without an Account", async () => {
    useBrowser(ANDROID_CHROME);
    setBackendForTests(createInMemoryBackend({ online: false }));
    const user = userEvent.setup();
    render(<App />);

    expect(androidSteps()).toBeInTheDocument();
    await user.click(anyway()!);
    await user.click(within(sheet()!).getByRole("button", { name: "Continue without an Account" }));
    expect(getWelcomeDone()).toBe(true);
  });

  it("isn't shown on desktop", () => {
    setBackendForTests(createInMemoryBackend());
    render(<App />);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(installFirst()).not.toBeInTheDocument();
    expect(anyway()).not.toBeInTheDocument();
    expect(androidSteps()).not.toBeInTheDocument();
  });

  it("isn't shown when running as the installed app", () => {
    useBrowser(IPHONE_SAFARI);
    Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    try {
      setBackendForTests(createInMemoryBackend());
      render(<App />);
      expect(screen.getByLabelText("Your name")).toBeInTheDocument();
      expect(installFirst()).not.toBeInTheDocument();
      expect(anyway()).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(navigator, "standalone");
    }
  });
});
