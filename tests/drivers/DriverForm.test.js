import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DriverForm from "@/components/drivers/DriverForm";

const completeValues = {
  name: "  Ravi Kumar  ",
  mobile: "+91 98765-43210",
  auto_number_plate: "ts 09 ab 1234",
  driving_licence_number: "ts 09 20230012345",
  aadhaar_number: "1234 5678 9012",
};

const labels = {
  name: "Name",
  mobile: "Mobile number",
  auto_number_plate: "Auto number plate",
  driving_licence_number: "Driving Licence number",
  aadhaar_number: "Aadhaar number",
};

beforeEach(() => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn((file) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function image(name) {
  return new File(["image"], name, { type: "image/png" });
}

function renderRegistration(overrides = {}) {
  const onSubmit = vi.fn();
  render(
    <DriverForm
      mode="register"
      initialValues={{}}
      existingUrls={{}}
      onSubmit={onSubmit}
      busy={false}
      {...overrides}
    />,
  );
  return { onSubmit };
}

function fillRegistration(values = completeValues) {
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[field]), { target: { value } });
  }

  fireEvent.change(screen.getByLabelText("Driver photo"), { target: { files: [image("photo.png")] } });
  fireEvent.change(screen.getByLabelText("Driving Licence image"), { target: { files: [image("licence.png")] } });
  fireEvent.change(screen.getByLabelText("Aadhaar image"), { target: { files: [image("aadhaar.png")] } });
}

describe("DriverForm", () => {
  it("renders every registration field and required upload", () => {
    renderRegistration();

    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Mobile number")).toBeRequired();
    expect(screen.getByLabelText("Auto number plate")).toBeRequired();
    expect(screen.getByLabelText("Driving Licence number")).toBeRequired();
    expect(screen.getByLabelText("Aadhaar number")).toBeRequired();
    expect(screen.getByLabelText("Driver photo")).toBeRequired();
    expect(screen.getByLabelText("Driving Licence image")).toBeRequired();
    expect(screen.getByLabelText("Aadhaar image")).toBeRequired();
    expect(screen.getAllByText("JPEG, PNG or WebP · max 5 MB")).toHaveLength(3);
    expect(screen.getAllByText("Missing")).toHaveLength(3);
  });

  it("shows inline validation errors and leaves submission alone when registration is empty", () => {
    const { onSubmit } = renderRegistration();

    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));

    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 10-digit mobile number.")).toBeInTheDocument();
    expect(screen.getByText("Auto number plate is required.")).toBeInTheDocument();
    expect(screen.getByText("Driving Licence number is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 12-digit Aadhaar number.")).toBeInTheDocument();
    expect(screen.getByText("Driver photo is required.")).toBeInTheDocument();
    expect(screen.getByText("Driving Licence image is required.")).toBeInTheDocument();
    expect(screen.getByText("Aadhaar image is required.")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("normalizes completed registration fields, forwards the three files, and marks documents ready", () => {
    const { onSubmit } = renderRegistration();

    fillRegistration();
    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));

    expect(onSubmit).toHaveBeenCalledWith({
      values: {
        name: "Ravi Kumar",
        mobile: "9876543210",
        auto_number_plate: "TS09AB1234",
        driving_licence_number: "TS0920230012345",
        aadhaar_number: "123456789012",
      },
      files: {
        photo: expect.any(File),
        drivingLicence: expect.any(File),
        aadhaar: expect.any(File),
      },
    });
    expect(screen.getAllByText("Ready")).toHaveLength(3);
    expect(screen.getAllByRole("img", { name: /preview/i })).toHaveLength(3);
  });

  it("shows existing documents as optional replacements in edit mode", () => {
    renderRegistration({
      mode: "edit",
      initialValues: completeValues,
      existingUrls: {
        photo: "https://example.test/photo.png",
        drivingLicence: "https://example.test/licence.png",
        aadhaar: "https://example.test/aadhaar.png",
      },
    });

    expect(screen.getAllByText("Replace image")).toHaveLength(3);
    expect(screen.getAllByRole("img", { name: /current/i })).toHaveLength(3);
    expect(screen.getByLabelText("Driver photo")).not.toBeRequired();
  });
});
