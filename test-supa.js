const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://qphotcvlwejzsxfuwtkq.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwaG90Y3Zsd2VqenN4ZnV3dGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NDE4MDUsImV4cCI6MjA5MTMxNzgwNX0.WdmRRrM1DGtwPD3MEV_JPZiZW78u1aG8dy_Ug-SP2Ig";
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch1() {
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      *,
      categories(name, color, icon),
      accounts!transactions_account_id_fkey(name)
    `)
    .limit(1);
    
  console.log("With constraint name:");
  console.log("Error:", error?.message || error);
  console.log("Data:", data);
}

async function testFetch2() {
  const { data, error } = await supabase
    .from("transactions")
    .select(`
      *,
      categories(name, color, icon),
      accounts!account_id(name)
    `)
    .limit(1);
    
  console.log("\nWith column name:");
  console.log("Error:", error?.message || error);
  console.log("Data:", data);
}

testFetch1().then(testFetch2);
