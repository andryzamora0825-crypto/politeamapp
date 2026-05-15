"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";

interface FriendsSidebarProps {
  currentUserId: string;
}

export function FriendsSidebar({ currentUserId }: FriendsSidebarProps) {
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searchError, setSearchError] = useState("");
  const [tab, setTab] = useState<"friends" | "requests" | "add">("friends");
  const supabase = createClient();

  useEffect(() => { fetchFriends(); fetchRequests(); }, []);

  const fetchFriends = async () => {
    const { data } = await supabase
      .from("friendships")
      .select(`*, friend:profiles!friendships_friend_id_fkey(clerk_user_id, username, full_name, avatar_url), user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url)`)
      .eq("status", "accepted")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    setFriends((data || []).map((f: any) => f.user_id === currentUserId ? f.friend : f.user));
  };

  const fetchRequests = async () => {
    const { data } = await supabase
      .from("friendships")
      .select(`*, user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url)`)
      .eq("friend_id", currentUserId)
      .eq("status", "pending");
    setRequests(data || []);
  };

  const searchUser = async () => {
    if (!searchTerm.trim()) return;
    setSearchError(""); setSearchResult(null);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
      .neq("clerk_user_id", currentUserId)
      .limit(5);
    if (data && data.length > 0) setSearchResult(data);
    else setSearchError("No se encontraron usuarios");
  };

  const sendRequest = async (friendClerkId: string) => {
    await supabase.from("friendships").insert({ user_id: currentUserId, friend_id: friendClerkId, status: "pending" });
    setSearchResult(null); setSearchTerm("");
  };

  const acceptRequest = async (id: string) => {
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    fetchFriends(); fetchRequests();
  };

  const rejectRequest = async (id: string) => {
    await supabase.from("friendships").delete().eq("id", id);
    fetchRequests();
  };

  return (
    <div className="card friends-card">
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["friends", "requests", "add"] as const).map((t) => (
          <button key={t} className="btn btn-ghost btn-sm" style={tab === t ? { background: "var(--accent)", color: "#fff" } : { position: "relative" }} onClick={() => setTab(t)}>
            {t === "friends" ? "Amigos" : t === "requests" ? <>Solicitudes{requests.length > 0 && <span className="badge">{requests.length}</span>}</> : "➕"}
          </button>
        ))}
      </div>

      {tab === "friends" && (friends.length === 0
        ? <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: 16 }}>Aún no tienes amigos.<br/>¡Agrega algunos!</p>
        : friends.map((f: any) => (
          <div key={f.clerk_user_id} className="friend-item">
            <UserAvatar src={f.avatar_url} name={f.full_name} size="sm" />
            <span className="friend-name">{f.full_name}</span>
            <span className="friend-status" />
          </div>
        ))
      )}

      {tab === "requests" && (requests.length === 0
        ? <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: 16 }}>Sin solicitudes pendientes</p>
        : requests.map((r: any) => (
          <div key={r.id} className="friend-item" style={{ flexWrap: "wrap" }}>
            <UserAvatar src={r.user?.avatar_url} name={r.user?.full_name || "U"} size="sm" />
            <span className="friend-name">{r.user?.full_name}</span>
            <div className="friend-request-actions">
              <button className="btn btn-primary btn-sm" onClick={() => acceptRequest(r.id)}>✓</button>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => rejectRequest(r.id)}>✕</button>
            </div>
          </div>
        ))
      )}

      {tab === "add" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input style={{ fontSize: "0.85rem", padding: "8px 12px" }} placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchUser()} />
            <button className="btn btn-primary btn-sm" onClick={searchUser}>🔍</button>
          </div>
          {searchError && <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{searchError}</p>}
          {searchResult?.map((user: any) => (
            <div key={user.clerk_user_id} className="friend-item">
              <UserAvatar src={user.avatar_url} name={user.full_name} size="sm" />
              <span className="friend-name">{user.full_name}</span>
              <button className="btn btn-primary btn-sm" onClick={() => sendRequest(user.clerk_user_id)}>Agregar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
