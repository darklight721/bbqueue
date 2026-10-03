/**
 * Asks the browser to keep this site's data instead of clearing it when space runs low or the
 * site hasn't been used for a while (`navigator.storage.persist()`). Best effort: browsers may
 * say no or not support it at all, and that's fine. Resolves with whether storage is persisted.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || typeof navigator.storage?.persist !== "function") {
      return false;
    }
    return await navigator.storage.persist();
  } catch (error) {
    console.warn("Couldn't ask to keep the app's data", error);
    return false;
  }
}
