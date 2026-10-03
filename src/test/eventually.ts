/**
 * Retry `assertion` until it stops throwing. Real backends report changes to observers a moment
 * after the call resolves; the in-memory and fake ones are instant, so the first try passes.
 */
export async function eventually(
  assertion: () => void | Promise<void>,
  timeoutMs = 8000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}
