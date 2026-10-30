import { useMemo } from "react";

/** What {@link shouldOfferInstallHint} needs to know about the browser. */
export interface BrowserInfo {
  userAgent: string;
  maxTouchPoints: number;
  /** Running from the Home Screen (installed), not in a browser tab. */
  standalone: boolean;
}

/**
 * Which install hint to show. They differ because on iOS the installed app has its own storage,
 * apart from the browser it was added from, while on Android it shares the browser's.
 */
export type InstallHintKind = "ios" | "android";

/**
 * What the install message says, per platform. Shown on the Welcome screen (both) and on Account
 * settings without an Account (iOS).
 *
 * - iOS: install first. On iPhone and iPad the installed app has its own storage, so whatever is
 *   set up in the browser stays behind there.
 * - Android: the installed app shares the browser's data, so nothing stays behind; installing
 *   only gives full screen and less risk of the browser clearing the data. It must not claim
 *   otherwise.
 */
export const INSTALL_MESSAGE: Record<InstallHintKind, { title: string; body: string }> = {
  ios: {
    title: "Add BBQueue to your Home Screen first",
    body: "Then open it from there. What you set up here stays in this browser.",
  },
  android: {
    title: "Add BBQueue to your Home Screen",
    body: "It opens full screen, and the browser is less likely to clear your data.",
  },
};

/**
 * Whether to suggest installing the app (Add to Home Screen), and which way: any iOS browser
 * (all of them can Add to Home Screen since iOS 16.4) or any Android browser, when not already
 * running as the installed app. Never on desktop. iPads say they are a Mac, so a Mac with a
 * touch screen counts as iOS.
 */
export function shouldOfferInstallHint(browser: BrowserInfo): InstallHintKind | null {
  const { userAgent, maxTouchPoints, standalone } = browser;
  if (standalone) return null;
  if (/Android/.test(userAgent)) return "android";
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios ? "ios" : null;
}

/** {@link BrowserInfo} for the browser the app is running in. */
export function currentBrowser(): BrowserInfo {
  if (typeof navigator === "undefined")
    return { userAgent: "", maxTouchPoints: 0, standalone: false };
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches);
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
  };
}

/** {@link shouldOfferInstallHint} for this browser, worked out once per mount. */
export function useInstallHintKind(): InstallHintKind | null {
  return useMemo(() => shouldOfferInstallHint(currentBrowser()), []);
}
