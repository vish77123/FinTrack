import { parseBatchWithLLM } from './src/lib/email/llmParser';

const emailsForLLM = [
  {
    id: "msg_123",
    text: "❗  You have done a UPI txn. Check details! HDFC BANK --> Dear Customer, Rs.449.00 has been debited from account 6842 to VPA saifsa5580@okicici MOHAMMED ASIF on 10-04-26. Your UPI transaction reference number is 278953167601. If you did not aut"
  }
];

async function test() {
  const llmResultsMap = await parseBatchWithLLM(emailsForLLM);
  console.log("Map contents:", llmResultsMap);
  
  const llmResult = llmResultsMap.get("msg_123");
  console.log("Got result for msg_123:", llmResult);
}
test().catch(console.error);
