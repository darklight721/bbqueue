import type { KeyboardEvent } from "react";

/**
 * Enter (iOS Return / Done / Search) blurs the field, which dismisses the on-screen keyboard.
 * Needed for inputs outside a `<form>`: there iOS Return does nothing at all.
 */
export function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.blur();
}
