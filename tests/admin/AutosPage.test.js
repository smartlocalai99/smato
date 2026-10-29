import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { tables, setAutoScreen } = vi.hoisted(() => ({
  tables: { autos: [], drivers: [] },
  setAutoScreen: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table) => {
      const query = {
        select: () => query,
        order: () => query,
        then: (resolve, reject) =>
          Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject),
      };
      return query;
    },
  },
  setAutoScreen,
  renumberAuto: vi.fn(),
}));

import AutosPage from "@/app/admin/autos/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AutosPage", () => {
  it("shows each auto as a card with who drives it and a way to call them", async () => {
    tables.autos = [
      { id: "a1", auto_number: "AUTO-03", sim_number: null, last_seen_at: null },
      { id: "a2", auto_number: "AUTO-05", sim_number: null, last_seen_at: null },
    ];
    tables.drivers = [{ id: "d1", name: "Ravi Kumar", mobile: "9052006557", auto_number_plate: "AUTO-03" }];
    const { container } = render(<AutosPage />);

    const cards = await screen.findAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByRole("link", { name: /^Ravi Kumar/ })).toHaveAttribute("href", "/admin/drivers/d1");
    expect(within(cards[0]).getByRole("link", { name: "Call Ravi Kumar (9052006557)" })).toHaveAttribute(
      "href",
      "tel:+919052006557"
    );
    expect(within(cards[1]).getByText("No driver linked")).toBeInTheDocument();
    expect(within(cards[1]).getByRole("link", { name: "Add driver" })).toHaveAttribute(
      "href",
      "/admin/drivers/new?auto=AUTO-05"
    );
    // Cards, not a wide table that has to be scrolled sideways on a phone.
    expect(container.querySelector("table")).toBeNull();
  });

  it("keeps the cards on screen while it refreshes after an action", async () => {
    tables.autos = [{ id: "a1", auto_number: "AUTO-03", sim_number: null, last_seen_at: null, screen_off: false }];
    tables.drivers = [];
    render(<AutosPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Turn off screen" }));

    await waitFor(() => expect(setAutoScreen).toHaveBeenCalledWith("AUTO-03", true));
    expect(screen.queryByText("Loading autos…")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });
});
