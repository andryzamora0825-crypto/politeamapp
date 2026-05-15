/* eslint-disable */
"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { UserAvatar } from "./UserAvatar";
import { createClient } from "@/utils/supabase/client";

interface MobileNavProps {
  profile: any;
}

export function MobileNav({ profile }: MobileNavProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (!profile?.clerk_user_id) return;
    const fetchUnread = async () => {
      const { count } = await supabase.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", profile.clerk_user_id)
        .eq("read", false);
      setUnreadCount(count || 0);
    };
    fetchUnread();
    // Poll every 15s
    const interval = setInterval(fetchUnread, 15000);
    // Also listen realtime
    const channel = supabase.channel("mobile-unread")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${profile.clerk_user_id}` }, () => {
        fetchUnread();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        fetchUnread();
      })
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [profile?.clerk_user_id]);

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
      badge: unreadCount,
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
            <div className="mobile-nav-icon" style={{ position: "relative" }}>
              {tab.icon}
              {(tab as any).badge > 0 && (
                <span className="mobile-nav-badge">{(tab as any).badge > 99 ? "99+" : (tab as any).badge}</span>
              )}
            </div>
          )}
          <span className="mobile-nav-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
