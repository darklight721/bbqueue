import { describe, expect, it } from "vite-plus/test";
import { shouldOfferInstallHint } from "./installHint.ts";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("shouldOfferInstallHint", () => {
  it("is offered in iOS Safari when the app isn't installed", () => {
    expect(
      shouldOfferInstallHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: false }),
    ).toBe(true);
  });

  it("counts an iPad (which says it is a Mac) but not a real Mac", () => {
    expect(
      shouldOfferInstallHint({ userAgent: IPAD_SAFARI, maxTouchPoints: 5, standalone: false }),
    ).toBe(true);
    expect(
      shouldOfferInstallHint({ userAgent: IPAD_SAFARI, maxTouchPoints: 0, standalone: false }),
    ).toBe(false);
  });

  it("isn't offered once the app is installed", () => {
    expect(
      shouldOfferInstallHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: true }),
    ).toBe(false);
  });

  it("isn't offered in other browsers", () => {
    for (const userAgent of [IPHONE_CHROME, ANDROID_CHROME]) {
      expect(shouldOfferInstallHint({ userAgent, maxTouchPoints: 5, standalone: false })).toBe(
        false,
      );
    }
  });
});
