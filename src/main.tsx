import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import "@fontsource/barlow-condensed/latin-700.css";
import "./index.css";
import { App } from "./app/App.tsx";
import { ErrorBoundary } from "./app/ErrorBoundary.tsx";
import { startAccountSync, startActiveSessionSync, startSharedClubSync } from "./backend/index.ts";

startAccountSync();
startSharedClubSync();
startActiveSessionSync();

// Vite's BASE_URL ends with "/"; wouter expects the base without a trailing slash.
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Router base={routerBase}>
        <App />
      </Router>
    </ErrorBoundary>
  </StrictMode>,
);
