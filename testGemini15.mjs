import { GoogleGenAI } from "@google/genai";

async function run() {
  console.log("Testing gemini 1.5 flash...");
  const keys = [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY];
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!key) continue;
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: "Hello",
      });
      console.log(`Key ${i+1} SUCCESS:`, res.text);
    } catch (e) {
      console.error(`Key ${i+1} ERROR:`, e.status, e.message);
    }
  }
}
run();
