/** `/join/<token>`: the Join page of a Join link. */
export function joinPath(token: string): string {
  return `/join/${encodeURIComponent(token)}`;
}

/** The whole Join link, as it is shared: this app's origin and base path, then `join/<token>`. */
export function joinLinkUrl(token: string): string {
  return new URL(
    `${import.meta.env.BASE_URL}join/${encodeURIComponent(token)}`,
    window.location.origin,
  ).href;
}
