import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DriverList from "@/components/drivers/DriverList";

const drivers = [
  {
    id: "driver-1",
    name: "Ravi Kumar",
    mobile: "9876543210",
    auto_number_plate: "TS09AB1234",
    driving_licence_number: "TS0920230012345",
    aadhaar_number: "123456789012",
    photo_path: "driver-1/photo.jpg",
    driving_licence_image_path: "driver-1/licence.jpg",
    aadhaar_image_path: "driver-1/aadhaar.jpg",
  },
  {
    id: "driver-2",
    name: "Anita Rao",
    mobile: "9123456780",
    auto_number_plate: "AP10XY9999",
    driving_licence_number: "AP10202255555",
    aadhaar_number: "987654321098",
    photo_path: "driver-2/photo.jpg",
    driving_licence_image_path: "driver-2/licence.jpg",
    aadhaar_image_path: null,
    alt_mobile: "9000011111",
  },
];

const photoUrls = {
  "driver-1/photo.jpg": "https://images.example.test/ravi.jpg",
  "driver-2/photo.jpg": "https://images.example.test/anita.jpg",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function expand(name) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
}

describe("DriverList", () => {
  it("shows a compact, collapsed card per driver", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    expect(screen.getByRole("img", { name: "Photo of Ravi Kumar" })).toHaveAttribute("src", photoUrls["driver-1/photo.jpg"]);
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("TS09AB1234")).toBeInTheDocument();
    expect(screen.getByText("9876543210")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ravi Kumar/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("TS0920230012345")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit Ravi Kumar" })).not.toBeInTheDocument();
  });

  it("opens a card to show the driver's full details and actions", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    expand("Anita Rao");

    expect(screen.getByRole("button", { name: /Anita Rao/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("AP10202255555")).toBeInTheDocument();
    expect(screen.getByText("9876 5432 1098")).toBeInTheDocument();
    expect(screen.getByText("9000011111")).toBeInTheDocument();
    expect(screen.getByLabelText("Documents for Anita Rao")).toHaveTextContent("Photo addedLicence addedAadhaar not added");
    expect(screen.getByRole("link", { name: "View Anita Rao" })).toHaveAttribute("href", "/admin/drivers/driver-2");
    expect(screen.getByRole("link", { name: "Edit Anita Rao" })).toHaveAttribute("href", "/admin/drivers/driver-2/edit");
    // Only the tapped card opens.
    expect(screen.queryByText("TS0920230012345")).not.toBeInTheDocument();

    expand("Anita Rao");
    expect(screen.queryByText("AP10202255555")).not.toBeInTheDocument();
  });

  it.each([
    ["TS09AB1234", "Ravi Kumar", "Anita Rao"],
    ["anita", "Anita Rao", "Ravi Kumar"],
    ["9876543210", "Ravi Kumar", "Anita Rao"],
    ["9000011111", "Anita Rao", "Ravi Kumar"],
    ["AP10202255555", "Anita Rao", "Ravi Kumar"],
  ])("filters the directory by %s", (query, visibleName, hiddenName) => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search drivers" }), { target: { value: query } });

    expect(screen.getByText(visibleName)).toBeInTheDocument();
    expect(screen.queryByText(hiddenName)).not.toBeInTheDocument();
  });

  it("explains when a search has no matching drivers", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search drivers" }), { target: { value: "not-a-driver" } });

    expect(screen.getByText("No drivers match your search.")).toBeInTheDocument();
  });

  it("offers call and WhatsApp links for every number once opened", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);
    expand("Anita Rao");

    expect(screen.getByRole("link", { name: "Call Anita Rao (9123456780)" })).toHaveAttribute("href", "tel:+919123456780");
    expect(screen.getByRole("link", { name: "WhatsApp Anita Rao (9000011111)" })).toHaveAttribute("href", "https://wa.me/919000011111");
  });

  it("deletes a driver after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue();
    render(<DriverList drivers={drivers} photoUrls={photoUrls} onDelete={onDelete} />);
    expand("Anita Rao");

    fireEvent.click(screen.getByRole("button", { name: "Delete Anita Rao" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete Anita Rao? This removes their record and documents for good.");
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(drivers[1]));
  });

  it("keeps the driver when the delete is not confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDelete = vi.fn();
    render(<DriverList drivers={drivers} photoUrls={photoUrls} onDelete={onDelete} />);
    expand("Ravi Kumar");

    fireEvent.click(screen.getByRole("button", { name: "Delete Ravi Kumar" }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
