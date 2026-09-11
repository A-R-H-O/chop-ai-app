import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditBalance } from "./credit-balance";

describe("CreditBalance", () => {
  it("labels the balance in credits", () => {
    render(<CreditBalance balance={37} onTopUp={() => {}} />);
    expect(screen.getByText("37 credits")).toBeInTheDocument();
  });

  it("renders the accent colour when the balance cannot cover a chop", () => {
    render(<CreditBalance balance={7} onTopUp={() => {}} />);
    expect(screen.getByTestId("balance-label")).toHaveClass("text-chop-accent");
  });

  it("renders the plain ink colour when a chop is affordable", () => {
    render(<CreditBalance balance={8} onTopUp={() => {}} />);
    expect(screen.getByTestId("balance-label")).toHaveClass("text-chop-ink");
  });

  it("exposes the top up control by its accessible name", async () => {
    const onTopUp = vi.fn();
    render(<CreditBalance balance={8} onTopUp={onTopUp} />);
    await userEvent.click(screen.getByRole("button", { name: "buy credits" }));
    expect(onTopUp).toHaveBeenCalledOnce();
  });

  it("shows the number alone in the compact variant", () => {
    render(<CreditBalance balance={37} onTopUp={() => {}} compact />);
    expect(screen.getByTestId("balance-label")).toHaveTextContent("37");
    expect(screen.queryByText("37 credits")).not.toBeInTheDocument();
  });
});
