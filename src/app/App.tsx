import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import { ClubsScreen } from "../features/clubs/ClubsScreen.tsx";
import { HomeScreen } from "../features/home/HomeScreen.tsx";
import { PlaceholderScreen } from "./PlaceholderScreen.tsx";

// Loaded lazily and only where service workers exist, so the PWA virtual module
// never runs in jsdom tests or unsupported browsers.
const UpdatePrompt = lazy(() =>
  import("../components/UpdatePrompt.tsx").then((module) => ({ default: module.UpdatePrompt })),
);

const supportsServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;

export function App() {
  return (
    <>
      <Switch>
        <Route path="/" component={HomeScreen} />
        <Route path="/clubs" component={ClubsScreen} />
        <Route path="/clubs/new">
          <PlaceholderScreen title="New club" backTo="/clubs" />
        </Route>
        <Route path="/clubs/:clubId">
          <PlaceholderScreen title="Edit club" backTo="/clubs" />
        </Route>
        <Route path="/session/new">
          <PlaceholderScreen title="New session" backTo="/" />
        </Route>
        <Route path="/session">
          <PlaceholderScreen title="Session" backTo="/" />
        </Route>
        <Route path="/session/summary">
          <PlaceholderScreen title="Session summary" backTo="/" />
        </Route>
        <Route>
          <Redirect to="/" replace />
        </Route>
      </Switch>
      {supportsServiceWorker ? (
        <Suspense fallback={null}>
          <UpdatePrompt />
        </Suspense>
      ) : null}
    </>
  );
}
