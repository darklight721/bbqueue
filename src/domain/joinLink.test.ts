import { describe, expect, it } from "vite-plus/test";
import { isJoinToken, joinNameHash, joinNameKey, newJoinToken, parseJoinLink } from "./joinLink.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQr_-12";

describe("newJoinToken", () => {
  it("is 128 random bits as 22 base64url characters", () => {
    const bytes = new Uint8Array(16).fill(255);
    expect(newJoinToken(() => bytes)).toBe("_____________________w");
    expect(newJoinToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newJoinToken()).not.toBe(newJoinToken());
  });
});

describe("isJoinToken", () => {
  it("accepts 22 base64url characters only", () => {
    expect(isJoinToken(TOKEN)).toBe(true);
    expect(isJoinToken(TOKEN.slice(1))).toBe(false);
    expect(isJoinToken(`${TOKEN}x`)).toBe(false);
    expect(isJoinToken("AbCdEfGhIjKlMnOpQr+/12")).toBe(false);
  });
});

describe("parseJoinLink", () => {
  it("takes the token from a Join link on any origin and base path", () => {
    expect(parseJoinLink(`https://darklight721.github.io/bbqueue/join/${TOKEN}`)).toBe(TOKEN);
    expect(parseJoinLink(`http://localhost:4173/join/${TOKEN}`)).toBe(TOKEN);
    expect(parseJoinLink(`  https://example.com/join/${TOKEN}/ \n`)).toBe(TOKEN);
    expect(parseJoinLink(`https://example.com/join/${TOKEN}?utm=chat#top`)).toBe(TOKEN);
  });

  it("takes a link pasted without its https://", () => {
    expect(parseJoinLink(`darklight721.github.io/bbqueue/join/${TOKEN}`)).toBe(TOKEN);
  });

  it("takes the token on its own", () => {
    expect(parseJoinLink(` ${TOKEN} `)).toBe(TOKEN);
  });

  it("refuses anything else", () => {
    expect(parseJoinLink("")).toBeNull();
    expect(parseJoinLink("hello")).toBeNull();
    expect(parseJoinLink(`https://example.com/clubs/${TOKEN}`)).toBeNull();
    expect(parseJoinLink(`https://example.com/join/${TOKEN}/more`)).toBeNull();
    expect(parseJoinLink("https://example.com/join/short")).toBeNull();
    expect(parseJoinLink(`https://example.com/rejoin/${TOKEN}`)).toBeNull();
  });
});

describe("joinNameKey", () => {
  it("is the same for names that are equal ignoring case and extra spaces", () => {
    expect(joinNameKey("  Alex   Smith ")).toBe(joinNameKey("alex smith"));
    expect(joinNameKey("ZOË")).toBe(joinNameKey("zoë"));
    // Composed and decomposed forms of the same letter.
    expect(joinNameKey("Zoë")).toBe(joinNameKey("Zoë"));
  });

  it("differs for different names: nothing fuzzy", () => {
    expect(joinNameKey("Jo")).not.toBe(joinNameKey("Joanne"));
    expect(joinNameKey("Zoë")).not.toBe(joinNameKey("Zoe"));
  });
});

describe("joinNameHash", () => {
  it("is the hex SHA-256 of the token and the name's key", async () => {
    // printf 'AbCdEfGhIjKlMnOpQr_-12:alex' | shasum -a 256
    expect(await joinNameHash(TOKEN, "  ALEX ")).toBe(
      "8e94e9cb4bf4e59c5961956b61d84f1fe77b7e9516a55bf94f7f0bc30eef9214",
    );
  });

  it("differs per token", async () => {
    expect(await joinNameHash(TOKEN, "Alex")).not.toBe(
      await joinNameHash("ZZCdEfGhIjKlMnOpQr_-12", "Alex"),
    );
  });
});
