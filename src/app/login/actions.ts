"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithEmail(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signUpWithEmail(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Pre-seed default categories for the newly signed up user
  if (data?.user) {
    const defaultCategories = [
      { user_id: data.user.id, name: 'Income', icon: '💰', color: '#34C759', type: 'income', sort_order: 1 },
      { user_id: data.user.id, name: 'Food', icon: '🍔', color: '#FF9500', type: 'expense', sort_order: 2 },
      { user_id: data.user.id, name: 'Transport', icon: '🚗', color: '#636366', type: 'expense', sort_order: 3 },
      { user_id: data.user.id, name: 'Housing', icon: '🏠', color: '#6C63FF', type: 'expense', sort_order: 4 },
      { user_id: data.user.id, name: 'Entertainment', icon: '🎬', color: '#FF3B30', type: 'expense', sort_order: 5 },
    ];
    await supabase.from("categories").insert(defaultCategories);
  }

  redirect("/dashboard");
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/auth/callback?next=/settings`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Check your email for a reset link" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
