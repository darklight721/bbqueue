import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { PlayerRowEditor } from "./PlayerRowEditor.tsx";

describe("PlayerRowEditor", () => {
  it("edits name and Skill level", async () => {
    const onChange = vi.fn();
    render(
      <PlayerRowEditor
        value={{ name: "Sam", skill: "beginner" }}
        onChange={onChange}
        onRemove={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText("Player name"), "!");
    expect(onChange).toHaveBeenLastCalledWith({ name: "Sam!", skill: "beginner" });
    await userEvent.selectOptions(screen.getByLabelText("Skill level for Sam"), "advanced");
    expect(onChange).toHaveBeenLastCalledWith({ name: "Sam", skill: "advanced" });
  });

  it("shows validation messages", () => {
    const { rerender } = render(
      <PlayerRowEditor
        value={{ name: "", skill: "intermediate" }}
        onChange={() => {}}
        onRemove={() => {}}
        error="required"
      />,
    );
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    rerender(
      <PlayerRowEditor
        value={{ name: "Sam", skill: "intermediate" }}
        onChange={() => {}}
        onRemove={() => {}}
        error="duplicate"
      />,
    );
    expect(screen.getByText("Name already used")).toBeInTheDocument();
  });

  it("removes", async () => {
    const onRemove = vi.fn();
    render(
      <PlayerRowEditor
        value={{ name: "Sam", skill: "intermediate" }}
        onChange={() => {}}
        onRemove={onRemove}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
