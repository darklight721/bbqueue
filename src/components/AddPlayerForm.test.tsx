import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { AddPlayerForm } from "./AddPlayerForm.tsx";

describe("AddPlayerForm", () => {
  it("defaults Skill level to Intermediate", () => {
    render(<AddPlayerForm existingNames={[]} onAdd={() => {}} />);
    expect(screen.getByLabelText("Skill level")).toHaveValue("intermediate");
  });

  it("asks for a name when empty", async () => {
    const onAdd = vi.fn();
    render(<AddPlayerForm existingNames={[]} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("rejects duplicate names case-insensitively", async () => {
    const onAdd = vi.fn();
    render(<AddPlayerForm existingNames={["Sam"]} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Player name"), "  sam {Enter}");
    expect(screen.getByText("Name already used")).toBeInTheDocument();
    expect(screen.getByLabelText("Player name")).toHaveAttribute("aria-invalid", "true");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds on Enter, then clears and refocuses the name", async () => {
    const onAdd = vi.fn();
    render(<AddPlayerForm existingNames={[]} onAdd={onAdd} />);
    const name = screen.getByLabelText("Player name");
    await userEvent.selectOptions(screen.getByLabelText("Skill level"), "advanced");
    await userEvent.type(name, "  Alex   Kim {Enter}");
    expect(onAdd).toHaveBeenCalledWith({ name: "Alex Kim", skill: "advanced", saveToClub: false });
    expect(name).toHaveValue("");
    expect(name).toHaveFocus();
    expect(screen.getByLabelText("Skill level")).toHaveValue("intermediate");
  });

  it("hides Save to club unless asked", () => {
    render(<AddPlayerForm existingNames={[]} onAdd={() => {}} />);
    expect(screen.queryByLabelText("Save to club")).not.toBeInTheDocument();
  });

  it("shows Save to club unchecked by default and passes it on", async () => {
    const onAdd = vi.fn();
    render(<AddPlayerForm existingNames={[]} onAdd={onAdd} showSaveToClub />);
    const checkbox = screen.getByLabelText("Save to club");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    await userEvent.type(screen.getByLabelText("Player name"), "Jo");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).toHaveBeenCalledWith({ name: "Jo", skill: "intermediate", saveToClub: true });
    expect(screen.getByLabelText("Save to club")).not.toBeChecked();
  });
});
