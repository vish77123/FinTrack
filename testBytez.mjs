import Bytez from "bytez.js";
const bytez = new Bytez(process.env.BYTEZ_API_KEY || "dummy");
async function run() {
  const models = [
    "google/gemma-3-4b-it",
    "meta-llama/Llama-3-8b-chat-hf",
    "Qwen/Qwen2.5-7B-Instruct",
    "openai-community/gpt2"
  ];
  for (const m of models) {
    try {
      console.log("Testing:", m);
      const res = await bytez.model(m).run("Reply with exactly the word Hello");
      console.log(res);
    } catch (e) {
      console.error(e);
    }
  }
}
run();
