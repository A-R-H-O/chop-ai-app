import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopUpDialog } from "./top-up-dialog";

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://checkout.example/x" }),
  }) as unknown as typeof fetch;
});

describe("TopUpDialog", () => {
  it("preselects the 300 pack, per the handoff", () => {
    render(<TopUpDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: /^300 credits/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("labels the CTA with the current selection", () => {
    render(<TopUpDialog open onOpenChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "buy 300 credits for $9" }),
    ).toBeInTheDocument();
  });

  it("rewrites the CTA when another pack is chosen", async () => {
    render(<TopUpDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /^1000 credits/ }));
    expect(
      screen.getByRole("button", { name: "buy 1000 credits for $25" }),
    ).toBeInTheDocument();
  });

  it("states the chop cost from the shared constant", () => {
    render(<TopUpDialog open onOpenChange={() => {}} />);
    expect(
      screen.getByText("8 credits a chop. credits do not expire."),
    ).toBeInTheDocument();
  });

  it("sends the chosen pack to the checkout endpoint", async () => {
    render(<TopUpDialog open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /^100 credits/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "buy 100 credits for $4" }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ pack: "100" }),
      }),
    );
  });

  it("keeps the dialog open and shows the error when checkout fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "card declined" }),
    }) as unknown as typeof fetch;

    render(<TopUpDialog open onOpenChange={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "buy 300 credits for $9" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("card declined");
  });
});
