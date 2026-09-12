import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInButton } from "./sign-in-button";

const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithOAuth } }),
}));

beforeEach(() => signInWithOAuth.mockClear());

describe("SignInButton", () => {
  it("uses Google's exact label, which their branding terms forbid altering", () => {
    render(<SignInButton />);
    expect(
      screen.getByRole("button", { name: /Sign in with Google/ }),
    ).toBeInTheDocument();
  });

  it("renders the four-colour Google mark unaltered", () => {
    const { container } = render(<SignInButton />);
    const fills = [...container.querySelectorAll("path")].map((p) =>
      p.getAttribute("fill"),
    );
    expect(fills).toEqual(["#EA4335", "#4285F4", "#FBBC05", "#34A853"]);
  });

  it("meets Google's 40px minimum button height", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button")).toHaveClass("h-10");
  });
});
