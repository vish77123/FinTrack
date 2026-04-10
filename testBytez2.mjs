import fetch from "node-fetch";

async function run() {
  const apiKey = process.env.BYTEZ_API_KEY || "dummy";
  console.log("Testing Bytez openAI compatible endpoint with Qwen...");
  try {
    const res = await fetch("https://api.bytez.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "Qwen/Qwen2.5-7B-Instruct",
        messages: [{ role: "user", content: "Reply with the word 'HELLO'" }]
      })
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}
run();
