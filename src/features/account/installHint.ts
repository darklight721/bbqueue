/** What {@link shouldOfferInstallHint} needs to know about the browser. */
export interface BrowserInfo {
  userAgent: string;
  maxTouchPoints: number;
  /** Running from the Home Screen (installed), not in a browser tab. */
  standalone: boolean;
}

/** Browsers on iOS other than Safari say who they are in the user agent. */
const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|YaBrowser|DuckDuckGo/;

/**
 * Whether to suggest installing the app (Add to Home Screen): iOS Safari or any Android browser,
 * not installed. Browsers may clear the data of sites that haven't been used for a while (and the
 * Account with it); installed web apps keep it. iPads say they are a Mac, so a Mac with a touch
 * screen counts as iOS.
 */
export function shouldOfferInstallHint(browser: BrowserInfo): boolean {
  const { userAgent, maxTouchPoints, standalone } = browser;
  if (standalone) return false;
  if (/Android/.test(userAgent)) return true;
  const ios =
    /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const safari = /Safari\//.test(userAgent) && !OTHER_IOS_BROWSERS.test(userAgent);
  return ios && safari;
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
