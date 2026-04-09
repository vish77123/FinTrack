"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const goalSchema = z.object({
  name: z.string().min(2, "Goal name is too short."),
  target_amount: z.number().positive("Target amount must be greater than zero."),
  target_date: z.string().datetime().optional().nullable(),
  color: z.string().optional(),
  icon: z.string().optional()
});

export async function addGoalAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const rawAmount = formData.get("target_amount") as string;
  const rawDate = formData.get("target_date") as string;

  const rawData = {
    name: formData.get("name") as string,
    target_amount: rawAmount ? parseFloat(rawAmount) : 0,
    target_date: rawDate ? new Date(rawDate).toISOString() : null,
    color: formData.get("color") as string || "#6C63FF",
    icon: formData.get("icon") as string || "🎯"
  };

  const validated = goalSchema.safeParse(rawData);

  if (!validated.success) {
    return { error: validated.error.issues[0].message };
  }

  const payload = validated.data;

  const { error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      name: payload.name,
      target_amount: payload.target_amount,
      target_date: payload.target_date,
      color: payload.color,
      icon: payload.icon,
      current_amount: 0 // New goals start at 0
    });

  if (error) {
    console.error("Failed to add goal:", error);
    return { error: "Failed to create savings goal. Try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/budgets");

  return { success: true };
}
