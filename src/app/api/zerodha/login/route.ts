import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apiKey = process.env.ZERODHA_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ZERODHA_API_KEY is not configured in .env.local" },
      { status: 500 }
    );
  }

  const kiteLoginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;
  redirect(kiteLoginUrl);
}
