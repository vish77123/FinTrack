"use client";

import { useEffect } from "react";
import { Plus, Moon, Sun } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import styles from "./dashboard.module.css";

interface DashboardHeaderProps {
  userName: string;
}

export default function DashboardHeader({ userName }: DashboardHeaderProps) {
  const { theme, toggleTheme } = useUIStore();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Determine greeting based on time
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";

  return (
    <div className={styles.pageHeader}>
      <div>
        <h1>
          {greeting}, {userName.split(" ")[0]}
        </h1>
        <p>Here&apos;s your financial overview for {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
      </div>
      <div className={styles.headerActions}>
        <button className="btn btn-primary">
          <Plus size={16} /> Add Transaction
        </button>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>
    </div>
  );
}
