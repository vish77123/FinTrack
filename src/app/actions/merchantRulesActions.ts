"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getMerchantRulesAction() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { rules: [] };

  const { data } = await supabase
    .from("merchant_rules")
    .select(`
      id,
      synced_name,
      renamed_to,
      category_id,
      categories(name)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return { rules: data || [] };
}

export async function createMerchantRuleAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const syncedName = formData.get("synced_name") as string;
  const renamedTo = formData.get("renamed_to") as string;
  const categoryId = formData.get("category_id") as string || null;

  if (!syncedName || !renamedTo) {
    return { error: "Original name and new name are required." };
  }

  const { error } = await supabase
    .from("merchant_rules")
    .insert({
      user_id: user.id,
      synced_name: syncedName,
      renamed_to: renamedTo,
      category_id: categoryId,
    });

  if (error) {
    if (error.code === "23505") { // Unique violation
      return { error: "A rule for this original name already exists." };
    }
    console.error("Create Merchant Rule Error:", error);
    return { error: "Failed to create rule." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateMerchantRuleAction(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const renamedTo = formData.get("renamed_to") as string;
  const categoryId = formData.get("category_id") as string || null;

  if (!renamedTo) {
    return { error: "New name is required." };
  }

  const { error } = await supabase
    .from("merchant_rules")
    .update({
      renamed_to: renamedTo,
      category_id: categoryId,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Update Merchant Rule Error:", error);
    return { error: "Failed to update rule." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteMerchantRuleAction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("merchant_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Delete Merchant Rule Error:", error);
    return { error: "Failed to delete rule." };
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { success: true };
}
