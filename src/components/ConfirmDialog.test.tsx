import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ConfirmDialog
        open={false}
        title="End session?"
        confirmLabel="End"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms and cancels; danger focuses Cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Discard changes?"
        message="Your edits will be lost."
        confirmLabel="Discard"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Discard changes?" });
    expect(dialog).toHaveAccessibleDescription("Your edits will be lost.");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("while busy: confirm shows the spinner and busy label, nothing can dismiss it", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete club?"
        confirmLabel="Delete"
        busyLabel="Deleting…"
        tone="danger"
        busy
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Delete club?" });
    const confirm = screen.getByRole("button", { name: "Deleting…" });
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveFocus();
    expect(confirm.querySelector(".loading-spinner")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await userEvent.click(confirm);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true })); // Escape
    // The backdrop's button is hidden from the accessibility tree.
    const backdrop = dialog.querySelector<HTMLButtonElement>(".modal-backdrop button")!;
    expect(backdrop).toBeDisabled();
    fireEvent.click(backdrop);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("while busy without a busy label, the confirm label stays", () => {
    render(
      <ConfirmDialog
        open
        title="End?"
        confirmLabel="End"
        busy
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "End" })).toHaveAttribute("aria-busy", "true");
  });

  it("Escape still cancels when not busy", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="End?"
        confirmLabel="End"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
