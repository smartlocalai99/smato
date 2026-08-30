import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, registerDriver, driverApi } = vi.hoisted(() => ({
  push: vi.fn(),
  registerDriver: vi.fn(),
  driverApi: { listAutos: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/drivers/mutations", () => ({ registerDriver }));
vi.mock("@/lib/drivers/api", () => ({ driverApi }));

import NewDriverPage from "@/app/admin/drivers/new/page";

const labels = {
  name: "Name",
  mobile: "Mobile number",
  auto_number_plate: "Auto number plate",
  driving_licence_number: "Driving Licence number",
  aadhaar_number: "Aadhaar number",
};

function image(name) {
  return new File(["image"], name, { type: "image/png" });
}

function completeRegistration() {
  const values = {
    name: "Ravi Kumar",
    mobile: "9876543210",
    auto_number_plate: "TS09AB1234",
    driving_licence_number: "TS0920230012345",
    aadhaar_number: "123456789012",
  };
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[field]), { target: { value } });
  }
  fireEvent.change(screen.getByLabelText("Driver photo"), { target: { files: [image("photo.png")] } });
  fireEvent.change(screen.getByLabelText("Driving Licence image"), { target: { files: [image("licence.png")] } });
  fireEvent.change(screen.getByLabelText("Aadhaar image"), { target: { files: [image("aadhaar.png")] } });
}

function submitRegistration() {
  fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));
}

beforeEach(() => {
  driverApi.listAutos.mockResolvedValue([]);
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

describe("NewDriverPage", () => {
  it("shows the registration heading and redirects after a successful registration", async () => {
    registerDriver.mockResolvedValue({ id: "driver-1" });
    render(<NewDriverPage />);

    expect(screen.getByRole("heading", { name: "Register a driver" })).toBeInTheDocument();
    completeRegistration();
    submitRegistration();

    await waitFor(() => expect(registerDriver).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/drivers?created=1"));
  });

  it("shows a rejected registration message without clearing entered form values", async () => {
    registerDriver.mockRejectedValue(new Error("That auto already has a registered driver."));
    render(<NewDriverPage />);

    completeRegistration();
    submitRegistration();

    expect(await screen.findByRole("alert")).toHaveTextContent("That auto already has a registered driver.");
    expect(screen.getByLabelText("Name")).toHaveValue("Ravi Kumar");
    expect(screen.getByLabelText("Auto number plate")).toHaveValue("TS09AB1234");
    expect(push).not.toHaveBeenCalled();
  });
});
