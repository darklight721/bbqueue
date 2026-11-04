import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import type { BrowserContext } from "@playwright/test";
import { FIREBASE_EMULATOR } from "../../src/backend/firebaseEmulator.ts";

const { firestoreHost, firestorePort } = FIREBASE_EMULATOR;
const LISTEN_CHANNEL = /\/google\.firestore\.v1\.Firestore\/Listen\/channel/;

/**
 * A real server tells a device's listeners about a write a moment after the write is confirmed; on
 * the emulators they hear of it at once. This puts `context`'s listeners behind a proxy that hands
 * on what the server sends `lagMs` late, leaving reads and writes as they are. Returns how to stop.
 */
export async function lagListeners(context: BrowserContext, lagMs = 800): Promise<() => void> {
  const proxy = createServer((incoming, outgoing) => {
    const upstream = request(
      {
        host: firestoreHost,
        port: firestorePort,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.on("data", (chunk) => setTimeout(() => outgoing.write(chunk), lagMs));
        response.on("end", () => setTimeout(() => outgoing.end(), lagMs));
      },
    );
    upstream.on("error", () => outgoing.destroy());
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve) => proxy.listen(0, firestoreHost, resolve));
  const { port } = proxy.address() as AddressInfo;
  await context.route(LISTEN_CHANNEL, (route) =>
    route.continue({ url: route.request().url().replace(`:${firestorePort}/`, `:${port}/`) }),
  );
  return () => {
    proxy.closeAllConnections();
    proxy.close();
  };
}
