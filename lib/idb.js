// Minimal IndexedDB wrapper for storing downloaded ad videos on the tablet.
// One object store, keyed by ad id, holding the video blob plus enough
// metadata to decide whether a re-download is needed.

const DB_NAME = "smato-player";
const DB_VERSION = 1;
const STORE = "videos";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(store, method, ...args) {
  return new Promise((resolve, reject) => {
    const req = store[method](...args);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  const result = await fn(store);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAllVideos() {
  const result = await withStore("readonly", (store) => request(store, "getAll"));
  return result || [];
}

export async function putVideo(record) {
  // record: { id, blob, filePath, title, sortOrder, updatedAt }
  await withStore("readwrite", (store) => request(store, "put", record));
}

export async function deleteVideos(ids) {
  await withStore("readwrite", async (store) => {
    for (const id of ids) store.delete(id);
  });
}
