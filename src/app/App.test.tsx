import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { App } from "./App.tsx";

describe("App", () => {
  it("renders the home heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "Badminton Queue" })).toBeInTheDocument();
  });
});
