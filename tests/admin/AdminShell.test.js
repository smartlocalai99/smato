import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminShell from "@/components/admin/AdminShell";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));

function adminSession() {
  return {
    access_token: "token",
    user: { app_metadata: { role: "admin" }, is_anonymous: false },
  };
}

vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

function subscribe() {
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  navigation.pathname = "/admin";
});

describe("AdminShell", () => {
  it("shows an accessible loading state while the session is unresolved", () => {
    auth.getSession.mockReturnValue(new Promise(() => {}));
    subscribe();

    render(createElement(AdminShell, null, "Dashboard content"));

    expect(screen.getByRole("status")).toHaveTextContent("Loading admin…");
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("shows the existing sign-in fields when there is no session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    subscribe();

    render(createElement(AdminShell, null, "Dashboard content"));

    expect(await screen.findByLabelText("Mobile number")).toBeRequired();
    expect(screen.getByLabelText("PIN")).toBeRequired();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("renders admin navigation and children for an authenticated session", async () => {
    auth.getSession.mockResolvedValue({ data: { session: adminSession() } });
    subscribe();
    navigation.pathname = "/admin/drivers";

    render(createElement(AdminShell, null, "Dashboard content"));

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    const navigationElement = screen.getByRole("navigation", { name: "Admin navigation" });
    expect(within(navigationElement).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(within(navigationElement).getByRole("link", { name: "Drivers" })).toHaveAttribute("href", "/admin/drivers");
    expect(within(navigationElement).getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
    // Registering a driver is a modal on the Drivers page now, not its own
    // route — no separate nav entry for it.
    expect(within(navigationElement).queryByRole("link", { name: "Register driver" })).not.toBeInTheDocument();
  });

  it("signs out from the authenticated shell", async () => {
    auth.getSession.mockResolvedValue({ data: { session: adminSession() } });
    auth.signOut.mockResolvedValue({ error: null });
    subscribe();

    render(createElement(AdminShell, null, "Dashboard content"));

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("denies a signed-in non-admin account and offers sign out", async () => {
    auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "token",
          user: { app_metadata: { role: "driver" }, is_anonymous: false },
        },
      },
    });
    auth.signOut.mockResolvedValue({ error: null });
    subscribe();

    render(createElement(AdminShell, null, "Dashboard content"));

    expect(await screen.findByRole("heading", { name: "Admin access required" })).toBeInTheDocument();
    expect(screen.getByText(/signed in, but this account does not have admin access/i)).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
