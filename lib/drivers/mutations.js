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
    await Promise.allSettled([
      uploaded.length ? api.removeFiles(uploaded) : Promise.resolve(),
      inserted ? api.remove(inserted.id) : Promise.resolve(),
    ]);
    throw new Error(mapDriverDbError(error));
  }
}

export async function saveDriver({ current, values, replacements }, api = driverApi) {
  const normalized = normalizeDriverFields(values);
  assertValidFieldsAndFiles(normalized, replacements, false);
  const uploaded = [];
  const replacedOldPaths = [];
  const pathPatch = {};
  let rowUpdated = false;

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
    const saved = await api.update(current.id, { ...normalized, ...pathPatch });
    rowUpdated = true;
    await api.upsertAuto(normalized.auto_number_plate);
    if (replacedOldPaths.length) await Promise.allSettled([api.removeFiles(replacedOldPaths)]);
    return saved;
  } catch (error) {
    const rollback = [];
    if (rowUpdated) {
      rollback.push(api.update(current.id, {
        name: current.name,
        mobile: current.mobile,
        auto_number_plate: current.auto_number_plate,
        driving_licence_number: current.driving_licence_number,
        aadhaar_number: current.aadhaar_number,
        photo_path: current.photo_path,
        driving_licence_image_path: current.driving_licence_image_path,
        aadhaar_image_path: current.aadhaar_image_path,
      }));
    }
    if (uploaded.length) rollback.push(api.removeFiles(uploaded));
    await Promise.allSettled(rollback);
    throw new Error(mapDriverDbError(error));
  }
}
