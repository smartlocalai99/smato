# Driver Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure driver registration, listing, search, and editing inside the authenticated Smato admin dashboard.

**Architecture:** A shared client-side admin shell will protect every `/admin/*` route and provide navigation. Driver pages will use focused form/list components plus a Supabase adapter; pure validation and mutation orchestration stay independently testable, while Supabase RLS and a private bucket protect personal data and document images.

**Tech Stack:** Next.js 14 App Router, React 18, Supabase Auth/Postgres/Storage, Vitest, Testing Library, existing CSS token system.

**Spec:** `docs/superpowers/specs/2026-08-29-driver-management-design.md`

## Global Constraints

- One auto number plate can belong to only one registered driver.
- Mobile, auto number plate, Driving Licence, and Aadhaar values are unique.
- Mobile is normalized to exactly 10 digits; Aadhaar is normalized to exactly 12 digits.
- Auto plate and Driving Licence are normalized to uppercase without spaces.
- Driver photo, Driving Licence image, and Aadhaar image are mandatory on registration.
- Accepted files are JPEG, PNG, or WebP and each file is at most 5 MB.
- Driver records and documents are available only to authenticated admins.
- Full Aadhaar and Driving Licence values are displayed only on the authenticated edit route.
- Existing fleet, advertising, player, and team-access behavior must remain unchanged.
- UI action labels are exactly **Register driver**, **Save changes**, and **Replace image**.

---

### Task 1: Test Harness and Driver Validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.mjs`
- Create: `tests/setup.js`
- Create: `.eslintrc.json`
- Create: `lib/drivers/validation.js`
- Test: `tests/drivers/validation.test.js`

**Interfaces:**
- Produces: `normalizeDriverFields(values) -> normalizedValues`
- Produces: `validateDriverFields(values) -> Record<string, string>`
- Produces: `validateDriverFile(file, label) -> string | null`
- Produces: `maskAadhaar(value) -> string`
- Produces: `maskLicence(value) -> string`
- Produces: `filterDrivers(drivers, query) -> drivers[]`
- Produces: `mapDriverDbError(error) -> string`
- Produces: `MAX_DRIVER_FILE_BYTES`, `DRIVER_FILE_TYPES`

- [ ] **Step 1: Install the test dependencies and add scripts**

Run:

```bash
npm install --save-dev vitest@2.1.9 jsdom@25.0.1 @testing-library/react@16.1.0 @testing-library/jest-dom@6.6.3 eslint@8.57.1 eslint-config-next@14.2.35
```

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.mjs` with the `@` alias pointed at the repository root, `jsdom` as the environment, and `tests/setup.js` as the setup file. Import `@testing-library/jest-dom/vitest` from the setup file.

Create `.eslintrc.json` so the existing lint script is non-interactive:

```json
{ "extends": "next/core-web-vitals" }
```

- [ ] **Step 2: Write failing validation tests**

Cover these exact expectations in `tests/drivers/validation.test.js`:

```js
expect(normalizeDriverFields({
  name: "  Ravi Kumar  ", mobile: "+91 98765-43210",
  auto_number_plate: "ts 09 ab 1234", driving_licence_number: "ts 09 20230012345",
  aadhaar_number: "1234 5678 9012",
})).toEqual({
  name: "Ravi Kumar", mobile: "9876543210", auto_number_plate: "TS09AB1234",
  driving_licence_number: "TS0920230012345", aadhaar_number: "123456789012",
});
expect(validateDriverFields({ name: "", mobile: "123", auto_number_plate: "", driving_licence_number: "", aadhaar_number: "456" })).toMatchObject({
  name: expect.any(String), mobile: expect.any(String), auto_number_plate: expect.any(String),
  driving_licence_number: expect.any(String), aadhaar_number: expect.any(String),
});
expect(maskAadhaar("123456789012")).toBe("•••• •••• 9012");
expect(maskLicence("TS0920230012345")).toBe("•••••••••••2345");
```

Also test allowed/disallowed MIME types, the 5 MB boundary, case-insensitive search across name/mobile/plate/licence, and Postgres unique-constraint names for all four unique fields.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- tests/drivers/validation.test.js`

Expected: FAIL because `lib/drivers/validation.js` does not exist.

- [ ] **Step 4: Implement the validation module**

Use these constants and return field-keyed errors instead of throwing:

```js
export const MAX_DRIVER_FILE_BYTES = 5 * 1024 * 1024;
export const DRIVER_FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeDriverFields(values) {
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
```

Implement the remaining exports according to the Step 2 assertions. `mapDriverDbError` must inspect `error.constraint` first and then `error.message`, returning: “That mobile number is already registered.”, “That auto already has a registered driver.”, “That Driving Licence is already registered.”, or “That Aadhaar number is already registered.”; fall back to `error.message || "Couldn't save the driver."`.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test -- tests/drivers/validation.test.js`

Expected: all validation tests pass.

- [ ] **Step 6: Commit the validation foundation**

```bash
git add package.json package-lock.json vitest.config.mjs tests/setup.js .eslintrc.json lib/drivers/validation.js tests/drivers/validation.test.js
git commit -m "test: add driver validation foundation"
```

### Task 2: Private Driver Schema and Supabase Adapter

**Files:**
- Modify: `setup.sql`
- Modify: `lib/supabase.js`
- Create: `lib/drivers/api.js`
- Test: `tests/drivers/api.test.js`

**Interfaces:**
- Consumes: `mapDriverDbError(error)` from Task 1
- Produces: `DRIVER_DOCUMENTS_BUCKET = "driver-documents"`
- Produces: `driverApi.list()`, `driverApi.get(id)`, `driverApi.insert(values)`, `driverApi.update(id, patch)`, `driverApi.remove(id)`
- Produces: `driverApi.upload(path, file)`, `driverApi.removeFiles(paths)`, `driverApi.sign(paths)`, `driverApi.upsertAuto(autoNumber)`
- Produces: `documentPath(driverId, kind, file, nonce) -> string`

- [ ] **Step 1: Write failing adapter tests**

Use a chainable fake Supabase client and assert:

```js
expect(documentPath("driver-1", "photo", { type: "image/jpeg" }, "n1"))
  .toBe("driver-1/photo-n1.jpg");
expect(documentPath("driver-1", "aadhaar", { type: "image/webp" }, "n2"))
  .toBe("driver-1/aadhaar-n2.webp");
```

Assert `list()` selects only the driver columns, orders by `created_at` descending, `get(id)` uses `.eq("id", id).maybeSingle()`, uploads use the private bucket with the file MIME type, `sign(paths)` requests 10-minute URLs, and every Supabase error is thrown rather than silently ignored.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/drivers/api.test.js`

Expected: FAIL because the adapter exports do not exist.

- [ ] **Step 3: Extend the idempotent Supabase setup**

Append SQL that creates `drivers`, named unique constraints (`drivers_mobile_key`, `drivers_auto_number_plate_key`, `drivers_driving_licence_number_key`, `drivers_aadhaar_number_key`), an `updated_at` trigger, authenticated-only table policies, a private `driver-documents` bucket with a 5 MB limit and allowed MIME types, and authenticated select/insert/update/delete storage policies.

The file-path columns remain nullable only to support rollback-safe registration. Add a table check constraint requiring either all three paths are null or all three are non-null, preventing partial driver records. Do not change public policies on `autos` or `ads`.

Use this schema and policy shape (preceded by `drop policy if exists` for every named policy):

```sql
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  mobile text not null constraint drivers_mobile_key unique,
  auto_number_plate text not null constraint drivers_auto_number_plate_key unique,
  driving_licence_number text not null constraint drivers_driving_licence_number_key unique,
  aadhaar_number text not null constraint drivers_aadhaar_number_key unique,
  photo_path text,
  driving_licence_image_path text,
  aadhaar_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_documents_complete check (
    (photo_path is null and driving_licence_image_path is null and aadhaar_image_path is null)
    or
    (photo_path is not null and driving_licence_image_path is not null and aadhaar_image_path is not null)
  )
);

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists drivers_set_updated_at on drivers;
create trigger drivers_set_updated_at before update on drivers
for each row execute function set_updated_at();

alter table drivers enable row level security;
create policy "drivers_select_admin" on drivers for select using (auth.role() = 'authenticated');
create policy "drivers_insert_admin" on drivers for insert with check (auth.role() = 'authenticated');
create policy "drivers_update_admin" on drivers for update
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "drivers_delete_admin" on drivers for delete using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-documents', 'driver-documents', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "driver_documents_select_admin" on storage.objects for select
  using (bucket_id = 'driver-documents' and auth.role() = 'authenticated');
create policy "driver_documents_insert_admin" on storage.objects for insert
  with check (bucket_id = 'driver-documents' and auth.role() = 'authenticated');
create policy "driver_documents_update_admin" on storage.objects for update
  using (bucket_id = 'driver-documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'driver-documents' and auth.role() = 'authenticated');
create policy "driver_documents_delete_admin" on storage.objects for delete
  using (bucket_id = 'driver-documents' and auth.role() = 'authenticated');
```

- [ ] **Step 4: Implement the adapter**

Export the bucket constant from `lib/supabase.js`. In `lib/drivers/api.js`, export `createDriverApi(client)` for tests and `driverApi = createDriverApi(supabase)` for production. Normalize return values to data objects, throw on any `{ error }`, ignore null paths in `removeFiles`, and return signed URLs keyed by their original storage path.

Map MIME extensions exactly:

```js
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DRIVER_COLUMNS = [
  "id", "name", "mobile", "auto_number_plate", "driving_licence_number", "aadhaar_number",
  "photo_path", "driving_licence_image_path", "aadhaar_image_path", "created_at", "updated_at",
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
        cacheControl: "3600",
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
  };
}
```

- [ ] **Step 5: Run adapter and validation tests**

Run: `npm test -- tests/drivers/api.test.js tests/drivers/validation.test.js`

Expected: all tests pass.

- [ ] **Step 6: Validate SQL shape and commit**

Run: `rg -n "create table if not exists drivers|driver-documents|drivers_auto_number_plate_key|authenticated" setup.sql`

Expected: table, bucket, named constraint, and authenticated policies are present.

```bash
git add setup.sql lib/supabase.js lib/drivers/api.js tests/drivers/api.test.js
git commit -m "feat: add private driver data storage"
```

### Task 3: Transaction-Safe Driver Mutations

**Files:**
- Create: `lib/drivers/mutations.js`
- Test: `tests/drivers/mutations.test.js`

**Interfaces:**
- Consumes: `normalizeDriverFields`, `validateDriverFields`, `validateDriverFile`, `mapDriverDbError`
- Consumes: `driverApi` and `documentPath` from Task 2
- Produces: `registerDriver({ values, files }, api = driverApi) -> Promise<driver>`
- Produces: `saveDriver({ current, values, replacements }, api = driverApi) -> Promise<driver>`

- [ ] **Step 1: Write failing registration orchestration tests**

Use a fake API with Vitest spies. Verify the success call order: insert normalized values with null paths, upload `photo`, `driving-licence`, and `aadhaar`, update all three paths together, then upsert the auto.

Verify rollback behavior:

```js
await expect(registerDriver(input, apiWithSecondUploadFailure)).rejects.toThrow("Upload failed");
expect(api.removeFiles).toHaveBeenCalledWith([firstUploadedPath]);
expect(api.remove).toHaveBeenCalledWith(insertedDriver.id);
```

Verify missing or invalid files reject before `api.insert` runs.

- [ ] **Step 2: Write failing edit orchestration tests**

Verify no replacement keeps all current paths, a single Aadhaar replacement updates only its path, old files are removed only after the row update succeeds, newly uploaded replacements are removed when the update fails, and `upsertAuto` receives the normalized current plate.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- tests/drivers/mutations.test.js`

Expected: FAIL because `mutations.js` does not exist.

- [ ] **Step 4: Implement mutation orchestration**

Use `crypto.randomUUID()` for object nonces. Validate all text fields and files before writes. Throw an `Error` whose message is the first validation error. Pass only database columns to insert/update, never preview URLs or `File` objects. In each catch block, await rollback cleanup with `Promise.allSettled`, then throw `new Error(mapDriverDbError(error))`.

Use this explicit field mapping and rollback order:

```js
const DOCUMENTS = [
  { file: "photo", kind: "photo", path: "photo_path", label: "Driver photo" },
  { file: "drivingLicence", kind: "driving-licence", path: "driving_licence_image_path", label: "Driving Licence image" },
  { file: "aadhaar", kind: "aadhaar", path: "aadhaar_image_path", label: "Aadhaar image" },
];

export async function registerDriver({ values, files }, api = driverApi) {
  const normalized = normalizeDriverFields(values);
  assertValidFieldsAndFiles(normalized, files, true);
  let inserted;
  const uploaded = [];
  try {
    inserted = await api.insert({
      ...normalized, photo_path: null, driving_licence_image_path: null, aadhaar_image_path: null,
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
      const file = replacements[document.file];
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
    if (rowUpdated) rollback.push(api.update(current.id, {
      name: current.name,
      mobile: current.mobile,
      auto_number_plate: current.auto_number_plate,
      driving_licence_number: current.driving_licence_number,
      aadhaar_number: current.aadhaar_number,
      photo_path: current.photo_path,
      driving_licence_image_path: current.driving_licence_image_path,
      aadhaar_image_path: current.aadhaar_image_path,
    }));
    if (uploaded.length) rollback.push(api.removeFiles(uploaded));
    await Promise.allSettled(rollback);
    throw new Error(mapDriverDbError(error));
  }
}
```

Implement `assertValidFieldsAndFiles` in the same module: call `validateDriverFields`, validate every present file with `validateDriverFile`, require all three when `registration === true`, and throw the first error in `name`, `mobile`, `auto_number_plate`, `driving_licence_number`, `aadhaar_number`, `photo`, `drivingLicence`, `aadhaar` order.

- [ ] **Step 5: Run mutation tests and verify GREEN**

Run: `npm test -- tests/drivers/mutations.test.js`

Expected: all registration and edit success/rollback cases pass.

- [ ] **Step 6: Commit mutation orchestration**

```bash
git add lib/drivers/mutations.js tests/drivers/mutations.test.js
git commit -m "feat: add safe driver save workflows"
```

### Task 4: Shared Authenticated Admin Shell

**Files:**
- Create: `components/admin/AdminShell.js`
- Create: `components/admin/SignIn.js`
- Create: `app/admin/layout.js`
- Modify: `app/admin/page.js`
- Test: `tests/admin/AdminShell.test.js`

**Interfaces:**
- Produces: `AdminShell({ children })`
- Produces: `useAdminSession() -> Session`
- Produces: admin links `/admin`, `/admin/drivers`, `/admin/drivers/new`
- Consumes: `useAdminSession()` in existing `TeamAccess`

- [ ] **Step 1: Write failing shell tests**

Mock Supabase auth and `next/navigation`. Verify an unresolved session renders the accessible text “Loading admin…”, a null session renders the existing sign-in fields, and an authenticated session renders all three navigation links plus children. Verify **Sign out** calls `supabase.auth.signOut()`.

- [ ] **Step 2: Run the shell test and verify RED**

Run: `npm test -- tests/admin/AdminShell.test.js`

Expected: FAIL because `AdminShell` does not exist.

- [ ] **Step 3: Extract sign-in and implement the shell**

Move the current `SignIn` UI and login behavior unchanged into `components/admin/SignIn.js`. Implement an `AdminSessionContext`, perform `getSession()` plus `onAuthStateChange()` once in `AdminShell`, and unsubscribe on unmount. Render a sticky admin header with brand, navigation, and sign-out. Use `usePathname()` and `aria-current="page"` for the active link.

Use a visible loading state instead of the current blank screen:

```jsx
if (session === undefined) return <div className="admin-loading" role="status">Loading admin…</div>;
if (!session) return <SignIn />;
```

- [ ] **Step 4: Put all admin routes under the shell**

Render `<AdminShell>{children}</AdminShell>` from `app/admin/layout.js`. Remove session/auth/header ownership from `app/admin/page.js`, keep its dashboard sections unchanged, and read the session with `useAdminSession()` for `TeamAccess`.

- [ ] **Step 5: Run shell tests and build**

Run: `npm test -- tests/admin/AdminShell.test.js && npm run build`

Expected: shell tests pass and Next production build exits 0 with `/admin` available.

- [ ] **Step 6: Commit the shared shell**

```bash
git add components/admin/AdminShell.js components/admin/SignIn.js app/admin/layout.js app/admin/page.js tests/admin/AdminShell.test.js
git commit -m "feat: add shared admin navigation"
```

### Task 5: Reusable Driver Form and Registration Page

**Files:**
- Create: `components/drivers/DocumentUpload.js`
- Create: `components/drivers/DriverForm.js`
- Create: `app/admin/drivers/new/page.js`
- Test: `tests/drivers/DriverForm.test.js`
- Test: `tests/drivers/NewDriverPage.test.js`

**Interfaces:**
- Produces: `DriverForm({ mode, initialValues, existingUrls, onSubmit, busy })`
- Produces: `onSubmit({ values, files })` in registration mode
- Consumes: `registerDriver()` from Task 3

- [ ] **Step 1: Write failing form tests**

Render registration mode and verify labels for all five text fields and all three required uploads. Submit empty fields and assert inline errors are rendered and `onSubmit` is not called. Upload valid `File` objects, fill valid values, submit, and assert normalized data plus `{ photo, drivingLicence, aadhaar }` files reach `onSubmit`.

Verify each upload renders guidance “JPEG, PNG or WebP · max 5 MB”, an image preview, and the document-status strip changes from **Missing** to **Ready**.

- [ ] **Step 2: Run form tests and verify RED**

Run: `npm test -- tests/drivers/DriverForm.test.js`

Expected: FAIL because the form does not exist.

- [ ] **Step 3: Implement upload and form components**

Use stable top-level components, controlled text inputs, field-keyed errors, and `URL.createObjectURL()` previews revoked in effect cleanup. Registration uses `required` file inputs; edit mode shows current images and labels optional replacements **Replace image**. Put form status in an element with `role="alert"` and set `aria-invalid`/`aria-describedby` for invalid controls.

- [ ] **Step 4: Run form tests and verify GREEN**

Run: `npm test -- tests/drivers/DriverForm.test.js`

Expected: all form, preview, and validation tests pass.

- [ ] **Step 5: Write the failing registration-page test**

Mock `registerDriver` and `next/navigation`. Verify the page heading is **Register a driver**, a successful submit calls `router.push("/admin/drivers?created=1")`, and a rejected mutation displays its message while preserving form values.

- [ ] **Step 6: Implement and verify the registration page**

Create a client page that owns the busy/error state and passes `registerDriver` to `DriverForm`.

Run: `npm test -- tests/drivers/NewDriverPage.test.js tests/drivers/DriverForm.test.js`

Expected: both test files pass.

- [ ] **Step 7: Commit driver registration UI**

```bash
git add components/drivers/DocumentUpload.js components/drivers/DriverForm.js app/admin/drivers/new/page.js tests/drivers/DriverForm.test.js tests/drivers/NewDriverPage.test.js
git commit -m "feat: add driver registration form"
```

### Task 6: Searchable Driver List

**Files:**
- Create: `components/drivers/DriverList.js`
- Create: `app/admin/drivers/page.js`
- Test: `tests/drivers/DriverList.test.js`
- Test: `tests/drivers/DriversPage.test.js`

**Interfaces:**
- Consumes: `driverApi.list()`, `driverApi.sign(paths)`, `filterDrivers`, `maskAadhaar`, `maskLicence`
- Produces: edit links in the form `/admin/drivers/<id>/edit`

- [ ] **Step 1: Write failing list component tests**

With two fixtures, verify both names/photos/plates/mobiles render, Aadhaar and DL are masked, full identifiers are absent, and each **Edit** link targets its driver ID. Type a plate/name/mobile/licence query and verify only the matching driver remains. Type an unmatched query and verify **No drivers match your search.**

- [ ] **Step 2: Run the list test and verify RED**

Run: `npm test -- tests/drivers/DriverList.test.js`

Expected: FAIL because `DriverList` does not exist.

- [ ] **Step 3: Implement the responsive list component**

Render semantic table markup on desktop and CSS-driven card presentation on mobile without duplicating sensitive content. Give image thumbnails descriptive alt text. Show the three-marker document status strip based on non-null paths. Use `filterDrivers` for derived search results rather than storing a second array in state.

- [ ] **Step 4: Write page-state tests**

Mock `driverApi`. Verify loading status, load failure with a **Try again** button, an empty state linking to `/admin/drivers/new`, and success query `?created=1` displaying **Driver registered.**. Verify `driverApi.sign()` is called only with photo paths, not DL or Aadhaar paths.

- [ ] **Step 5: Implement the list page and verify**

Load rows and photo signed URLs in sequence after auth shell resolution; keep the document images private until edit. Retry reruns the same loader.

Run: `npm test -- tests/drivers/DriverList.test.js tests/drivers/DriversPage.test.js`

Expected: all list and page-state tests pass.

- [ ] **Step 6: Commit the driver directory**

```bash
git add components/drivers/DriverList.js app/admin/drivers/page.js tests/drivers/DriverList.test.js tests/drivers/DriversPage.test.js
git commit -m "feat: add searchable driver directory"
```

### Task 7: Driver Edit Page

**Files:**
- Create: `app/admin/drivers/[id]/edit/page.js`
- Test: `tests/drivers/EditDriverPage.test.js`

**Interfaces:**
- Consumes: `driverApi.get(id)`, `driverApi.sign(paths)`, `saveDriver()`, `DriverForm`
- Produces: update success navigation `/admin/drivers?updated=1`

- [ ] **Step 1: Write failing edit-page tests**

Mock route params, API, mutation, and navigation. Verify:

```js
expect(await screen.findByDisplayValue("Ravi Kumar")).toBeInTheDocument();
expect(driverApi.sign).toHaveBeenCalledWith([
  "driver-1/photo.jpg", "driver-1/driving-licence.jpg", "driver-1/aadhaar.jpg",
]);
```

Verify missing driver displays **Driver not found** and a back link, load errors offer **Try again**, saving without replacement files preserves existing URLs, a successful save pushes `/admin/drivers?updated=1`, and a duplicate-auto rejection stays on the form with its plain-language message.

- [ ] **Step 2: Run the edit test and verify RED**

Run: `npm test -- tests/drivers/EditDriverPage.test.js`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the edit page**

Read `params.id`, load the row, request signed URLs for all three current paths, and pass them to `DriverForm` in edit mode. Keep `current` data for `saveDriver`, render explicit loading/error/not-found states, and never place raw Aadhaar/DL values in a list route or query string.

- [ ] **Step 4: Run edit and mutation tests**

Run: `npm test -- tests/drivers/EditDriverPage.test.js tests/drivers/mutations.test.js`

Expected: all edit, preservation, replacement, and rollback tests pass.

- [ ] **Step 5: Commit editing**

```bash
git add app/admin/drivers/[id]/edit/page.js tests/drivers/EditDriverPage.test.js
git commit -m "feat: add driver detail editing"
```

### Task 8: Responsive Styling, Documentation, and End-to-End Verification

**Files:**
- Modify: `app/globals.css`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-29-driver-management.md` (check completed steps only)

**Interfaces:**
- Consumes all routes and components from Tasks 1–7.
- Produces a mobile- and desktop-ready authenticated driver workflow.

- [ ] **Step 1: Add admin navigation and driver UI styles**

Extend existing `.console` tokens. Add styles for `.admin-nav`, `.admin-nav__link`, `.driver-page`, `.driver-form`, `.document-upload`, `.document-status`, `.driver-table`, `.driver-card`, and state banners. Use a two-column form above 760 px, one column below it, a compact navigation rail at wide widths, and horizontally scrollable navigation on narrow widths. Preserve `:focus-visible`, add no unnecessary animation, and respect `prefers-reduced-motion`.

- [ ] **Step 2: Run component tests after styling**

Run: `npm test`

Expected: all test files pass with zero failures.

- [ ] **Step 3: Update setup and route documentation**

Update `README.md` to list the three driver routes, explain the one-auto/one-driver rule and private documents, and add “run `setup.sql` again” to Supabase upgrade instructions. Do not include real Aadhaar, DL, mobile, or storage URLs in examples.

- [ ] **Step 4: Run static and production verification**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: each command exits 0 with no lint, compilation, or whitespace errors.

- [ ] **Step 5: Verify the UI in a real browser**

Start `npm run dev` and inspect at 1440×900 and 390×844. With a connected Supabase project after running `setup.sql`, verify:

1. `/admin`, `/admin/drivers`, and `/admin/drivers/new` share the shell and require sign-in.
2. Registering a valid driver with three under-5-MB images redirects to `?created=1` and shows **Driver registered.**
3. Search finds that driver by name, mobile, plate, and DL while displaying masked Aadhaar/DL.
4. Edit loads all full details and signed private images.
5. Changing text plus one image redirects to `?updated=1` and leaves the other two images intact.
6. Reusing the same auto number rejects the second driver with **That auto already has a registered driver.**
7. At both viewport sizes, labels, previews, navigation, list/cards, focus states, and actions are visible without horizontal page overflow.

If the local Supabase environment is not configured, perform items 1 and 7 plus mocked automated flows, and state clearly that live storage/RLS verification remains dependent on running `setup.sql` against the connected project.

- [ ] **Step 6: Final requirements audit**

Re-read `docs/superpowers/specs/2026-08-29-driver-management-design.md` and confirm each scoped item has code or a passing test. Run `git status --short` and inspect `git diff HEAD^ --stat` before claiming completion.

- [ ] **Step 7: Commit final presentation and documentation**

```bash
git add app/globals.css README.md docs/superpowers/plans/2026-08-29-driver-management.md
git commit -m "docs: finish driver management workflow"
```
