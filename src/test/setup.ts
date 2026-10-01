import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement scrolling; the app resets scroll on every navigation.
window.scrollTo = () => {};
