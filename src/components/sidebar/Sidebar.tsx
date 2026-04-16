"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Home, DollarSign, CreditCard, PieChart, BarChart3, Settings, Plus } from "lucide-react";
import { useUIStore } from "@/store/useUIStore";
import styles from "./sidebar.module.css";

interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl?: string;
}

interface SidebarProps {
  user: UserProfile;
}

const navItems = [
  {
    section: "MENU",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
      {
        label: "Transactions",
        href: "/transactions",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        ),
      },
      {
        label: "Accounts",
        href: "/accounts",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        ),
      },
      {
        label: "Goals",
        href: "/budgets",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
      },
      {
        label: "Reports",
        href: "/reports",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
      {
        label: "SMS Parser",
        href: "/sms",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    section: "OTHER",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
];

// Bottom nav items (subset for mobile)
const bottomNavItems = [
  { label: "Home", href: "/dashboard", Icon: Home },
  { label: "Transactions", href: "/transactions", Icon: DollarSign },
  { label: "add", href: "#", Icon: Plus }, // FAB placeholder
  { label: "Goals", href: "/budgets", Icon: PieChart },
  { label: "Reports", href: "/reports", Icon: BarChart3 },
];

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { setTransactionModalOpen } = useUIStore();

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const closeSidebar = () => setIsOpen(false);

  return (
    <>
      {/* Mobile top bar — only visible on small screens */}
      <div className={styles.mobileTopBar}>
        <Link href="/dashboard" className={styles.mobileLogo}>
          <div className={styles.logoIcon}>M</div>
          <span className={styles.logoText}>Money Manager</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div className={styles.mobileAvatar}>{getInitials(user.displayName)}</div>
          <button className={styles.hamburgerBtn} onClick={() => setIsOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Backdrop overlay for mobile */}
      {isOpen && <div className={styles.sidebarOverlay} onClick={closeSidebar} />}

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}>
        {/* Close button — only visible on mobile */}
        <button className={styles.closeSidebarBtn} onClick={closeSidebar} aria-label="Close menu">
          <X size={20} />
        </button>

        <Link href="/dashboard" className={styles.sidebarLogo} onClick={closeSidebar}>
          <div className={styles.logoIcon}>M</div>
          <span className={styles.logoText}>Money Manager</span>
        </Link>

        {navItems.map((section) => (
          <nav key={section.section} className={styles.navSection}>
            <div className={styles.navSectionLabel}>{section.section}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className={`${styles.navItem} ${pathname === item.href || pathname.startsWith(item.href + "/") ? styles.active : ""}`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>
        ))}

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.userAvatar}>{getInitials(user.displayName)}</div>
            <div className={styles.userDetails}>
              <div className={styles.userName}>{user.displayName}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAV — only visible on small screens */}
      <nav className={styles.bottomNav}>
        {bottomNavItems.map((item) => {
          const isAdd = item.label === "add";
          const isActive = !isAdd && (pathname === item.href || pathname.startsWith(item.href + "/"));

          if (isAdd) {
            return (
              <button
                key="add-fab"
                className={styles.bottomNavFab}
                onClick={() => setTransactionModalOpen(true)}
                aria-label="Add Transaction"
              >
                <Plus size={24} />
              </button>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.bottomNavItem} ${isActive ? styles.bottomNavActive : ""}`}
            >
              <item.Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
