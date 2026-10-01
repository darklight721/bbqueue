import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const updateServiceWorker = vi.fn(() => Promise.resolve());
const setNeedRefresh = vi.fn();
let needRefresh = false;

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

const { UpdatePrompt } = await import("./UpdatePrompt.tsx");

describe("UpdatePrompt", () => {
  beforeEach(() => {
    updateServiceWorker.mockClear();
    setNeedRefresh.mockClear();
  });

  it("stays hidden until a new version is waiting", () => {
    needRefresh = false;
    render(<UpdatePrompt />);
    expect(screen.queryByText("New version available")).not.toBeInTheDocument();
  });

  it("reloads only when asked", async () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    expect(screen.getByText("New version available")).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("can be dismissed with Later", async () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
  });
});
