import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { driverApi, push, saveDriver } = vi.hoisted(() => ({
  driverApi: {
    get: vi.fn(),
    sign: vi.fn(),
  },
  push: vi.fn(),
  saveDriver: vi.fn(),
}));

vi.mock("@/lib/drivers/api", () => ({ driverApi }));

vi.mock("@/lib/drivers/mutations", () => ({ saveDriver }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import EditDriverPage from "@/app/admin/drivers/[id]/edit/page";

const driver = {
  id: "driver-1",
  name: "Ravi Kumar",
  mobile: "9876543210",
  auto_number_plate: "TS09AB1234",
  driving_licence_number: "TS0920230012345",
  aadhaar_number: "123456789012",
  photo_path: "driver-1/photo.jpg",
  driving_licence_image_path: "driver-1/driving-licence.jpg",
  aadhaar_image_path: "driver-1/aadhaar.jpg",
};

const signedUrls = {
  "driver-1/photo.jpg": "https://images.example.test/photo.jpg",
  "driver-1/driving-licence.jpg": "https://images.example.test/licence.jpg",
  "driver-1/aadhaar.jpg": "https://images.example.test/aadhaar.jpg",
};

function renderPage() {
  return render(<EditDriverPage params={{ id: "driver-1" }} />);
}

function submitChanges() {
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form"));
}

beforeEach(() => {
  driverApi.get.mockResolvedValue(driver);
  driverApi.sign.mockResolvedValue(signedUrls);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((file) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("EditDriverPage", () => {
  it("loads the driver and all current documents into the edit form", async () => {
    renderPage();

    expect(await screen.findByDisplayValue("Ravi Kumar")).toBeInTheDocument();
    expect(driverApi.sign).toHaveBeenCalledWith([
      "driver-1/photo.jpg", "driver-1/driving-licence.jpg", "driver-1/aadhaar.jpg",
    ]);
    expect(screen.getAllByRole("img", { name: /current/i })).toHaveLength(3);
  });

  it("shows an accessible not-found state with a back link", async () => {
    driverApi.get.mockResolvedValue(null);
    renderPage();

    expect(await screen.findByRole("heading", { name: "Driver not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to drivers" })).toHaveAttribute("href", "/admin/drivers");
    expect(driverApi.sign).not.toHaveBeenCalled();
  });

  it("offers a retry after loading fails", async () => {
    driverApi.get
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(driver);
    driverApi.sign.mockResolvedValueOnce(signedUrls);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this driver.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(driverApi.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue("Ravi Kumar")).toBeInTheDocument();
  });

  it("saves unchanged documents by retaining the current record and no replacements", async () => {
    saveDriver.mockResolvedValue(driver);
    renderPage();

    await screen.findByDisplayValue("Ravi Kumar");
    submitChanges();

    await waitFor(() => expect(saveDriver).toHaveBeenCalledWith({
      current: driver,
      values: {
        name: "Ravi Kumar",
        mobile: "9876543210",
        auto_number_plate: "TS09AB1234",
        driving_licence_number: "TS0920230012345",
        aadhaar_number: "123456789012",
      },
      replacements: {},
    }));
    expect(push).toHaveBeenCalledWith("/admin/drivers?updated=1");
  });

  it("keeps the form and shows a duplicate-auto rejection", async () => {
    saveDriver.mockRejectedValue(new Error("That auto already has a registered driver."));
    renderPage();

    await screen.findByDisplayValue("Ravi Kumar");
    submitChanges();

    expect(await screen.findByRole("alert")).toHaveTextContent("That auto already has a registered driver.");
    expect(screen.getByDisplayValue("Ravi Kumar")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to a cleanup warning after the driver save committed", async () => {
    const saved = { ...driver, name: "Ravi Saved" };
    const cleanupError = Object.assign(
      new Error("Driver changes were saved, but superseded document cleanup is incomplete."),
      { code: "DRIVER_CLEANUP_INCOMPLETE", saved }
    );
    saveDriver.mockRejectedValue(cleanupError);
    renderPage();

    await screen.findByDisplayValue("Ravi Kumar");
    submitChanges();

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/admin/drivers?updated=1&cleanup=1");
    });
    expect(screen.queryByText(cleanupError.message)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("forwards edited values and one replacement while retaining both after a failed save", async () => {
    const saveError = new Error("Storage unavailable");
    const replacement = new File(["replacement"], "new-aadhaar.png", { type: "image/png" });
    saveDriver.mockRejectedValue(saveError);
    renderPage();

    const nameInput = await screen.findByDisplayValue("Ravi Kumar");
    fireEvent.change(nameInput, { target: { value: "Ravi Edited" } });
    fireEvent.change(screen.getByLabelText("Aadhaar image"), {
      target: { files: [replacement] },
    });
    expect(await screen.findByRole("img", { name: "Aadhaar image preview" }))
      .toHaveAttribute("src", "blob:new-aadhaar.png");

    submitChanges();

    await waitFor(() => expect(saveDriver).toHaveBeenCalledWith({
      current: driver,
      values: {
        name: "Ravi Edited",
        mobile: "9876543210",
        auto_number_plate: "TS09AB1234",
        driving_licence_number: "TS0920230012345",
        aadhaar_number: "123456789012",
      },
      replacements: { aadhaar: replacement },
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Storage unavailable");
    expect(screen.getByDisplayValue("Ravi Edited")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aadhaar image preview" }))
      .toHaveAttribute("src", "blob:new-aadhaar.png");
    expect(push).not.toHaveBeenCalled();
  });
});
