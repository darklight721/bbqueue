import { describe, expect, it } from "vite-plus/test";
import { shouldOfferInstallHint } from "./installHint.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const IPHONE_FIREFOX =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15";
const IPHONE_EDGE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAC_SAFARI = IPAD_SAFARI;

describe("shouldOfferInstallHint", () => {
  it("offers the iOS hint in every iOS browser when the app isn't installed", () => {
    for (const userAgent of [IPHONE_SAFARI, IPHONE_CHROME, IPHONE_FIREFOX, IPHONE_EDGE]) {
      expect(shouldOfferInstallHint({ userAgent, maxTouchPoints: 5, standalone: false })).toBe(
        "ios",
      );
    }
  });

  it("counts an iPad (which says it is a Mac) but not a real Mac", () => {
    expect(
      shouldOfferInstallHint({ userAgent: IPAD_SAFARI, maxTouchPoints: 5, standalone: false }),
    ).toBe("ios");
    expect(
      shouldOfferInstallHint({ userAgent: MAC_SAFARI, maxTouchPoints: 0, standalone: false }),
    ).toBeNull();
  });

  it("offers the Android hint in Android browsers when the app isn't installed", () => {
    for (const userAgent of [ANDROID_CHROME, ANDROID_FIREFOX]) {
      expect(shouldOfferInstallHint({ userAgent, maxTouchPoints: 5, standalone: false })).toBe(
        "android",
      );
    }
  });

  it("isn't offered once the app is installed", () => {
    for (const userAgent of [IPHONE_SAFARI, IPHONE_CHROME, IPAD_SAFARI, ANDROID_CHROME]) {
      expect(shouldOfferInstallHint({ userAgent, maxTouchPoints: 5, standalone: true })).toBeNull();
    }
  });

  it("isn't offered on desktop", () => {
    expect(
      shouldOfferInstallHint({ userAgent: DESKTOP_CHROME, maxTouchPoints: 0, standalone: false }),
    ).toBeNull();
    // A Windows laptop with a touch screen is still not iOS.
    expect(
      shouldOfferInstallHint({ userAgent: DESKTOP_CHROME, maxTouchPoints: 10, standalone: false }),
    ).toBeNull();
  });
});
