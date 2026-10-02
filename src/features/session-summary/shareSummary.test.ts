import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const domToBlob = vi.hoisted(() => vi.fn());
vi.mock("modern-screenshot", () => ({ domToBlob }));

import { summaryFileName, useShareSummary } from "./shareSummary.ts";

const FILE_NAME = "bbqueue-friday-2026-10-02.png";

function setup() {
  const el = document.createElement("div");
  el.innerHTML = `<p>hi</p><button data-share-exclude>x</button>`;
  document.body.append(el);
  return renderHook(() => useShareSummary({ current: el }, FILE_NAME));
}

function setNavigator(props: { canShare?: unknown; share?: unknown }) {
  Object.defineProperty(navigator, "canShare", { value: props.canShare, configurable: true });
  Object.defineProperty(navigator, "share", { value: props.share, configurable: true });
}

describe("summaryFileName", () => {
  const started = new Date(2026, 9, 2, 18, 30).getTime();

  it("slugifies the name and uses the local start date", () => {
    expect(summaryFileName("Friday Night  Smash!", started)).toBe(
      "bbqueue-friday-night-smash-2026-10-02.png",
    );
  });

  it("trims separators and falls back to 'session'", () => {
    expect(summaryFileName("  --Club #1--  ", started)).toBe("bbqueue-club-1-2026-10-02.png");
    expect(summaryFileName("***", started)).toBe("bbqueue-session-2026-10-02.png");
    expect(summaryFileName("", started)).toBe("bbqueue-session-2026-10-02.png");
  });
});

describe("useShareSummary", () => {
  let click: () => void;
  let createObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    domToBlob.mockReset();
    domToBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    createObjectURL = vi.fn(() => "blob:fake");
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    click = vi.fn<() => void>();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setNavigator({});
    document.body.innerHTML = "";
  });

  it("shares one PNG file through the native share sheet when supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator({ canShare: vi.fn(() => true), share });
    const { result } = setup();

    await act(() => result.current.share());

    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0]![0] as { files: File[] };
    expect(arg.files).toHaveLength(1);
    expect(arg.files[0]!.name).toBe(FILE_NAME);
    expect(arg.files[0]!.type).toBe("image/png");
    expect(click).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    const options = domToBlob.mock.calls[0]![1];
    expect(options).toMatchObject({ scale: 3, width: 400, type: "image/png" });
  });

  it.each([
    ["canShare is absent", {}],
    ["canShare returns false", { canShare: vi.fn(() => false), share: vi.fn() }],
  ])("downloads the PNG when %s", async (_label, nav) => {
    setNavigator(nav);
    const { result } = setup();

    await act(() => result.current.share());

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("stays silent when the share sheet is cancelled", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    setNavigator({ canShare: () => true, share: vi.fn().mockRejectedValue(abort) });
    const { result } = setup();

    await act(() => result.current.share());

    expect(result.current.status).toBe("idle");
  });

  it("reports an error for other failures, then resets", async () => {
    vi.useFakeTimers();
    try {
      domToBlob.mockRejectedValue(new Error("boom"));
      setNavigator({});
      const { result } = setup();

      await act(() => result.current.share());
      expect(result.current.status).toBe("error");

      act(() => {
        vi.advanceTimersByTime(4100);
      });
      expect(result.current.status).toBe("idle");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores re-entrant calls while busy", async () => {
    let release!: (b: Blob) => void;
    domToBlob.mockReturnValue(new Promise<Blob>((r) => (release = r)));
    setNavigator({});
    const { result } = setup();

    let first!: Promise<void>;
    act(() => {
      first = result.current.share();
    });
    expect(result.current.status).toBe("busy");
    await act(() => result.current.share());
    expect(domToBlob).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(new Blob(["png"]));
      await first;
    });
    expect(result.current.status).toBe("idle");
  });
});
