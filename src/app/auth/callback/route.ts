import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.session) {
      // If Google login, store the provider token for Gmail API access
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;
      const user = data.session.user;

      if (providerToken && user) {
        // Calculate expiry (Google tokens typically last 1 hour)
        const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
        const email = user.email || "";

        // Upsert gmail_tokens
        await supabase
          .from("gmail_tokens")
          .upsert({
            user_id: user.id,
            access_token: providerToken,
            refresh_token: providerRefreshToken || null,
            expires_at: expiresAt,
            email,
          }, { onConflict: "user_id" });

        // Ensure email_sync_settings row exists
        const { data: existingSettings } = await supabase
          .from("email_sync_settings")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existingSettings) {
          await supabase
            .from("email_sync_settings")
            .insert({
              user_id: user.id,
              approval_required: true,
              regex_enabled: true,
              llm_enabled: false,
              sync_interval_minutes: 60,
            });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
