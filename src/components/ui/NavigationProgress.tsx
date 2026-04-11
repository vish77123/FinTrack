"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin progress bar that appears at the top of the page during navigation.
 * Uses pathname changes to detect route transitions.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const prevPathname = useRef(pathname);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Intercept all <a> / Link clicks to start the bar immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("http") ||
        href.startsWith("mailto:") ||
        anchor.target === "_blank"
      )
        return;

      // If navigating to the same page, skip
      if (href === pathname) return;

      // Start immediately
      startProgress();
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  // When pathname actually changes, complete the bar
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      completeProgress();
    }
  }, [pathname]);

  const startProgress = () => {
    // Clear any previous timers
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setProgress(0);
    setVisible(true);

    // Animate progress: fast at first, then slow down
    let current = 0;
    intervalRef.current = setInterval(() => {
      current += Math.max(1, (90 - current) * 0.08);
      if (current >= 90) {
        current = 90;
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
      setProgress(current);
    }, 50);
  };

  const completeProgress = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    setProgress(100);
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 300);
  };

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "3px",
        zIndex: 99999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: "linear-gradient(90deg, var(--accent), #A78BFA)",
          boxShadow: "0 0 8px var(--accent)",
          borderRadius: "0 2px 2px 0",
          transition:
            progress === 100
              ? "width 0.2s ease, opacity 0.3s ease 0.1s"
              : "width 0.15s ease-out",
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
