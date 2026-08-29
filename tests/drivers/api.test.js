import { describe, expect, it } from "vitest";
import { createDriverApi, documentPath } from "@/lib/drivers/api";

const DRIVER_COLUMNS = [
  "id", "name", "mobile", "auto_number_plate", "driving_licence_number", "aadhaar_number",
  "photo_path", "driving_licence_image_path", "aadhaar_image_path", "created_at", "updated_at",
].join(",");

function createFakeClient({ tableResult = { data: null, error: null }, storageResult = { data: null, error: null } } = {}) {
  const calls = [];
  const table = (name) => {
    const chain = {
      select(columns) {
        calls.push(["select", name, columns]);
        return chain;
      },
      order(column, options) {
        calls.push(["order", name, column, options]);
        return Promise.resolve(tableResult);
      },
      eq(column, value) {
        calls.push(["eq", name, column, value]);
        return chain;
      },
      maybeSingle() {
        calls.push(["maybeSingle", name]);
        return Promise.resolve(tableResult);
      },
      insert(values) {
        calls.push(["insert", name, values]);
        return chain;
      },
      update(values) {
        calls.push(["update", name, values]);
        return chain;
      },
      single() {
        calls.push(["single", name]);
        return Promise.resolve(tableResult);
      },
      delete() {
        calls.push(["delete", name]);
        return chain;
      },
      upsert(values, options) {
        calls.push(["upsert", name, values, options]);
        return Promise.resolve(tableResult);
      },
      then(resolve, reject) {
        return Promise.resolve(tableResult).then(resolve, reject);
      },
    };
    return chain;
  };
  const client = {
    from: table,
    storage: {
      from(bucket) {
        calls.push(["storage", bucket]);
        return {
          upload(path, file, options) {
            calls.push(["upload", bucket, path, file, options]);
            return Promise.resolve(storageResult);
          },
          remove(paths) {
            calls.push(["removeFiles", bucket, paths]);
            return Promise.resolve(storageResult);
          },
          createSignedUrls(paths, expiresIn) {
            calls.push(["createSignedUrls", bucket, paths, expiresIn]);
            return Promise.resolve(storageResult);
          },
        };
      },
    },
  };
  return { client, calls };
}

describe("documentPath", () => {
  it("uses the MIME-specific extension in a driver-scoped path", () => {
    expect(documentPath("driver-1", "photo", { type: "image/jpeg" }, "n1"))
      .toBe("driver-1/photo-n1.jpg");
    expect(documentPath("driver-1", "aadhaar", { type: "image/webp" }, "n2"))
      .toBe("driver-1/aadhaar-n2.webp");
  });
});

describe("driverApi", () => {
  it("lists only driver columns newest first", async () => {
    const rows = [{ id: "driver-1" }];
    const { client, calls } = createFakeClient({ tableResult: { data: rows, error: null } });

    await expect(createDriverApi(client).list()).resolves.toEqual(rows);
    expect(calls).toEqual([
      ["select", "drivers", DRIVER_COLUMNS],
      ["order", "drivers", "created_at", { ascending: false }],
    ]);
  });

  it("gets one driver by id with maybeSingle", async () => {
    const row = { id: "driver-1" };
    const { client, calls } = createFakeClient({ tableResult: { data: row, error: null } });

    await expect(createDriverApi(client).get("driver-1")).resolves.toEqual(row);
    expect(calls).toEqual([
      ["select", "drivers", DRIVER_COLUMNS],
      ["eq", "drivers", "id", "driver-1"],
      ["maybeSingle", "drivers"],
    ]);
  });

  it("inserts, updates, deletes, and upserts the related auto", async () => {
    const row = { id: "driver-1" };
    const { client, calls } = createFakeClient({ tableResult: { data: row, error: null } });
    const api = createDriverApi(client);

    await expect(api.insert({ name: "Ravi" })).resolves.toEqual(row);
    await expect(api.update("driver-1", { name: "Ravi Kumar" })).resolves.toEqual(row);
    await expect(api.remove("driver-1")).resolves.toBeUndefined();
    await expect(api.upsertAuto("TS09AB1234")).resolves.toBeUndefined();

    expect(calls).toEqual([
      ["insert", "drivers", { name: "Ravi" }],
      ["select", "drivers", DRIVER_COLUMNS],
      ["single", "drivers"],
      ["update", "drivers", { name: "Ravi Kumar" }],
      ["eq", "drivers", "id", "driver-1"],
      ["select", "drivers", DRIVER_COLUMNS],
      ["single", "drivers"],
      ["delete", "drivers"],
      ["eq", "drivers", "id", "driver-1"],
      ["upsert", "autos", { auto_number: "TS09AB1234" }, { onConflict: "auto_number" }],
    ]);
  });

  it("uploads to the private bucket using the file MIME type", async () => {
    const { client, calls } = createFakeClient();
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });

    await expect(createDriverApi(client).upload("driver-1/photo.jpg", file)).resolves.toBe("driver-1/photo.jpg");
    expect(calls).toEqual([
      ["storage", "driver-documents"],
      ["upload", "driver-documents", "driver-1/photo.jpg", file, { contentType: "image/jpeg", cacheControl: "3600" }],
    ]);
  });

  it("removes only present paths and signs them for ten minutes", async () => {
    const { client, calls } = createFakeClient({
      storageResult: {
        data: [{ path: "driver-1/photo.jpg", signedUrl: "https://signed.example/photo" }],
        error: null,
      },
    });
    const api = createDriverApi(client);

    await expect(api.removeFiles([null, "driver-1/photo.jpg", ""])).resolves.toBeUndefined();
    await expect(api.sign([null, "driver-1/photo.jpg", ""])).resolves.toEqual({
      "driver-1/photo.jpg": "https://signed.example/photo",
    });
    await expect(api.removeFiles([null, ""])).resolves.toBeUndefined();
    await expect(api.sign([null, ""])).resolves.toEqual({});

    expect(calls).toEqual([
      ["storage", "driver-documents"],
      ["removeFiles", "driver-documents", ["driver-1/photo.jpg"]],
      ["storage", "driver-documents"],
      ["createSignedUrls", "driver-documents", ["driver-1/photo.jpg"], 600],
    ]);
  });

  it("throws every Supabase error instead of returning incomplete results", async () => {
    const error = new Error("database unavailable");
    const { client } = createFakeClient({
      tableResult: { data: null, error },
      storageResult: { data: null, error },
    });
    const api = createDriverApi(client);
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await expect(api.list()).rejects.toBe(error);
    await expect(api.get("driver-1")).rejects.toBe(error);
    await expect(api.insert({ name: "Ravi" })).rejects.toBe(error);
    await expect(api.update("driver-1", { name: "Ravi" })).rejects.toBe(error);
    await expect(api.remove("driver-1")).rejects.toBe(error);
    await expect(api.upload("driver-1/photo.png", file)).rejects.toBe(error);
    await expect(api.removeFiles(["driver-1/photo.png"])).rejects.toBe(error);
    await expect(api.sign(["driver-1/photo.png"])).rejects.toBe(error);
    await expect(api.upsertAuto("TS09AB1234")).rejects.toBe(error);
  });
});
