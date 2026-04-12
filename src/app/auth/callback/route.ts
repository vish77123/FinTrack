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

      // Check and seed default categories if the user has none (e.g. first time Google login)
      if (user) {
        const { count } = await supabase
          .from("categories")
          .select("*", { count: 'exact', head: true })
          .eq("user_id", user.id);

        if (count === 0) {
          const defaultCategories = [
            { user_id: user.id, name: 'Income', icon: '💰', color: '#34C759', type: 'income', sort_order: 1 },
            { user_id: user.id, name: 'Food', icon: '🍔', color: '#FF9500', type: 'expense', sort_order: 2 },
            { user_id: user.id, name: 'Transport', icon: '🚗', color: '#636366', type: 'expense', sort_order: 3 },
            { user_id: user.id, name: 'Housing', icon: '🏠', color: '#6C63FF', type: 'expense', sort_order: 4 },
            { user_id: user.id, name: 'Entertainment', icon: '🎬', color: '#FF3B30', type: 'expense', sort_order: 5 },
          ];
          await supabase.from("categories").insert(defaultCategories);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
