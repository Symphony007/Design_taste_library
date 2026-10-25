import assert from "node:assert";

async function checkImageProxy() {
  const API_URL = "http://localhost:3000/api/entries";
  const PROXY_HOST = "http://localhost:5173";

  console.log(`[Check Image Proxy] Fetching entries from ${API_URL}...`);
  const res = await fetch(API_URL);
  assert.strictEqual(res.status, 200, `Expected 200 from API, got ${res.status}`);

  const data = await res.json();
  const entries = data.entries || [];
  assert.ok(entries.length > 0, "No entries found in library to test image proxy against.");

  const targetEntry = entries.find((e) => e.thumbnail_url || (e.images && e.images.length > 0));
  assert.ok(targetEntry, "No entry with images found in library.");

  const imageUrl = targetEntry.thumbnail_url || targetEntry.images[0].url;
  assert.ok(imageUrl, "Target entry has no image URL.");
  assert.ok(imageUrl.startsWith("/images/"), `Expected image URL to start with '/images/', got '${imageUrl}'`);

  const fullProxyUrl = `${PROXY_HOST}${imageUrl}`;
  console.log(`[Check Image Proxy] Requesting image through dev proxy: ${fullProxyUrl}`);

  const proxyRes = await fetch(fullProxyUrl);
  const status = proxyRes.status;
  const contentType = proxyRes.headers.get("content-type") || "";

  console.log(`[Check Image Proxy] Response status: ${status}`);
  console.log(`[Check Image Proxy] Content-Type: ${contentType}`);

  // Assertions that fail if image proxy breaks
  assert.strictEqual(status, 200, `Image request through dev proxy failed with HTTP ${status}`);
  assert.ok(
    contentType.startsWith("image/"),
    `Expected image/* Content-Type from dev proxy, but received '${contentType}' (likely SPA fallback)`
  );

  const buffer = await proxyRes.arrayBuffer();
  console.log(`[Check Image Proxy] Received binary image payload: ${buffer.byteLength} bytes`);
  assert.ok(buffer.byteLength > 1000, `Image payload unexpectedly small: ${buffer.byteLength} bytes`);

  console.log("[Check Image Proxy] PASS: Images are correctly served through the dev proxy.\n");
}

checkImageProxy().catch((err) => {
  console.error("\n[Check Image Proxy] FAILED:", err.message);
  process.exit(1);
});
