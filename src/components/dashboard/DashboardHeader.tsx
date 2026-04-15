"use client";

import { useEffect, useState } from "react";
import { Plus, Moon, Sun } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import styles from "./dashboard.module.css";

interface DashboardHeaderProps {
  userName: string;
}

export default function DashboardHeader({ userName }: DashboardHeaderProps) {
  const { theme, toggleTheme, setTransactionModalOpen } = useUIStore();
  // Defer any client-only values (theme, date) until after hydration
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Compute greeting and month only on the client to avoid SSR/client mismatch
  const greeting = mounted ? (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "🌅 Good morning";
    if (hour < 18) return "☀️ Good afternoon";
    return "🌙 Good evening";
  })() : "Hello";

  const monthYear = mounted
    ? new Date().toLocaleString("default", { month: "long", year: "numeric" })
    : "";

  return (
    <div className={styles.pageHeader}>
      <div>
        <h1>
          {greeting}, {userName.split(" ")[0]}
        </h1>
        <p suppressHydrationWarning>
          {mounted ? `Here's your financial overview for ${monthYear}` : "Loading your financial overview..."}
        </p>
      </div>
      <div className={styles.headerActions}>
        <button className="btn btn-primary" onClick={() => setTransactionModalOpen(true)}>
          <Plus size={16} /> Add Transaction
        </button>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          suppressHydrationWarning
        >
          {/* Only render icon client-side to avoid SSR theme mismatch */}
          {mounted && (theme === "light" ? <Moon size={18} /> : <Sun size={18} />)}
        </button>
      </div>
    </div>
  );
}
