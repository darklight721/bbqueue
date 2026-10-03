import { FIREBASE_EMULATOR } from "../backend/firebaseEmulator.ts";

/**
 * Admin access to the Firebase emulators over their REST APIs, for tests: wipe everything, and
 * read or write Firestore documents with Security Rules out of the way. Self-contained (plain
 * `fetch`), so Vitest and the Playwright e2e setup share it.
 */

const { projectId, firestoreHost, firestorePort } = FIREBASE_EMULATOR;
const FIRESTORE = `http://${firestoreHost}:${firestorePort}`;
const DOCUMENTS = `${FIRESTORE}/v1/projects/${projectId}/databases/(default)/documents`;
/** "owner" is the emulator's way of saying "skip Security Rules". */
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };

/** Delete every Firestore document and every Auth user. */
export async function clearEmulator(): Promise<void> {
  await Promise.all([
    fetch(`${FIRESTORE}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
      method: "DELETE",
    }),
    fetch(`${FIREBASE_EMULATOR.authUrl}/emulator/v1/projects/${projectId}/accounts`, {
      method: "DELETE",
    }),
  ]).then((responses) => {
    for (const response of responses) {
      if (!response.ok) throw new Error(`Clearing the emulator failed: ${response.status}`);
    }
  });
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function toValue(value: Json): Record<string, unknown> {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, v]) => [key, toValue(v)])),
    },
  };
}

function fromValue(value: Record<string, unknown>): Json {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue as boolean;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue as number;
  if ("stringValue" in value) return value.stringValue as string;
  if ("timestampValue" in value) return value.timestampValue as string;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return values.map(fromValue);
  }
  const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields;
  return fromFields(fields ?? {});
}

function fromFields(fields: Record<string, Record<string, unknown>>): { [key: string]: Json } {
  return Object.fromEntries(Object.entries(fields).map(([key, v]) => [key, fromValue(v)]));
}

/** Write (replace) the document at `path`, e.g. `accountIds/roy-7k3f`. */
export async function adminSetDoc(path: string, data: { [key: string]: Json }): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([key, v]) => [key, toValue(v)]));
  const response = await fetch(`${DOCUMENTS}/${path}`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`Writing ${path} failed: ${response.status}`);
}

/** The document at `path`, or null. */
export async function adminGetDoc(path: string): Promise<{ [key: string]: Json } | null> {
  const response = await fetch(`${DOCUMENTS}/${path}`, { headers: ADMIN });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Reading ${path} failed: ${response.status}`);
  const body = (await response.json()) as { fields?: Record<string, Record<string, unknown>> };
  return fromFields(body.fields ?? {});
}

/** The documents in the collection at `path` (ids and data). */
export async function adminListDocs(
  path: string,
): Promise<{ id: string; data: { [key: string]: Json } }[]> {
  const response = await fetch(`${DOCUMENTS}/${path}?pageSize=300`, { headers: ADMIN });
  if (!response.ok) throw new Error(`Listing ${path} failed: ${response.status}`);
  const body = (await response.json()) as {
    documents?: { name: string; fields?: Record<string, Record<string, unknown>> }[];
  };
  return (body.documents ?? []).map((document) => ({
    id: document.name.split("/").at(-1)!,
    data: fromFields(document.fields ?? {}),
  }));
}
