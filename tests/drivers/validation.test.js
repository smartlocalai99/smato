import { describe, expect, it } from "vitest";
import {
  DRIVER_FILE_TYPES,
  MAX_DRIVER_FILE_BYTES,
  filterDrivers,
  mapDriverDbError,
  maskAadhaar,
  maskLicence,
  normalizeDriverFields,
  validateDriverFields,
  validateDriverFile,
} from "@/lib/drivers/validation";

describe("driver field validation", () => {
  it("normalizes driver fields into the database format", () => {
    expect(normalizeDriverFields({
      name: "  Ravi Kumar  ", mobile: "+91 98765-43210",
      auto_number_plate: "ts 09 ab 1234", driving_licence_number: "ts 09 20230012345",
      aadhaar_number: "1234 5678 9012",
    })).toEqual({
      name: "Ravi Kumar", mobile: "9876543210", auto_number_plate: "TS09AB1234",
      driving_licence_number: "TS0920230012345", aadhaar_number: "123456789012",
    });
  });

  it("returns field-keyed errors for incomplete or malformed fields", () => {
    expect(validateDriverFields({ name: "", mobile: "123", auto_number_plate: "", driving_licence_number: "", aadhaar_number: "456" })).toMatchObject({
      name: expect.any(String), mobile: expect.any(String), auto_number_plate: expect.any(String),
      driving_licence_number: expect.any(String), aadhaar_number: expect.any(String),
    });
  });
});

describe("driver file validation", () => {
  it("accepts supported MIME types and the exact 5 MB boundary", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(DRIVER_FILE_TYPES.has(type)).toBe(true);
      expect(validateDriverFile(new File([new Uint8Array(MAX_DRIVER_FILE_BYTES)], "doc", { type }), "Photo")).toBeNull();
    }
  });

  it("rejects unsupported MIME types and files larger than 5 MB", () => {
    expect(validateDriverFile(new File(["x"], "doc.pdf", { type: "application/pdf" }), "Photo")).toEqual(expect.any(String));
    expect(validateDriverFile(new File([new Uint8Array(MAX_DRIVER_FILE_BYTES + 1)], "doc", { type: "image/png" }), "Photo")).toEqual(expect.any(String));
  });
});

describe("driver display helpers", () => {
  const drivers = [
    { name: "Ravi Kumar", mobile: "9876543210", auto_number_plate: "TS09AB1234", driving_licence_number: "TS0920230012345" },
    { name: "Anita Rao", mobile: "9123456780", auto_number_plate: "AP10XY9999", driving_licence_number: "AP10202255555" },
  ];

  it("masks Aadhaar and Driving Licence values", () => {
    expect(maskAadhaar("123456789012")).toBe("•••• •••• 9012");
    expect(maskLicence("TS0920230012345")).toBe("•••••••••••2345");
  });

  it("searches name, mobile, plate, and licence case-insensitively", () => {
    expect(filterDrivers(drivers, "RAVI")).toHaveLength(1);
    expect(filterDrivers(drivers, "9123456780")).toHaveLength(1);
    expect(filterDrivers(drivers, "xy9999")).toHaveLength(1);
    expect(filterDrivers(drivers, "ap10202255555")).toHaveLength(1);
  });
});

describe("database error mapping", () => {
  it.each([
    ["drivers_mobile_key", "That mobile number is already registered."],
    ["drivers_auto_number_plate_key", "That auto already has a registered driver."],
    ["drivers_driving_licence_number_key", "That Driving Licence is already registered."],
    ["drivers_aadhaar_number_key", "That Aadhaar number is already registered."],
  ])("maps the %s constraint", (constraint, message) => {
    expect(mapDriverDbError({ constraint })).toBe(message);
  });

  it("checks constraint before message and falls back to the database message", () => {
    expect(mapDriverDbError({ constraint: "drivers_mobile_key", message: "other" })).toBe("That mobile number is already registered.");
    expect(mapDriverDbError({ constraint: "drivers_aadhaar_number_key", message: "mobile already exists" })).toBe("That Aadhaar number is already registered.");
    expect(mapDriverDbError({ message: "Database unavailable" })).toBe("Database unavailable");
    expect(mapDriverDbError({})).toBe("Couldn't save the driver.");
  });
});
