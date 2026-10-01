import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { SectionJumpBar, type JumpTarget } from "./SectionJumpBar.tsx";

const TARGETS: readonly JumpTarget[] = [
  { id: "courts", label: "Courts" },
  { id: "queues", label: "Queues" },
  { id: "players", label: "Players" },
  { id: "history", label: "History" },
];

/** Fake the window's scroll geometry (jsdom has no layout). */
function setScroll({ scrollY, innerHeight, scrollHeight }: Record<string, number>) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
}

const current = () =>
  screen.getAllByRole("button").find((button) => button.getAttribute("aria-current") === "true")
    ?.textContent;

describe("SectionJumpBar", () => {
  afterEach(() => {
    setScroll({ scrollY: 0, innerHeight: 768, scrollHeight: 768 });
  });

  it("starts on the first section", () => {
    render(<SectionJumpBar targets={TARGETS} />);
    expect(current()).toBe("Courts");
  });

  it("marks the last section current once the page is scrolled to the bottom", () => {
    render(<SectionJumpBar targets={TARGETS} />);

    setScroll({ scrollY: 1000, innerHeight: 800, scrollHeight: 3000 });
    act(() => {
      fireEvent.scroll(window);
    });
    expect(current()).toBe("Courts");

    setScroll({ scrollY: 2200, innerHeight: 800, scrollHeight: 3000 });
    act(() => {
      fireEvent.scroll(window);
    });
    expect(current()).toBe("History");
  });

  it("doesn't jump to the last section when the page doesn't scroll at all", () => {
    render(<SectionJumpBar targets={TARGETS} />);
    setScroll({ scrollY: 0, innerHeight: 800, scrollHeight: 800 });
    act(() => {
      fireEvent.scroll(window);
    });
    expect(current()).toBe("Courts");
  });

  it("marks a tapped section current straight away", () => {
    render(<SectionJumpBar targets={TARGETS} />);
    fireEvent.click(screen.getByRole("button", { name: "Players" }));
    expect(current()).toBe("Players");
  });

  it("lets the section open before scrolling to it", () => {
    const calls: string[] = [];
    const section = document.createElement("div");
    section.id = "history";
    section.scrollIntoView = () => calls.push("scroll");
    document.body.append(section);
    try {
      render(<SectionJumpBar targets={TARGETS} onJump={(id) => calls.push(`open ${id}`)} />);
      fireEvent.click(screen.getByRole("button", { name: "History" }));
      expect(calls).toEqual(["open history", "scroll"]);
    } finally {
      section.remove();
    }
  });
});
