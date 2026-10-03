import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { App } from "../../app/App.tsx";
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

  it("asks for a name before creating an Account", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toHaveAttribute("aria-invalid", "true");
    expect(getWelcomeDone()).toBe(false);
  });

  it("Skip goes Home without an Account and is remembered", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await user.click(screen.getByRole("button", { name: "Skip" }));

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

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't create your Account");
    expect(getWelcomeDone()).toBe(false);
  });

  it("Enter in the name field dismisses the keyboard without creating", async () => {
    setBackendForTests(createInMemoryBackend());
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText("Your name");

    await user.type(input, "Roy{Enter}");

    expect(input).not.toHaveFocus();
    expect(getWelcomeDone()).toBe(false);
  });
});
