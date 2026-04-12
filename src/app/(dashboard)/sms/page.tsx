import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SmsClient from "@/components/dashboard/SmsClient";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch webhook secret
  let { data: profile } = await supabase
    .from("profiles")
    .select("webhook_secret")
    .eq("id", user.id)
    .single();

  if (profile && !profile.webhook_secret) {
    const newSecret = crypto.randomUUID();
    const { data: updatedProfile } = await supabase
      .from("profiles")
      .update({ webhook_secret: newSecret })
      .eq("id", user.id)
      .select("webhook_secret")
      .single();
    profile = updatedProfile;
  }

  const webhookSecret = profile?.webhook_secret || "Generating...";

  // Fetch incoming SMS logs
  const { data: rawSms, error } = await supabase
    .from("raw_sms")
    .select("*")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Failed to fetch SMS:", error);
  }

  return (
    <SmsClient 
      webhookSecret={webhookSecret} 
      smsLogs={rawSms || []} 
    />
  );
}
