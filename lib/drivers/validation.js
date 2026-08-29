export const MAX_DRIVER_FILE_BYTES = 5 * 1024 * 1024;
export const DRIVER_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeDriverFields(values = {}) {
  const digits = (value) => String(value || "").replace(/\D/g, "");
  const compactUpper = (value) => String(value || "").replace(/\s/g, "").toUpperCase();
  const mobileDigits = digits(values.mobile);
  return {
    name: String(values.name || "").trim(),
    mobile: mobileDigits.length === 12 && mobileDigits.startsWith("91") ? mobileDigits.slice(2) : mobileDigits,
    auto_number_plate: compactUpper(values.auto_number_plate),
    driving_licence_number: compactUpper(values.driving_licence_number),
    aadhaar_number: digits(values.aadhaar_number),
  };
}

export function validateDriverFields(values = {}) {
  const fields = normalizeDriverFields(values);
  const errors = {};
  if (!fields.name) errors.name = "Name is required.";
  if (!/^\d{10}$/.test(fields.mobile)) errors.mobile = "Enter a valid 10-digit mobile number.";
  if (!fields.auto_number_plate) errors.auto_number_plate = "Auto number plate is required.";
  if (!fields.driving_licence_number) errors.driving_licence_number = "Driving Licence number is required.";
  if (!/^\d{12}$/.test(fields.aadhaar_number)) errors.aadhaar_number = "Enter a valid 12-digit Aadhaar number.";
  return errors;
}

export function validateDriverFile(file, label = "File") {
  if (!file) return `${label} is required.`;
  if (!DRIVER_FILE_TYPES.has(file.type)) return `${label} must be a JPEG, PNG, or WebP image.`;
  if (file.size > MAX_DRIVER_FILE_BYTES) return `${label} must be 5 MB or smaller.`;
  return null;
}

export function maskAadhaar(value) {
  const normalized = String(value || "");
  if (normalized.length <= 4) return normalized;
  const suffix = normalized.slice(-4);
  const masked = "•".repeat(normalized.length - 4);
  return `${masked.slice(0, 4)} ${masked.slice(4, 8)} ${suffix}`;
}

export function maskLicence(value) {
  const normalized = String(value || "");
  if (normalized.length <= 4) return normalized;
  return `${"•".repeat(normalized.length - 4)}${normalized.slice(-4)}`;
}

export function filterDrivers(drivers = [], query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return drivers;
  return drivers.filter((driver) => [
    driver.name,
    driver.mobile,
    driver.auto_number_plate,
    driver.driving_licence_number,
  ].some((value) => String(value || "").toLowerCase().includes(needle)));
}

export function mapDriverDbError(error = {}) {
  const constraint = String(error.constraint || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  const source = `${constraint} ${message}`;
  if (source.includes("mobile")) return "That mobile number is already registered.";
  if (source.includes("auto_number_plate") || source.includes("auto")) return "That auto already has a registered driver.";
  if (source.includes("driving_licence") || source.includes("licence")) return "That Driving Licence is already registered.";
  if (source.includes("aadhaar")) return "That Aadhaar number is already registered.";
  return error.message || "Couldn't save the driver.";
}
