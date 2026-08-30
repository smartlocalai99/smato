import { documentPath, driverApi } from "@/lib/drivers/api";
import {
  mapDriverDbError,
  normalizeDriverFields,
  validateDriverFields,
  validateDriverFile,
} from "@/lib/drivers/validation";

const DOCUMENTS = [
  { file: "photo", kind: "photo", path: "photo_path", label: "Driver photo" },
  { file: "drivingLicence", kind: "driving-licence", path: "driving_licence_image_path", label: "Driving Licence image" },
  { file: "aadhaar", kind: "aadhaar", path: "aadhaar_image_path", label: "Aadhaar image" },
];

const FIELD_ORDER = [
  "name",
  "mobile",
  "auto_number_plate",
  "driving_licence_number",
  "aadhaar_number",
];

const FILE_CLEANUP_ATTEMPTS = 3;

export class DriverCleanupError extends Error {
  constructor(message, { cause, driverId, paths = [] } = {}) {
    const pathDetails = paths.length
      ? ` Affected storage paths: ${paths.join(", ")}.`
      : "";
    super(`${message}${pathDetails}`);
    this.name = "DriverCleanupError";
    this.code = "DRIVER_CLEANUP_INCOMPLETE";
    this.cause = cause;
    this.driverId = driverId;
    this.paths = [...paths];
  }
}

function mappedError(error) {
  const result = new Error(mapDriverDbError(error));
  result.cause = error;
  return result;
}

async function removeFilesWithRetry(api, paths) {
  let lastError;
  for (let attempt = 1; attempt <= FILE_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await api.removeFiles(paths);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function currentDriverPatch(current) {
  return {
    name: current.name,
    mobile: current.mobile,
    auto_number_plate: current.auto_number_plate,
    driving_licence_number: current.driving_licence_number,
    aadhaar_number: current.aadhaar_number,
    photo_path: current.photo_path,
    driving_licence_image_path: current.driving_licence_image_path,
    aadhaar_image_path: current.aadhaar_image_path,
  };
}

export function assertValidFieldsAndFiles(values, files = {}, registration = false) {
  const fieldErrors = validateDriverFields(values);
  for (const field of FIELD_ORDER) {
    if (fieldErrors[field]) throw new Error(fieldErrors[field]);
  }

  for (const document of DOCUMENTS) {
    const file = files[document.file];
    if (registration || file) {
      const error = validateDriverFile(file, document.label);
      if (error) throw new Error(error);
    }
  }
}

export async function registerDriver({ values, files }, api = driverApi) {
  const normalized = normalizeDriverFields(values);
  assertValidFieldsAndFiles(normalized, files, true);
  let inserted;
  const uploaded = [];

  try {
    inserted = await api.insert({
      ...normalized,
      photo_path: null,
      driving_licence_image_path: null,
      aadhaar_image_path: null,
    });
    const paths = {};
    for (const document of DOCUMENTS) {
      const path = documentPath(inserted.id, document.kind, files[document.file]);
      await api.upload(path, files[document.file]);
      uploaded.push(path);
      paths[document.path] = path;
    }
    const saved = await api.update(inserted.id, paths);
    await api.upsertAuto(normalized.auto_number_plate);
    return saved;
  } catch (error) {
    if (!inserted) throw mappedError(error);

    try {
      await api.remove(inserted.id);
    } catch (cleanupError) {
      throw new DriverCleanupError(
        "Driver registration failed, and cleanup is incomplete: the driver record still references its uploaded documents. Contact support before retrying.",
        { cause: cleanupError, driverId: inserted.id, paths: uploaded }
      );
    }

    if (uploaded.length) {
      try {
        await removeFilesWithRetry(api, uploaded);
      } catch (cleanupError) {
        throw new DriverCleanupError(
          "Driver registration failed, and document cleanup is incomplete after 3 attempts. Contact support with the affected storage paths.",
          { cause: cleanupError, driverId: inserted.id, paths: uploaded }
        );
      }
    }

    throw mappedError(error);
  }
}

export async function saveDriver({ current, values, replacements }, api = driverApi) {
  const normalized = normalizeDriverFields(values);
  assertValidFieldsAndFiles(normalized, replacements, false);
  const uploaded = [];
  const replacedOldPaths = [];
  const pathPatch = {};
  let saved;
  try {
    for (const document of DOCUMENTS) {
      const file = replacements?.[document.file];
      if (!file) continue;
      const path = documentPath(current.id, document.kind, file);
      await api.upload(path, file);
      uploaded.push(path);
      replacedOldPaths.push(current[document.path]);
      pathPatch[document.path] = path;
    }
    saved = await api.update(current.id, { ...normalized, ...pathPatch });
  } catch (error) {
    if (uploaded.length) {
      try {
        await removeFilesWithRetry(api, uploaded);
      } catch (cleanupError) {
        throw new DriverCleanupError(
          "Driver save failed, and uploaded document cleanup is incomplete after 3 attempts. Contact support with the affected storage paths.",
          { cause: cleanupError, driverId: current.id, paths: uploaded }
        );
      }
    }
    throw mappedError(error);
  }

  try {
    await api.upsertAuto(normalized.auto_number_plate);
  } catch (error) {
    try {
      await api.update(current.id, currentDriverPatch(current));
    } catch (cleanupError) {
      throw new DriverCleanupError(
        "Driver save failed, and cleanup is incomplete: the driver record may still reference newly uploaded documents. Contact support before retrying.",
        { cause: cleanupError, driverId: current.id, paths: uploaded }
      );
    }

    if (uploaded.length) {
      try {
        await removeFilesWithRetry(api, uploaded);
      } catch (cleanupError) {
        throw new DriverCleanupError(
          "Driver save failed, database state was restored, but uploaded document cleanup is incomplete after 3 attempts. Contact support with the affected storage paths.",
          { cause: cleanupError, driverId: current.id, paths: uploaded }
        );
      }
    }
    throw mappedError(error);
  }

  if (replacedOldPaths.length) {
    try {
      await removeFilesWithRetry(api, replacedOldPaths);
    } catch (cleanupError) {
      throw new DriverCleanupError(
        "Driver changes were saved, but superseded document cleanup is incomplete after 3 attempts. Contact support with the affected storage paths.",
        { cause: cleanupError, driverId: current.id, paths: replacedOldPaths }
      );
    }
  }

  return saved;
}
