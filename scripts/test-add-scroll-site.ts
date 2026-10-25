import sharp from "sharp";

async function addScrollAnimationSite() {
  const url = "https://linear.app";
  console.log(`Adding brand-new URL with scroll animations: ${url}`);

  const res = await fetch("http://localhost:3000/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, notes: "Linear landing page - tested for scroll reveal validation." }),
  });

  const status = res.status;
  const data = await res.json();
  console.log(`HTTP Status: ${status}`);
  console.log("Response:", JSON.stringify(data, null, 2));
}

addScrollAnimationSite().catch(console.error);
