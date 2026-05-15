/* eslint-disable */
"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { VerifiedBadge } from "./VerifiedBadge";

interface NavbarProps {
  profile: any;
}

export function Navbar({ profile }: NavbarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ users: any[]; posts: any[] }>({ users: [], posts: [] });
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Unread messages
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
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
  }, [profile?.clerk_user_id]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults({ users: [], posts: [] });
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setShowResults(true);

      const isHashtag = value.startsWith("#");
      const searchTerm = isHashtag ? value.slice(1) : value;

      const [usersRes, postsRes] = await Promise.all([
        isHashtag
          ? { data: [] }
          : supabase
              .from("profiles")
              .select("clerk_user_id, username, full_name, avatar_url, verified")
              .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
              .limit(5),
        supabase
          .from("posts")
          .select("id, content, author_id, created_at, author:profiles!posts_author_id_fkey(full_name, avatar_url, verified)")
          .ilike("content", `%${isHashtag ? "#" + searchTerm : searchTerm}%`)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      setResults({
        users: usersRes.data || [],
        posts: postsRes.data || [],
      });
      setLoading(false);
    }, 300);
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term) return text;
    const truncated = text.length > 80 ? text.slice(0, 80) + "..." : text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = truncated.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} style={{ background: "rgba(14,165,233,0.2)", color: "inherit", borderRadius: 2, padding: "0 2px" }}>{part}</mark> : part
    );
  };

  const totalResults = results.users.length + results.posts.length;

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <a href="/" className="navbar-logo">PoliTeam</a>

        <div className="search-wrapper" ref={searchRef}>
          <div className="search-input-box">
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="search-input"
              type="text"
              placeholder="Buscar usuarios, publicaciones o #hashtags..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => query.trim() && setShowResults(true)}
            />
            {query && (
              <button className="search-clear" onClick={() => { setQuery(""); setResults({ users: [], posts: [] }); setShowResults(false); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {showResults && (
            <div className="search-results">
              {loading ? (
                <div className="search-loading">
                  <div className="search-spinner" />
                  <span>Buscando...</span>
                </div>
              ) : totalResults === 0 ? (
                <div className="search-empty">Sin resultados para &ldquo;{query}&rdquo;</div>
              ) : (
                <>
                  {results.users.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Usuarios</div>
                      {results.users.map((u) => (
                        <div key={u.clerk_user_id} className="search-result-item" onClick={() => { router.push(`/perfil/${u.username}`); setShowResults(false); setQuery(""); }} style={{ cursor: 'pointer' }}>
                          <UserAvatar src={u.avatar_url} name={u.full_name} size="sm" />
                          <div className="search-result-info">
                            <span className="search-result-name"><span className="verified-name">{highlightMatch(u.full_name, query)}{u.verified && <VerifiedBadge size={14} />}</span></span>
                            <span className="search-result-sub">@{u.username}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {results.posts.length > 0 && (
                    <div className="search-section">
                      <div className="search-section-title">Publicaciones</div>
                      {results.posts.map((p: any) => (
                        <div key={p.id} className="search-result-item">
                          <UserAvatar src={p.author?.avatar_url} name={p.author?.full_name || "U"} size="sm" />
                          <div className="search-result-info">
                            <span className="search-result-name">{p.author?.full_name}</span>
                            <span className="search-result-sub">{highlightMatch(p.content, query.startsWith("#") ? query : query)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="navbar-actions">
          <button className="btn btn-icon" style={{ position: "relative" }} onClick={() => router.push("/mensajes")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {unreadCount > 0 && (
              <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, background: "#ef4444", color: "#fff", fontSize: "0.6rem", fontWeight: 700, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid #fff", lineHeight: 1 }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <UserButton
            afterSignOutUrl="/login"
            appearance={{
              elements: {
                avatarBox: { width: 38, height: 38 },
              },
            }}
          />
        </div>
      </div>
    </nav>
  );
}
