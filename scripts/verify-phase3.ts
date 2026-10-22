import { db } from "../src/db/index.js";
import fs from "node:fs";

const BASE_URL = "http://localhost:3000";

async function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

async function run() {
  console.log("==================================================");
  console.log(" PHASE 3 API VERIFICATION SUITE");
  console.log("==================================================\n");

  // Reset database entries before starting
  db.exec("DELETE FROM entries;");

  // 1. Invalid URL -> Expect 400
  console.log("[Test 1] Testing invalid URL...");
  const res1 = await fetch(`${BASE_URL}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "not-a-valid-url" }),
  });
  const data1 = await res1.json();
  await assert(res1.status === 400, `Expected 400 for bad URL, got ${res1.status}`);
  await assert(typeof data1.error === "string", `Received error message: "${data1.error}"`);

  // 2. Unreachable site -> Expect 502
  console.log("\n[Test 2] Testing unreachable site...");
  const res2 = await fetch(`${BASE_URL}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://this-domain-does-not-exist-taste-xyz123.com" }),
  });
  const data2 = await res2.json();
  await assert(res2.status === 502, `Expected 502 for unreachable domain, got ${res2.status}`);
  await assert(data2.error.includes("Capture failed"), `Received clear error: "${data2.error}"`);

  // 3. Add URL 1: https://example.com
  console.log("\n[Test 3] Adding first URL: https://example.com ...");
  const res3 = await fetch(`${BASE_URL}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" }),
  });
  const data3 = await res3.json();
  await assert(res3.status === 201, `Expected 201 Created, got ${res3.status}`);
  const entry1 = data3.entry;
  await assert(Boolean(entry1?.id), `Created entry 1 with ID: ${entry1?.id}`);
  await assert(entry1.url.startsWith("https://example.com"), `Normalized URL matches: ${entry1.url}`);

  // 4. Duplicate URL -> Expect 409 Conflict
  console.log("\n[Test 4] Testing duplicate submission without force: true ...");
  const res4 = await fetch(`${BASE_URL}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" }),
  });
  const data4 = await res4.json();
  await assert(res4.status === 409, `Expected 409 Conflict for duplicate, got ${res4.status}`);
  await assert(data4.existingEntry?.id === entry1.id, `Returned existing entry ID in conflict response`);

  // 5. Add URL 2: https://httpbin.org/html (lightweight static page)
  console.log("\n[Test 5] Adding second URL: https://httpbin.org/html ...");
  const res5 = await fetch(`${BASE_URL}/api/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://httpbin.org/html" }),
  });
  const data5 = await res5.json();
  await assert(res5.status === 201, `Expected 201 Created for second URL, got ${res5.status}`);
  const entry2 = data5.entry;
  await assert(Boolean(entry2?.id), `Created entry 2 with ID: ${entry2?.id}`);

  // 6. List all entries -> Expect at least 2, newest first
  console.log("\n[Test 6] Listing all entries...");
  const res6 = await fetch(`${BASE_URL}/api/entries`);
  const data6 = await res6.json();
  await assert(res6.status === 200, `Expected 200 OK for list`);
  await assert(data6.entries.length >= 2, `Found ${data6.entries.length} entries`);
  await assert(data6.entries[0].id === entry2.id, `Newest entry (${entry2.id}) is listed first`);

  // 7. PATCH entry 1 -> Update category, tags, notes
  console.log(`\n[Test 7] Patching entry 1 (${entry1.id})...`);
  const res7 = await fetch(`${BASE_URL}/api/entries/${entry1.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "minimalism",
      tags: ["clean", "typography", "reference"],
      notes: "Reference for minimal typography layout.",
    }),
  });
  const data7 = await res7.json();
  await assert(res7.status === 200, `Expected 200 OK for PATCH`);
  await assert(data7.entry.category === "minimalism", `Category updated to 'minimalism'`);
  await assert(Array.isArray(data7.entry.tags) && data7.entry.tags.includes("clean"), `Tags updated to array containing 'clean'`);
  await assert(data7.entry.notes.includes("typography"), `Notes saved`);

  // 8. Filter by tag: ?tag=clean
  console.log("\n[Test 8] Filtering entries by ?tag=clean ...");
  const res8 = await fetch(`${BASE_URL}/api/entries?tag=clean`);
  const data8 = await res8.json();
  await assert(data8.entries.length === 1, `Filter returned exactly 1 matching entry`);
  await assert(data8.entries[0].id === entry1.id, `Matched entry ID: ${entry1.id}`);

  // 9. GET single entry /api/entries/:id
  console.log(`\n[Test 9] Fetching single entry ${entry1.id}...`);
  const res9 = await fetch(`${BASE_URL}/api/entries/${entry1.id}`);
  const data9 = await res9.json();
  await assert(res9.status === 200, `Expected 200 OK for GET by ID`);
  await assert(Array.isArray(data9.entry.step_images), `Returns step_images array`);
  await assert(data9.entry.step_images.length > 0, `Contains step images (${data9.entry.step_images.length})`);
  await assert(data9.entry.full_page_url.includes("/screenshots/"), `Returns full_page_url`);

  // 10. Verify static screenshot serving
  console.log("\n[Test 10] Verifying static screenshot serving at /screenshots/ ...");
  const imageUrl = `${BASE_URL}${data9.entry.full_page_url}`;
  const res10 = await fetch(imageUrl);
  await assert(res10.status === 200, `Static image fetch returned 200 OK (${imageUrl})`);
  await assert(res10.headers.get("content-type")?.includes("image/png") === true, `Content-type is image/png`);

  // 11. DELETE entry 2 and verify disk files removed
  console.log(`\n[Test 11] Deleting entry 2 (${entry2.id}) and verifying disk cleanup...`);
  const diskFolder = entry2.steps_dir ? entry2.steps_dir.replace(/[\\/]steps$/, "") : "";
  await assert(fs.existsSync(diskFolder), `Screenshot folder exists before deletion: ${diskFolder}`);

  const res11 = await fetch(`${BASE_URL}/api/entries/${entry2.id}`, {
    method: "DELETE",
  });
  const data11 = await res11.json();
  await assert(res11.status === 200 && data11.ok === true, `Delete returned ok: true`);

  // Confirm database row is gone
  const res11b = await fetch(`${BASE_URL}/api/entries/${entry2.id}`);
  await assert(res11b.status === 404, `GET after DELETE returned 404 Not Found`);

  // Confirm disk files are gone
  await assert(!fs.existsSync(diskFolder), `Disk folder successfully deleted: ${diskFolder}`);

  console.log("\n==================================================");
  console.log(" ALL 11 API VERIFICATION TESTS PASSED!");
  console.log("==================================================\n");
}

run().catch((err) => {
  console.error("Test failed with unexpected error:", err);
  process.exit(1);
});
