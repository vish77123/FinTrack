import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(".env.local") });

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY });
  const prompt = `You are an expert financial extraction engine.
Parse ALL of the following 1 bank alert emails and return a JSON ARRAY of results.

For EACH email, extract:
1. "emailId" — the ID provided in the header (copy it exactly)
2. "amount" — clean number (e.g. 500.50)
3. "merchant" — payee name, cleaned up
4. "type" — "expense" if debited/spent/paid, "income" if credited/received
5. "accountLast4" — 4-digit account/card reference if present
6. "date" — ISO 8601 date string if explicitly mentioned in text

If an email is NOT a monetary transaction, still include it with emailId and all other fields null.

--- EMAIL 1 (ID: msg_123) ---
❗  You have done a UPI txn. Check details! HDFC BANK --> Dear Customer, Rs.449.00 has been debited from account 6842 to VPA saifsa5580@okicici MOHAMMED ASIF on 10-04-26. Your UPI transaction reference number is 278953167601. If you did not aut
`;

  console.log("Sending prompt...");
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              emailId: { type: "STRING" },
              amount: { type: "NUMBER" },
              merchant: { type: "STRING" },
              type: { type: "STRING", enum: ["income", "expense"] },
              accountLast4: { type: "STRING" },
              date: { type: "STRING" },
            },
            required: ["emailId"],
          },
        },
      },
    });
    console.log("Response:", response.text);
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
