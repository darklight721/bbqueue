import { lazy, Suspense, useLayoutEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { ClubEditScreen } from "../features/club-edit/ClubEditScreen.tsx";
import { ClubsScreen } from "../features/clubs/ClubsScreen.tsx";
import { HomeScreen } from "../features/home/HomeScreen.tsx";
import { NewSessionScreen } from "../features/new-session/NewSessionScreen.tsx";
import { SessionScreen } from "../features/session/SessionScreen.tsx";
import { SessionSummaryScreen } from "../features/session-summary/SessionSummaryScreen.tsx";

// Loaded lazily and only where service workers exist, so the PWA virtual module
// never runs in jsdom tests or unsupported browsers.
const UpdatePrompt = lazy(() =>
  import("../components/UpdatePrompt.tsx").then((module) => ({ default: module.UpdatePrompt })),
);

const supportsServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;

/**
 * Start each screen at the top. wouter changes the URL without touching scroll, so the
 * window would otherwise keep the previous screen's scroll position. The first render
 * is skipped so a page reload keeps the browser's own scroll restoration.
 */
function useScrollToTopOnNavigate() {
  const [location] = useLocation();
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [location]);
}

export function App() {
  useScrollToTopOnNavigate();
  return (
    <>
      <Switch>
        <Route path="/" component={HomeScreen} />
        <Route path="/clubs" component={ClubsScreen} />
        <Route path="/clubs/new">
          <ClubEditScreen />
        </Route>
        <Route path="/clubs/:clubId">{(params) => <ClubEditScreen clubId={params.clubId} />}</Route>
        <Route path="/session/new" component={NewSessionScreen} />
        <Route path="/session" component={SessionScreen} />
        <Route path="/session/summary" component={SessionSummaryScreen} />
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
