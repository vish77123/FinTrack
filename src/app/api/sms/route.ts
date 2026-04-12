import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize a standard supabase client utilizing the anon key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: Request) {
  try {
    // 1. Get Secret from URL or query params
    const { searchParams } = new URL(req.url);
    let secret = searchParams.get("secret");

    // Attempt to parse JSON body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Secret can also optionally be submitted in body
    if (!secret && body.secret) {
      secret = body.secret;
    }

    if (!secret) {
      return NextResponse.json({ error: "Missing webhook secret" }, { status: 401 });
    }

    const { sender, body: smsBody, received_at } = body;

    if (!sender || !smsBody) {
      return NextResponse.json({ error: "Missing 'sender' or 'body' in payload" }, { status: 400 });
    }

    // 2. Invoke our custom secure endpoint
    const { data, error } = await supabase.rpc("insert_sms_via_webhook", {
      secret: secret,
      p_sender: sender,
      p_body: smsBody,
      p_received_at: received_at ? new Date(received_at).toISOString() : new Date().toISOString()
    });

    if (error) {
      console.error("Supabase RPC Error:", error);
      if (error.message.includes("Invalid webhook secret")) {
        return NextResponse.json({ error: "Unauthorized: Invalid secret" }, { status: 401 });
      }
      return NextResponse.json({ error: "Internal Database Error" }, { status: 500 });
    }

    return NextResponse.json({ success: true, sms_id: data });
  } catch (e: any) {
    console.error("SMS webhook parsing error:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
