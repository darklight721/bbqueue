import { describe, expect, it } from "vite-plus/test";
import { afterClaimError, firstStep, stepAfterLookup, stepAfterNameGone } from "./joinFlow.ts";

describe("firstStep", () => {
  it("opens the Club page when the Club is on this device already", () => {
    expect(firstStep({ accountName: "Alex", onClub: true })).toEqual({ type: "to-club" });
  });

  it("looks the Account's Name up", () => {
    expect(firstStep({ accountName: "Alex", onClub: false })).toEqual({
      type: "look-up",
      name: "Alex",
    });
  });

  it("asks for a name without an Account", () => {
    expect(firstStep({ accountName: null, onClub: false })).toEqual({
      type: "step",
      step: { type: "your-name" },
    });
  });
});

describe("stepAfterLookup", () => {
  it("asks to confirm an unlinked match, wherever the name came from", () => {
    for (const from of ["account", "your-name", "name-in-club"] as const) {
      expect(stepAfterLookup(from, "Alex", { linked: false })).toEqual({
        type: "confirm",
        name: "Alex",
        from,
      });
    }
  });

  it("says a linked match is taken", () => {
    expect(stepAfterLookup("account", "Alex", { linked: true })).toEqual({
      type: "already-linked",
      name: "Alex",
    });
    expect(stepAfterLookup("name-in-club", "Alex", { linked: true })).toEqual({
      type: "already-linked",
      name: "Alex",
    });
  });

  it("asks for the name in the Club when the Account's Name or Your name doesn't match", () => {
    expect(stepAfterLookup("account", "Alex", null)).toEqual({ type: "name-in-club" });
    expect(stepAfterLookup("your-name", "Alex", null)).toEqual({ type: "name-in-club" });
  });

  it("ends at Ask an Organizer when the name in the Club doesn't match", () => {
    expect(stepAfterLookup("name-in-club", "Sammy", null)).toEqual({
      type: "no-match",
      name: "Sammy",
    });
  });
});

describe("afterClaimError", () => {
  it("says someone else was quicker", () => {
    expect(afterClaimError("already-claimed", "Alex")).toEqual({
      type: "step",
      step: { type: "just-claimed", name: "Alex" },
    });
  });

  it("opens the Club page when this Account is on the Club already", () => {
    expect(afterClaimError("already-linked", "Alex")).toEqual({ type: "to-club" });
  });

  it("checks the link when the name or the link is gone", () => {
    expect(afterClaimError("not-found", "Alex")).toEqual({ type: "check-link" });
  });

  it("stays on Confirm to try again otherwise", () => {
    expect(afterClaimError("offline", "Alex")).toEqual({ type: "retry", offline: true });
    expect(afterClaimError("failed", "Alex")).toEqual({ type: "retry", offline: false });
  });
});

describe("stepAfterNameGone", () => {
  it("is a dead end when the link stopped working", () => {
    expect(stepAfterNameGone(false, "Alex")).toEqual({ type: "dead" });
  });

  it("ends at Ask an Organizer when the link works but the name is gone", () => {
    expect(stepAfterNameGone(true, "Alex")).toEqual({ type: "no-match", name: "Alex" });
  });
});
