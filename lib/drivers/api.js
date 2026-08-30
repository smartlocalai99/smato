import { DRIVER_DOCUMENTS_BUCKET, supabase } from "@/lib/supabase";

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DRIVER_COLUMNS = [
  "id", "name", "mobile", "auto_number_plate", "driving_licence_number", "aadhaar_number",
  "photo_path", "driving_licence_image_path", "aadhaar_image_path", "last_paid_at", "created_at", "updated_at",
].join(",");

export function documentPath(driverId, kind, file, nonce = crypto.randomUUID()) {
  return `${driverId}/${kind}-${nonce}.${EXTENSIONS[file.type]}`;
}

export function createDriverApi(client) {
  return {
    async list() {
      const { data, error } = await client.from("drivers").select(DRIVER_COLUMNS).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async get(id) {
      const { data, error } = await client.from("drivers").select(DRIVER_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert(values) {
      const { data, error } = await client.from("drivers").insert(values).select(DRIVER_COLUMNS).single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await client.from("drivers").update(patch).eq("id", id).select(DRIVER_COLUMNS).single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await client.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    async upload(path, file) {
      const { error } = await client.storage.from(DRIVER_DOCUMENTS_BUCKET).upload(path, file, {
        contentType: file.type,
        cacheControl: "0",
      });
      if (error) throw error;
      return path;
    },
    async removeFiles(paths) {
      const presentPaths = paths.filter(Boolean);
      if (!presentPaths.length) return;
      const { error } = await client.storage.from(DRIVER_DOCUMENTS_BUCKET).remove(presentPaths);
      if (error) throw error;
    },
    async sign(paths) {
      const presentPaths = paths.filter(Boolean);
      if (!presentPaths.length) return {};
      const { data, error } = await client.storage.from(DRIVER_DOCUMENTS_BUCKET).createSignedUrls(presentPaths, 600);
      if (error) throw error;
      return Object.fromEntries(data.map((item) => [item.path, item.signedUrl]));
    },
    async upsertAuto(autoNumber) {
      const { error } = await client.from("autos").upsert({ auto_number: autoNumber }, { onConflict: "auto_number" });
      if (error) throw error;
    },
    async markPaid(id) {
      const { data, error } = await client
        .from("drivers")
        .update({ last_paid_at: new Date().toISOString() })
        .eq("id", id)
        .select(DRIVER_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
  };
}

export const driverApi = createDriverApi(supabase);
