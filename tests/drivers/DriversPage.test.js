import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { driverApi, searchParams } = vi.hoisted(() => ({
  driverApi: {
    list: vi.fn(),
    sign: vi.fn(),
  },
  searchParams: { current: new URLSearchParams() },
}));

vi.mock("@/lib/drivers/api", () => ({ driverApi }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
}));

import DriversPage from "@/app/admin/drivers/page";

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

beforeEach(() => {
  searchParams.current = new URLSearchParams();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("DriversPage", () => {
  it("shows a loading status while the directory request is pending", () => {
    driverApi.list.mockReturnValue(new Promise(() => {}));
    render(<DriversPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading drivers…");
  });

  it("offers a retry after a directory request fails", async () => {
    driverApi.list
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce([]);
    render(<DriversPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load drivers.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(driverApi.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No drivers have been registered yet.")).toBeInTheDocument();
  });

  it("directs admins to register the first driver when the directory is empty", async () => {
    driverApi.list.mockResolvedValue([]);
    render(<DriversPage />);

    expect(await screen.findByText("No drivers have been registered yet.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("No drivers registered")).getByRole("link", { name: "Register a driver" }))
      .toHaveAttribute("href", "/admin/drivers/new");
  });

  it.each([
    ["created=1", "Driver registered."],
    ["updated=1", "Driver updated."],
  ])("shows the directory success banner for %s", async (query, message) => {
    searchParams.current = new URLSearchParams(query);
    driverApi.list.mockResolvedValue([]);
    render(<DriversPage />);

    expect(screen.getByText(message)).toHaveAttribute("role", "status");
    expect(await screen.findByText("No drivers have been registered yet.")).toBeInTheDocument();
  });

  it("warns when a saved driver still needs old document cleanup", async () => {
    searchParams.current = new URLSearchParams("updated=1&cleanup=1");
    driverApi.list.mockResolvedValue([]);
    render(<DriversPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Driver saved, but old document cleanup needs attention."
    );
    expect(await screen.findByText("No drivers have been registered yet.")).toBeInTheDocument();
  });

  it("loads signed thumbnails only for driver photo paths", async () => {
    driverApi.list.mockResolvedValue(drivers);
    driverApi.sign.mockResolvedValue({
      "driver-1/photo.jpg": "https://images.example.test/ravi.jpg",
      "driver-2/photo.jpg": "https://images.example.test/anita.jpg",
    });
    render(<DriversPage />);

    expect(await screen.findByRole("img", { name: "Photo of Ravi Kumar" })).toBeInTheDocument();
    expect(driverApi.sign).toHaveBeenCalledWith(["driver-1/photo.jpg", "driver-2/photo.jpg"]);
    expect(driverApi.sign).not.toHaveBeenCalledWith(expect.arrayContaining([
      "driver-1/licence.jpg",
      "driver-1/aadhaar.jpg",
      "driver-2/licence.jpg",
      "driver-2/aadhaar.jpg",
    ]));
  });
});
