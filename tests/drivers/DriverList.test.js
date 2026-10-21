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
    aadhaar_image_path: "driver-2/aadhaar.jpg",
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

describe("DriverList", () => {
  it("renders full driver directory details", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    expect(screen.getByRole("img", { name: "Photo of Ravi Kumar" })).toHaveAttribute("src", photoUrls["driver-1/photo.jpg"]);
    expect(screen.getByRole("img", { name: "Photo of Anita Rao" })).toHaveAttribute("src", photoUrls["driver-2/photo.jpg"]);
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("Anita Rao")).toBeInTheDocument();
    expect(screen.getByText("TS09AB1234")).toBeInTheDocument();
    expect(screen.getByText("AP10XY9999")).toBeInTheDocument();
    expect(screen.getByText("9876543210")).toBeInTheDocument();
    expect(screen.getByText("9123456780")).toBeInTheDocument();
    expect(screen.getByText("123456789012")).toBeInTheDocument();
    expect(screen.getByText("TS0920230012345")).toBeInTheDocument();
    expect(screen.getByText("987654321098")).toBeInTheDocument();
    expect(screen.getByText("AP10202255555")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Ravi Kumar" })).toHaveAttribute("href", "/admin/drivers/driver-1/edit");
    expect(screen.getByRole("link", { name: "Edit Anita Rao" })).toHaveAttribute("href", "/admin/drivers/driver-2/edit");
    expect(screen.getByLabelText("Document status for Ravi Kumar")).toHaveTextContent("Photo presentDriving Licence presentAadhaar present");
  });

  it.each([
    ["TS09AB1234", "Ravi Kumar", "Anita Rao"],
    ["anita", "Anita Rao", "Ravi Kumar"],
    ["9876543210", "Ravi Kumar", "Anita Rao"],
    ["AP10202255555", "Anita Rao", "Ravi Kumar"],
  ])("filters the rendered directory by %s", (query, visibleName, hiddenName) => {
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

  it("offers call and WhatsApp links for each driver's mobile", () => {
    render(<DriverList drivers={drivers} photoUrls={photoUrls} />);

    expect(screen.getByRole("link", { name: "Call Ravi Kumar (9876543210)" })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: "WhatsApp Ravi Kumar (9876543210)" })).toHaveAttribute("href", "https://wa.me/919876543210");
  });

  it("deletes a driver from the list after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn().mockResolvedValue();
    render(<DriverList drivers={drivers} photoUrls={photoUrls} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Anita Rao" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete Anita Rao? This removes their record and documents for good.");
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(drivers[1]));
  });

  it("keeps the driver when the delete is not confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDelete = vi.fn();
    render(<DriverList drivers={drivers} photoUrls={photoUrls} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Ravi Kumar" }));

    expect(onDelete).not.toHaveBeenCalled();
  });
});
