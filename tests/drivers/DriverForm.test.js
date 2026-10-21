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
  auto_number_plate: "Auto number",
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
  it("renders every registration field with optional documents and second mobile", () => {
    renderRegistration();

    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Mobile number")).toBeRequired();
    expect(screen.getByLabelText("Second mobile (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Auto number")).toBeRequired();
    expect(screen.getByLabelText("Driving Licence number")).toBeRequired();
    expect(screen.getByLabelText("Aadhaar number")).toBeRequired();
    expect(screen.getByLabelText("Driver photo")).not.toBeRequired();
    expect(screen.getByLabelText("Driving Licence image")).not.toBeRequired();
    expect(screen.getByLabelText("Aadhaar image")).not.toBeRequired();
    expect(screen.getAllByText("JPEG, PNG or WebP · max 5 MB")).toHaveLength(3);
    expect(screen.getAllByText("Not added")).toHaveLength(3);
  });

  it("shows inline validation errors and leaves submission alone when registration is empty", () => {
    const { onSubmit } = renderRegistration();

    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));

    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 10-digit mobile number.")).toBeInTheDocument();
    expect(screen.getByText("Choose the auto this driver drives.")).toBeInTheDocument();
    expect(screen.getByText("Driving Licence number is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 12-digit Aadhaar number.")).toBeInTheDocument();
    expect(screen.queryByText(/image is required|photo is required/)).not.toBeInTheDocument();
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
        alt_mobile: null,
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

  it("registers a driver without any documents", () => {
    const { onSubmit } = renderRegistration();

    for (const [field, value] of Object.entries(completeValues)) {
      fireEvent.change(screen.getByLabelText(labels[field]), { target: { value } });
    }
    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));

    expect(onSubmit).toHaveBeenCalledWith({ values: expect.objectContaining({ name: "Ravi Kumar" }), files: {} });
  });

  it("forwards a second mobile number and rejects one that repeats the first", () => {
    const { onSubmit } = renderRegistration();
    for (const [field, value] of Object.entries(completeValues)) {
      fireEvent.change(screen.getByLabelText(labels[field]), { target: { value } });
    }

    fireEvent.change(screen.getByLabelText("Second mobile (optional)"), { target: { value: "98765 43210" } });
    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));
    expect(screen.getByText("This is the same as the main mobile number.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Second mobile (optional)"), { target: { value: "91234 56780" } });
    fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({ mobile: "9876543210", alt_mobile: "9123456780" }),
    }));
  });

  describe("auto dropdown", () => {
    const autos = [
      { auto_number: "AUTO-01", driver: null },
      { auto_number: "AUTO-02", driver: { id: "driver-9", name: "Anita Rao" } },
      { auto_number: "AUTO-03", driver: { id: "driver-1", name: "Ravi Kumar" } },
    ];

    it("lists the fleet and greys out autos another driver already has", () => {
      renderRegistration({ autos });

      const select = screen.getByLabelText("Auto");
      expect(select.tagName).toBe("SELECT");
      expect(screen.getByRole("option", { name: "AUTO-01" })).toBeEnabled();
      expect(screen.getByRole("option", { name: "AUTO-02 — Anita Rao" })).toBeDisabled();
      expect(screen.getByRole("option", { name: "AUTO-03 — Ravi Kumar" })).toBeDisabled();
    });

    it("lets a driver keep their own auto when editing", () => {
      renderRegistration({ autos, mode: "edit", initialValues: { ...completeValues, id: "driver-1", auto_number_plate: "AUTO-03" } });

      expect(screen.getByLabelText("Auto")).toHaveValue("AUTO-03");
      expect(screen.getByRole("option", { name: "AUTO-03" })).toBeEnabled();
    });

    it("submits the picked auto", () => {
      const { onSubmit } = renderRegistration({ autos });
      for (const [field, value] of Object.entries(completeValues)) {
        if (field !== "auto_number_plate") fireEvent.change(screen.getByLabelText(labels[field]), { target: { value } });
      }

      fireEvent.change(screen.getByLabelText("Auto"), { target: { value: "AUTO-01" } });
      fireEvent.submit(screen.getByRole("button", { name: "Register driver" }).closest("form"));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        values: expect.objectContaining({ auto_number_plate: "AUTO-01" }),
      }));
    });

    it("switches to typing a new auto number and back", () => {
      renderRegistration({ autos });

      fireEvent.change(screen.getByLabelText("Auto"), { target: { value: "__new__" } });
      const input = screen.getByLabelText("Auto number");
      expect(input.tagName).toBe("INPUT");
      fireEvent.change(input, { target: { value: "auto-07" } });

      fireEvent.click(screen.getByRole("button", { name: "Pick from the list" }));
      expect(screen.getByLabelText("Auto")).toHaveValue("");
    });
  });
});
