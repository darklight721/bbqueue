import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { STORAGE_KEYS } from "../storage/storage.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

function Boom(): never {
  throw new Error("boom");
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows what's inside when nothing goes wrong", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says something went wrong instead of a blank screen", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong showing this.");
    expect(screen.getByRole("button", { name: "Clear shared data" })).toBeInTheDocument();
  });

  it("clears the cached shared data, and only that, then starts over", async () => {
    const stored = (key: string) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, data: [] }));
    for (const key of [
      STORAGE_KEYS.sharedClubs,
      STORAGE_KEYS.sharedSessions,
      STORAGE_KEYS.sharedEndedSessions,
      STORAGE_KEYS.clubs,
      STORAGE_KEYS.session,
      STORAGE_KEYS.endedSessions,
      STORAGE_KEYS.account,
    ]) {
      stored(key);
    }
    const reload = vi.fn();
    render(
      <ErrorBoundary reload={reload}>
        <Boom />
      </ErrorBoundary>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear shared data" }));

    expect(localStorage.getItem(STORAGE_KEYS.sharedClubs)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.sharedSessions)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.sharedEndedSessions)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.clubs)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.session)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.endedSessions)).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.account)).not.toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
