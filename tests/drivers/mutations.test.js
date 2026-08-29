import { describe, expect, it, vi } from "vitest";
import { registerDriver, saveDriver } from "@/lib/drivers/mutations";

const values = {
  name: "  Ravi Kumar  ",
  mobile: "+91 98765-43210",
  auto_number_plate: "ts 09 ab 1234",
  driving_licence_number: "ts 09 20230012345",
  aadhaar_number: "1234 5678 9012",
  photoPreview: "blob:photo",
};

const normalized = {
  name: "Ravi Kumar",
  mobile: "9876543210",
  auto_number_plate: "TS09AB1234",
  driving_licence_number: "TS0920230012345",
  aadhaar_number: "123456789012",
};

function file(name, type = "image/png") {
  return new File(["image"], name, { type });
}

function registrationInput(overrides = {}) {
  return {
    values,
    files: {
      photo: file("photo.png"),
      drivingLicence: file("licence.png"),
      aadhaar: file("aadhaar.png"),
    },
    ...overrides,
  };
}

function currentDriver(overrides = {}) {
  return {
    id: "driver-1",
    ...normalized,
    photo_path: "driver-1/photo-old.png",
    driving_licence_image_path: "driver-1/licence-old.png",
    aadhaar_image_path: "driver-1/aadhaar-old.png",
    ...overrides,
  };
}

function createApi({ inserted = currentDriver(), saved = currentDriver(), upload } = {}) {
  const events = [];
  const api = {
    insert: vi.fn(async (payload) => {
      events.push(["insert", payload]);
      return inserted;
    }),
    update: vi.fn(async (id, patch) => {
      events.push(["update", id, patch]);
      return saved;
    }),
    remove: vi.fn(async (id) => {
      events.push(["remove", id]);
    }),
    upload: vi.fn(async (path, uploadedFile) => {
      events.push(["upload", path, uploadedFile]);
      return upload ? upload(path, uploadedFile) : path;
    }),
    removeFiles: vi.fn(async (paths) => {
      events.push(["removeFiles", paths]);
    }),
    upsertAuto: vi.fn(async (plate) => {
      events.push(["upsertAuto", plate]);
    }),
  };
  return { api, events };
}

describe("registerDriver", () => {
  it("creates the row, uploads every document, saves all paths, then creates the normalized auto", async () => {
    const { api, events } = createApi();

    await expect(registerDriver(registrationInput(), api)).resolves.toEqual(currentDriver());

    expect(events.map(([operation]) => operation)).toEqual([
      "insert", "upload", "upload", "upload", "update", "upsertAuto",
    ]);
    expect(api.insert).toHaveBeenCalledWith({
      ...normalized,
      photo_path: null,
      driving_licence_image_path: null,
      aadhaar_image_path: null,
    });
    const [[photoPath], [licencePath], [aadhaarPath]] = api.upload.mock.calls;
    expect(photoPath).toMatch(/^driver-1\/photo-[\w-]+\.png$/);
    expect(licencePath).toMatch(/^driver-1\/driving-licence-[\w-]+\.png$/);
    expect(aadhaarPath).toMatch(/^driver-1\/aadhaar-[\w-]+\.png$/);
    expect(api.update).toHaveBeenCalledWith("driver-1", {
      photo_path: photoPath,
      driving_licence_image_path: licencePath,
      aadhaar_image_path: aadhaarPath,
    });
    expect(api.upsertAuto).toHaveBeenCalledWith("TS09AB1234");
  });

  it("removes uploaded documents and the inserted row when a later upload fails", async () => {
    const uploadError = new Error("Upload failed");
    const { api } = createApi({
      upload: (_path, _file) => {
        if (api.upload.mock.calls.length === 2) throw uploadError;
      },
    });

    await expect(registerDriver(registrationInput(), api)).rejects.toThrow("Upload failed");

    const [[firstUploadedPath]] = api.upload.mock.calls;
    expect(api.removeFiles).toHaveBeenCalledWith([firstUploadedPath]);
    expect(api.remove).toHaveBeenCalledWith("driver-1");
    expect(api.update).not.toHaveBeenCalled();
  });

  it("rejects a missing required document before inserting a row", async () => {
    const { api } = createApi();
    const input = registrationInput({ files: { photo: file("photo.png"), drivingLicence: file("licence.png") } });

    await expect(registerDriver(input, api)).rejects.toThrow("Aadhaar image is required.");

    expect(api.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid document before inserting a row", async () => {
    const { api } = createApi();
    const input = registrationInput({ files: { ...registrationInput().files, photo: file("photo.pdf", "application/pdf") } });

    await expect(registerDriver(input, api)).rejects.toThrow("Driver photo must be a JPEG, PNG, or WebP image.");

    expect(api.insert).not.toHaveBeenCalled();
  });
});

describe("saveDriver", () => {
  it("updates normalized database fields without replacing any current document paths", async () => {
    const current = currentDriver();
    const { api, events } = createApi({ saved: current });

    await expect(saveDriver({ current, values, replacements: {} }, api)).resolves.toEqual(current);

    expect(events.map(([operation]) => operation)).toEqual(["update", "upsertAuto"]);
    expect(api.update).toHaveBeenCalledWith("driver-1", normalized);
    expect(api.upsertAuto).toHaveBeenCalledWith("TS09AB1234");
  });

  it("replaces only Aadhaar and deletes its old object after the row update", async () => {
    const current = currentDriver();
    const replacement = file("new-aadhaar.png");
    const { api, events } = createApi();

    await saveDriver({ current, values, replacements: { aadhaar: replacement } }, api);

    const [[newPath]] = api.upload.mock.calls;
    expect(api.update).toHaveBeenCalledWith("driver-1", {
      ...normalized,
      aadhaar_image_path: newPath,
    });
    expect(api.removeFiles).toHaveBeenCalledWith(["driver-1/aadhaar-old.png"]);
    expect(events.map(([operation]) => operation)).toEqual([
      "upload", "update", "upsertAuto", "removeFiles",
    ]);
  });

  it("removes newly uploaded replacements and retains old documents when the row update fails", async () => {
    const updateError = new Error("Update failed");
    const current = currentDriver();
    const { api, events } = createApi();
    api.update.mockImplementation(async (id, patch) => {
      events.push(["update", id, patch]);
      throw updateError;
    });

    await expect(saveDriver({ current, values, replacements: { aadhaar: file("new-aadhaar.png") } }, api))
      .rejects.toThrow("Update failed");

    const [[newPath]] = api.upload.mock.calls;
    expect(api.removeFiles).toHaveBeenCalledWith([newPath]);
    expect(api.removeFiles).not.toHaveBeenCalledWith(["driver-1/aadhaar-old.png"]);
    expect(events.map(([operation]) => operation)).toEqual(["upload", "update", "removeFiles"]);
  });
});
