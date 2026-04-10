import { parseBatchWithLLM } from './src/lib/email/llmParser';

async function test() {
  const res = await parseBatchWithLLM([{
    id: "msg_123",
    text: "HDFC BANK --> Dear Customer, Rs.449.00 has been debited from account 6842 to VPA saifsa5580@okicici MOHAMMED ASIF on 10-04-26. Your UPI transaction reference number is 278953167601. If you did not aut"
  }]);
  console.log("Result:", res);
}

test().catch(console.error);
