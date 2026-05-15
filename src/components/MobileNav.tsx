/* eslint-disable */
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { UserAvatar } from "./UserAvatar";

interface MobileNavProps {
  profile: any;
}

export function MobileNav({ profile }: MobileNavProps) {
  const pathname = usePathname();

  const tabs = [
    {
      href: "/",
      label: "Inicio",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      active: pathname === "/",
    },
    {
      href: "/mensajes",
      label: "Chat",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      active: pathname === "/mensajes",
    },
    {
      href: "/lives",
      label: "Lives",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ),
      active: pathname === "/lives",
    },
    {
      href: `/perfil/${profile?.username || ""}`,
      label: "Perfil",
      icon: null,
      active: pathname.startsWith("/perfil"),
      isProfile: true,
    },
  ];

  return (
    <nav className="mobile-nav">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`mobile-nav-tab ${tab.active ? "mobile-nav-active" : ""}`}>
          {tab.isProfile ? (
            <div className={`mobile-nav-avatar ${tab.active ? "mobile-nav-avatar-active" : ""}`}>
              <UserAvatar src={profile?.avatar_url} name={profile?.full_name || "U"} size="sm" />
            </div>
          ) : (
            <div className="mobile-nav-icon">{tab.icon}</div>
          )}
          <span className="mobile-nav-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
