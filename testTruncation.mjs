import Bytez from "bytez.js";

const bytez = new Bytez(process.env.BYTEZ_API_KEY || "dummy");

async function run() {
  const prompt = "List numbers from 1 to 500.";
  try {
    const res = await bytez.model("google/gemma-4-E2B-it").run([
      { role: "user", content: prompt }
    ]);
    console.log("Output Length:", res.output?.length || res.output?.content?.length);
    console.log("Raw Output:", JSON.stringify(res.output).slice(0, 100));
  } catch (e) {
    console.error(e);
  }
}

run();
