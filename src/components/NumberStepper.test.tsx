import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { NumberStepper } from "./NumberStepper.tsx";

function Harness({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return <NumberStepper label="Courts" value={value} min={1} max={3} onChange={setValue} />;
}

describe("NumberStepper", () => {
  it("steps and disables buttons at the bounds", async () => {
    render(<Harness initial={2} />);
    const input = screen.getByLabelText("Courts");
    const increase = screen.getByRole("button", { name: "Increase Courts" });
    const decrease = screen.getByRole("button", { name: "Decrease Courts" });

    await userEvent.click(increase);
    expect(input).toHaveValue(3);
    expect(increase).toBeDisabled();

    await userEvent.click(decrease);
    await userEvent.click(decrease);
    expect(input).toHaveValue(1);
    expect(decrease).toBeDisabled();
  });

  it("clamps typed values on blur", async () => {
    render(<Harness initial={2} />);
    const input = screen.getByLabelText("Courts");
    await userEvent.clear(input);
    await userEvent.type(input, "9");
    await userEvent.tab();
    expect(input).toHaveValue(3);
  });
});
