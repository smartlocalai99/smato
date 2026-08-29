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
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    subscribe();
    navigation.pathname = "/admin/drivers";

    render(createElement(AdminShell, null, "Dashboard content"));

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    const navigationElement = screen.getByRole("navigation", { name: "Admin navigation" });
    expect(within(navigationElement).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(within(navigationElement).getByRole("link", { name: "Drivers" })).toHaveAttribute("href", "/admin/drivers");
    expect(within(navigationElement).getByRole("link", { name: "Add driver" })).toHaveAttribute("href", "/admin/drivers/new");
    expect(within(navigationElement).getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
  });

  it("signs out from the authenticated shell", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
    auth.signOut.mockResolvedValue({ error: null });
    subscribe();

    render(createElement(AdminShell, null, "Dashboard content"));

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
