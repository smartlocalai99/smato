// GPS fixes waiting to be uploaded, kept on the tablet itself so a weak
// signal (or a reboot) doesn't lose them. Every fix goes in here first and
// leaves only once the database has accepted it — before, a fix taken
// while the signal was down was simply dropped, so an auto that drove all
// day through patchy coverage showed a fraction of its real distance.
// Each fix keeps the time it was taken, so a late upload still lands in
// the right place on the route.
const QUEUE_KEY = "smato.pendingFixes";
// About two days of fixes at one every 5 minutes; past that the oldest go.
const MAX_QUEUED = 600;
// Fixes per upload — one request for a whole stretch without signal.
const BATCH_SIZE = 100;

function load() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function save(fixes) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(fixes.slice(-MAX_QUEUED)));
  } catch {
    // Storage full or blocked — best effort, like the ads snapshot.
  }
}

export function queueFix(fix) {
  save([...load(), fix]);
}

export function pendingFixCount() {
  return load().length;
}

let flushing = false;

// Uploads everything queued, oldest first, in batches. `insertRows` gets an
// array of rows and resolves to { error }. Stops at the first failure and
// keeps the rest for next time; only one flush ever runs at a time.
export async function flushFixes(insertRows) {
  if (flushing) return;
  flushing = true;
  try {
    for (let queue = load(); queue.length; queue = load()) {
      const batch = queue.slice(0, BATCH_SIZE);
      const { error } = await insertRows(batch);
      if (error) return;
      // Fixes added while the upload was in flight sit after this batch.
      save(load().slice(batch.length));
    }
  } catch {
    // Network threw instead of returning an error — same thing: try later.
  } finally {
    flushing = false;
  }
}
