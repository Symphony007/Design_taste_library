async function testNotes() {
  const id = "20261023113143-theportobellocafe-com-tdik";
  const testNote = `Line 1: "Design is not just what it looks like and feels like."
Line 2: 'Simplicity is the ultimate sophistication.'
Line 3: Tested with emoji: 🚀 🎨 ☕
Line 4: End of note test.`;

  console.log("=== ORIGINAL NOTE ===");
  console.log(testNote);

  // 1. PATCH note
  const patchRes = await fetch(`http://localhost:3000/api/entries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: testNote }),
  });

  const patchData = await patchRes.json();
  console.log("\n=== PATCH RESPONSE STATUS ===", patchRes.status);

  // 2. GET note back
  const getRes = await fetch(`http://localhost:3000/api/entries/${id}`);
  const getData = await getRes.json();
  console.log("\n=== GET RESPONSE STATUS ===", getRes.status);
  console.log("\n=== RETRIEVED NOTE ===");
  console.log(getData.entry.notes);

  const matched = testNote === getData.entry.notes;
  console.log("\n=== EXACT ROUND-TRIP MATCH ===", matched);
}

testNotes().catch(console.error);
