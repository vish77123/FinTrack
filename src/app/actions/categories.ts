"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const categorySchema = z.object({
  name: z.string().min(1, "Name is required."),
  type: z.enum(["income", "expense", "transfer"]),
  icon: z.string().optional(),
  color: z.string().optional(),
});

export async function addCategoryAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const rawData = {
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    icon: formData.get("icon") as string,
    color: formData.get("color") as string,
  };

  const validated = categorySchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const { data, error: dbError } = await supabase
    .from("categories")
    .insert({
      user_id: user.id,
      name: validated.data.name,
      type: validated.data.type,
      icon: validated.data.icon,
      color: validated.data.color,
      sort_order: 999, // default to end
    })
    .select("id")
    .single();

  if (dbError) {
    console.error("Add category error:", dbError);
    return { error: "Failed to create category." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/budgets");

  return { success: true, categoryId: data.id };
}

export async function deleteCategoryAction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error: dbError } = await supabase
    .from("categories")
    .update({ sort_order: -9999 })
    .eq("id", id)
    .eq("user_id", user.id);

  if (dbError) {
    console.error("Delete category error:", dbError);
    return { error: "Failed to delete category." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/settings");

  return { success: true };
}
