import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Sidebar from "@/components/sidebar/Sidebar";
import NavigationProgress from "@/components/ui/NavigationProgress";
import DashboardLoading from "./loading";
import styles from "@/components/sidebar/sidebar.module.css";

// Force Next.js to completely disable caching for the entire dashboard
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const isPlaceholder = supabaseUrl.includes("placeholder");

  let userProfile = {
    displayName: "Rahul K.",
    email: "rahul@example.com",
  };

  if (!isPlaceholder) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    // Fetch profile data
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();

    userProfile = {
      displayName:
        profile?.display_name ||
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "User",
      email: user.email || "",
    };
  }

  return (
    <div className={styles.appLayout}>
      <NavigationProgress />
      <Sidebar user={userProfile} />
      <main className={styles.mainContent}>
        <Suspense fallback={<DashboardLoading />}>
          {children}
        </Suspense>
      </main>
    </div>
  );
}
