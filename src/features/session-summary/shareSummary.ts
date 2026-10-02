import { domToBlob } from "modern-screenshot";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Phone-width layout the image is always rendered at, so it looks the same on any device. */
const CAPTURE_WIDTH = 400;
const CAPTURE_SCALE = 3;
const ERROR_RESET_MS = 4000;
const SHARE_TITLE = "BBQueue session summary";
const EXCLUDE_ATTRIBUTE = "data-share-exclude";
/** Elements kept hidden on the page and shown only in the image (e.g. the app-link footer). */
const SHARE_ONLY_ATTRIBUTE = "data-share-only";

/** Where people who see a shared image can find the app. */
export const APP_URL = "https://darklight721.github.io/bbqueue/";
/** APP_URL as printed in the image: no protocol, no trailing slash. */
export const APP_URL_LABEL = APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

export type ShareStatus = "idle" | "busy" | "error";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `bbqueue-<slug>-<YYYY-MM-DD>.png`; the date is the local date the Session started. */
export function summaryFileName(sessionName: string, startedAt: number): string {
  const slug = sessionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const d = new Date(startedAt);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `bbqueue-${slug || "session"}-${date}.png`;
}

function opaqueBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "transparent" && !/^rgba?\(.*[,/ ]\s*0(\.0+)?\)$/.test(bg)) return bg;
  }
  return "#ffffff";
}

/**
 * Rasterizes a clone of `target` laid out at phone width (offscreen, so the live page is
 * untouched), with entrance animations disabled and `data-share-exclude` subtrees removed.
 */
async function renderPng(target: HTMLElement): Promise<Blob> {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText = `position:fixed;top:0;left:-100000px;width:${CAPTURE_WIDTH}px;pointer-events:none;`;
  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.width = `${CAPTURE_WIDTH}px`;
  clone.style.maxWidth = "none";
  clone.style.boxSizing = "border-box";
  for (const el of clone.querySelectorAll(`[${EXCLUDE_ATTRIBUTE}]`)) el.remove();
  // Image-only parts are `hidden` on the page; reveal them in the clone (before measuring).
  for (const el of clone.querySelectorAll<HTMLElement>(`[${SHARE_ONLY_ATTRIBUTE}]`)) {
    el.hidden = false;
  }
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>(".animate-rise")]) {
    if (el === clone && !el.classList.contains("animate-rise")) continue;
    el.style.animation = "none";
    el.style.opacity = "1";
    el.style.transform = "none";
  }
  // Drop device safe-area insets (notches) so the image is identical on every device.
  for (const el of clone.querySelectorAll<HTMLElement>(".pt-safe")) el.style.paddingTop = "0px";
  for (const el of clone.querySelectorAll<HTMLElement>(".px-safe")) {
    el.style.paddingLeft = "1rem";
    el.style.paddingRight = "1rem";
  }
  stage.append(clone);
  document.body.append(stage);
  try {
    await document.fonts?.ready;
    const blob = await domToBlob(clone, {
      type: "image/png",
      scale: CAPTURE_SCALE,
      width: CAPTURE_WIDTH,
      height: Math.ceil(clone.getBoundingClientRect().height),
      backgroundColor: opaqueBackground(),
      filter: (node) => !(node instanceof Element && node.hasAttribute(EXCLUDE_ATTRIBUTE)),
    });
    if (!blob) throw new Error("Image rendering produced no data");
    return blob;
  } finally {
    stage.remove();
  }
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.append(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

export function useShareSummary(
  target: RefObject<HTMLElement | null>,
  fileName: string,
): { share: () => Promise<void>; status: ShareStatus } {
  const [status, setStatus] = useState<ShareStatus>("idle");
  const busy = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const share = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(resetTimer.current);
    setStatus("busy");
    try {
      const element = target.current;
      if (!element) throw new Error("Nothing to capture");
      const blob = await renderPng(element);
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: SHARE_TITLE });
      } else {
        download(file);
      }
      setStatus("idle");
    } catch (error) {
      if (isAbort(error)) {
        setStatus("idle");
      } else {
        setStatus("error");
        resetTimer.current = setTimeout(() => setStatus("idle"), ERROR_RESET_MS);
      }
    } finally {
      busy.current = false;
    }
  }, [target, fileName]);

  return { share, status };
}
