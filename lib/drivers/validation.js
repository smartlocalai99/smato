export const MAX_DRIVER_FILE_BYTES = 5 * 1024 * 1024;
export const DRIVER_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const digits = (value) => String(value || "").replace(/\D/g, "");

// "+91 98765-43210" and "098765 43210" both store as the bare 10 digits.
function phoneNumber(value) {
  const raw = digits(value);
  if (raw.length === 12 && raw.startsWith("91")) return raw.slice(2);
  if (raw.length === 11 && raw.startsWith("0")) return raw.slice(1);
  return raw;
}

export function normalizeDriverFields(values = {}) {
  const compactUpper = (value) => String(value || "").replace(/\s/g, "").toUpperCase();
  return {
    name: String(values.name || "").trim(),
    mobile: phoneNumber(values.mobile),
    // Optional second number — stored as null rather than "" when left empty.
    alt_mobile: phoneNumber(values.alt_mobile) || null,
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
  if (fields.alt_mobile && !/^\d{10}$/.test(fields.alt_mobile)) {
    errors.alt_mobile = "Enter a valid 10-digit number, or leave it empty.";
  } else if (fields.alt_mobile && fields.alt_mobile === fields.mobile) {
    errors.alt_mobile = "This is the same as the main mobile number.";
  }
  if (!fields.auto_number_plate) errors.auto_number_plate = "Choose the auto this driver drives.";
  if (!fields.driving_licence_number) errors.driving_licence_number = "Driving Licence number is required.";
  if (!/^\d{12}$/.test(fields.aadhaar_number)) errors.aadhaar_number = "Enter a valid 12-digit Aadhaar number.";
  return errors;
}

// Documents are optional — only a file that was actually chosen is checked.
export function validateDriverFile(file, label = "File") {
  if (!file) return null;
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
    driver.alt_mobile,
    driver.auto_number_plate,
    driver.driving_licence_number,
  ].some((value) => String(value || "").toLowerCase().includes(needle)));
}

export function mapDriverDbError(error = {}) {
  const constraint = String(error.constraint || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  const mapField = (source) => {
    if (source.includes("mobile")) return "That mobile number is already registered.";
    if (source.includes("auto_number_plate") || source.includes("auto")) return "That auto already has a registered driver.";
    if (source.includes("driving_licence") || source.includes("licence")) return "That Driving Licence is already registered.";
    if (source.includes("aadhaar")) return "That Aadhaar number is already registered.";
    return null;
  };
  if (constraint) {
    const constraintMessage = mapField(constraint);
    if (constraintMessage) return constraintMessage;
  }
  const messageField = mapField(message);
  if (messageField) return messageField;
  return error.message || "Couldn't save the driver.";
}
