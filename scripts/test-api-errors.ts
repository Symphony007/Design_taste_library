async function testErrors() {
  const testUrls = [
    "http://localhost:3000",
    "http://192.168.1.1",
    "https://thisdomaindoesnotexistatall12345abcde.com",
  ];

  console.log("=== QUESTION 12: INVALID / LOCALHOST / PRIVATE URLS ===");
  for (const url of testUrls) {
    console.log(`\nTesting POST /api/entries with URL: "${url}"`);
    try {
      const res = await fetch("http://localhost:3000/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      console.log(`Status code: ${res.status}`);
      console.log(`Response body:`, JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.log(`Network / Fetch error:`, err.message);
    }
  }

  console.log("\n=== QUESTION 13: ADDING THE SAME URL TWICE ===");
  const duplicateUrl = "https://theportobellocafe.com/";
  console.log(`Testing first attempt with URL: "${duplicateUrl}"`);
  const res1 = await fetch("http://localhost:3000/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: duplicateUrl }),
  });
  console.log(`First attempt status: ${res1.status}`);
  console.log(`First attempt response:`, await res1.json());

  console.log(`\nTesting second attempt immediately with same URL: "${duplicateUrl}"`);
  const res2 = await fetch("http://localhost:3000/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: duplicateUrl }),
  });
  console.log(`Second attempt status: ${res2.status}`);
  console.log(`Second attempt response:`, await res2.json());
}

testErrors().catch(console.error);
