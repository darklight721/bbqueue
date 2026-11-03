import { normalizeName } from "./validation.ts";

/**
 * Join links (GLOSSARY: Join link, Claim; ADR-0010). A Join link is `/join/<token>`: the token is
 * the secret, 128 random bits written as 22 base64url characters.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** A new Join link token: 128 bits from `randomBytes` (the browser's CSPRNG by default). */
export function newJoinToken(
  randomBytes: (length: number) => Uint8Array = (length) =>
    crypto.getRandomValues(new Uint8Array(length)),
): string {
  const bytes = randomBytes(16);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Whether `text` has the shape of a Join link token. */
export function isJoinToken(text: string): boolean {
  return TOKEN_PATTERN.test(text);
}

/**
 * The token in what someone pasted: a whole Join link (any origin and base path, with or without
 * `https://`) or just its token. Null for anything else.
 */
export function parseJoinLink(text: string): string | null {
  const trimmed = text.trim();
  if (isJoinToken(trimmed)) return trimmed;
  for (const candidate of [trimmed, `https://${trimmed}`]) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    const match = /(?:^|\/)join\/([^/]+)\/?$/.exec(url.pathname);
    if (match && isJoinToken(match[1]!)) return match[1]!;
  }
  return null;
}

/**
 * What a name is matched by: `namesEqual` (case and extra spaces don't count), with the same
 * letter always written the same way (NFC) and a lower case that doesn't depend on the device's
 * language. Nothing fuzzy: "Jo" isn't "Joanne" and "Zoë" isn't "Zoe".
 */
export function joinNameKey(name: string): string {
  return normalizeName(name).normalize("NFC").toLowerCase();
}

/**
 * The id of a name's entry in a Join record's name index: the hex SHA-256 of
 * `token + ":" + joinNameKey(name)`. Salted by the token, so the same name has a different id in
 * every Club and on every reset.
 */
export async function joinNameHash(token: string, name: string): Promise<string> {
  const data = new TextEncoder().encode(`${token}:${joinNameKey(name)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
