import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import "@fontsource/barlow-condensed/latin-700.css";
import "./index.css";
import { App } from "./app/App.tsx";
import { startAccountSync } from "./backend/index.ts";

startAccountSync();

// Vite's BASE_URL ends with "/"; wouter expects the base without a trailing slash.
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router base={routerBase}>
      <App />
    </Router>
  </StrictMode>,
);
