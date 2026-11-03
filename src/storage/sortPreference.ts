/** A device-wide UI preference (not part of any Club or Session): the last chosen sort of a list. */

/** The sort saved under `key`, or `fallback` when nothing (valid) is saved. */
export function loadSort<T extends string>(key: string, values: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return values.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSort(key: string, value: string): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the choice just won't be remembered.
  }
}
