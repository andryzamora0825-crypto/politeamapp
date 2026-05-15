/* eslint-disable */
"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { PostCard } from "./PostCard";

interface ProfilePageProps {
  profile: any;
  currentUserId: string;
}

export function ProfilePage({ profile, currentUserId }: ProfilePageProps) {
  const isOwner = profile?.clerk_user_id === currentUserId;
  const profileId = profile?.clerk_user_id;
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [editingBio, setEditingBio] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [showBannerMenu, setShowBannerMenu] = useState(false);
  // Friend request state
  const [friendStatus, setFriendStatus] = useState<"none" | "pending_sent" | "pending_received" | "accepted">("none");
  const [friendLoading, setFriendLoading] = useState(false);

  const avatarRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const close = () => { setShowAvatarMenu(false); setShowBannerMenu(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [postsRes, friendsRes] = await Promise.all([
      supabase.from("posts").select("*, author:profiles!posts_author_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)").eq("author_id", profileId).order("created_at", { ascending: false }),
      supabase.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`user_id.eq.${profileId},friend_id.eq.${profileId}`),
    ]);
    const userLikesRes = await supabase.from("likes").select("post_id").eq("user_id", currentUserId);
    const likedIds = new Set(userLikesRes.data?.map((l: any) => l.post_id) || []);
    setPosts((postsRes.data || []).map((p: any) => ({ ...p, isLiked: likedIds.has(p.id) })));
    setPostCount(postsRes.data?.length || 0);
    setFriendCount(friendsRes.count || 0);

    // Check friendship status
    if (!isOwner) {
      const { data: fs } = await supabase.from("friendships")
        .select("*")
        .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profileId}),and(user_id.eq.${profileId},friend_id.eq.${currentUserId})`)
        .limit(1)
        .maybeSingle();
      if (fs) {
        if (fs.status === "accepted") setFriendStatus("accepted");
        else if (fs.user_id === currentUserId) setFriendStatus("pending_sent");
        else setFriendStatus("pending_received");
      } else {
        setFriendStatus("none");
      }
    }

    setLoading(false);
  };

  // Friend actions
  const sendFriendRequest = async () => {
    setFriendLoading(true);
    await supabase.from("friendships").insert({ user_id: currentUserId, friend_id: profileId, status: "pending" });
    setFriendStatus("pending_sent");
    setFriendLoading(false);
  };

  const acceptFriendRequest = async () => {
    setFriendLoading(true);
    await supabase.from("friendships").update({ status: "accepted" }).or(`and(user_id.eq.${profileId},friend_id.eq.${currentUserId})`).eq("status", "pending");
    setFriendStatus("accepted");
    setFriendCount(c => c + 1);
    setFriendLoading(false);
  };

  const removeFriend = async () => {
    setFriendLoading(true);
    await supabase.from("friendships").delete().or(`and(user_id.eq.${currentUserId},friend_id.eq.${profileId}),and(user_id.eq.${profileId},friend_id.eq.${currentUserId})`);
    setFriendStatus("none");
    setFriendLoading(false);
  };

  const uploadImage = async (file: File, path: string) => {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${path}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isOwner) return;
    const url = await uploadImage(file, currentUserId);
    if (url) { setAvatarUrl(url); await supabase.from("profiles").update({ avatar_url: url }).eq("clerk_user_id", currentUserId); }
    setShowAvatarMenu(false);
  };

  const removeAvatar = async () => {
    if (!isOwner) return;
    setAvatarUrl(""); await supabase.from("profiles").update({ avatar_url: "" }).eq("clerk_user_id", currentUserId);
    setShowAvatarMenu(false);
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isOwner) return;
    const url = await uploadImage(file, `${currentUserId}/banners`);
    if (url) { setBannerUrl(url); await supabase.from("profiles").update({ banner_url: url }).eq("clerk_user_id", currentUserId); }
    setShowBannerMenu(false);
  };

  const removeBanner = async () => {
    if (!isOwner) return;
    setBannerUrl(""); await supabase.from("profiles").update({ banner_url: "" }).eq("clerk_user_id", currentUserId);
    setShowBannerMenu(false);
  };

  const saveBio = async () => {
    if (!isOwner) return;
    await supabase.from("profiles").update({ bio }).eq("clerk_user_id", currentUserId);
    setEditingBio(false);
  };

  return (
    <div className="pp">
      {/* ===== TOP CARD: Banner + Info ===== */}
      <div className="pp-card">
        {/* Banner */}
        <div className="pp-banner" onClick={(e) => e.stopPropagation()}>
          {bannerUrl ? (
            <img src={bannerUrl} alt="Portada" />
          ) : (
            <div className="pp-banner-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
          )}
          {isOwner && (
            <div className="pp-banner-actions" onClick={(e) => e.stopPropagation()}>
              <button className="pp-action-btn" onClick={() => setShowBannerMenu(!showBannerMenu)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Editar portada
              </button>
              {showBannerMenu && (
                <div className="pp-dropdown">
                  <button onClick={() => bannerRef.current?.click()}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Subir foto
                  </button>
                  {bannerUrl && (
                    <button onClick={removeBanner} className="pp-dropdown-danger">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Eliminar portada
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {isOwner && <input ref={bannerRef} type="file" accept="image/*" hidden onChange={handleBannerUpload} />}
        </div>

        {/* Info row */}
        <div className="pp-info-row">
          {/* Avatar */}
          <div className="pp-avatar-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="pp-avatar" onClick={() => isOwner && setShowAvatarMenu(!showAvatarMenu)}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile?.full_name} />
              ) : (
                <div className="pp-avatar-fallback">{(profile?.full_name || "U").charAt(0).toUpperCase()}</div>
              )}
              {isOwner && (
                <div className="pp-avatar-cam">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
              )}
            </div>
            {isOwner && showAvatarMenu && (
              <div className="pp-dropdown pp-dropdown-avatar">
                <button onClick={() => avatarRef.current?.click()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Subir foto de perfil
                </button>
                {avatarUrl && (
                  <button onClick={removeAvatar} className="pp-dropdown-danger">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Eliminar foto
                  </button>
                )}
              </div>
            )}
            {isOwner && <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />}
          </div>

          {/* Name + Stats */}
          <div className="pp-details">
            <h1 className="pp-name">
              <span className="verified-name">{profile?.full_name || "Usuario"}{profile?.verified && <VerifiedBadge size={22} />}</span>
            </h1>
            <span className="pp-username">@{profile?.username}</span>
            <div className="pp-stats">
              <span><strong>{postCount}</strong> publicaciones</span>
              <span className="pp-dot"></span>
              <span><strong>{friendCount}</strong> amigos</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pp-header-actions">
            {isOwner && !editingBio && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingBio(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editar perfil
              </button>
            )}
            {!isOwner && (
              <>
                {friendStatus === "none" && (
                  <button className="btn btn-primary btn-sm" onClick={sendFriendRequest} disabled={friendLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Agregar amigo
                  </button>
                )}
                {friendStatus === "pending_sent" && (
                  <button className="btn btn-ghost btn-sm" onClick={removeFriend} disabled={friendLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    Solicitud enviada
                  </button>
                )}
                {friendStatus === "pending_received" && (
                  <button className="btn btn-primary btn-sm" onClick={acceptFriendRequest} disabled={friendLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Aceptar solicitud
                  </button>
                )}
                {friendStatus === "accepted" && (
                  <button className="btn btn-ghost btn-sm pp-friends-btn" onClick={removeFriend} disabled={friendLoading}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                    Amigos ✓
                  </button>
                )}
              </>
            )}
            <a href="/" className="btn btn-primary btn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              Feed
            </a>
          </div>
        </div>

        {/* Bio inside card */}
        <div className="pp-bio-area">
          {isOwner && editingBio ? (
            <div className="pp-bio-edit">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Escribe algo sobre ti..." rows={2} maxLength={300} />
              <div className="pp-bio-edit-actions">
                <span className="pp-bio-count">{bio.length}/300</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingBio(false)}>Cancelar</button>
                <button className="btn btn-primary btn-sm" onClick={saveBio}>Guardar</button>
              </div>
            </div>
          ) : bio ? (
            <p className="pp-bio-text" onClick={() => isOwner && setEditingBio(true)} style={{ cursor: isOwner ? "pointer" : "default" }}>{bio}</p>
          ) : isOwner ? (
            <p className="pp-bio-placeholder" onClick={() => setEditingBio(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Agrega una descripcion
            </p>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="pp-tabs">
          <button className="pp-tab active">Publicaciones</button>
          <button className="pp-tab">Fotos</button>
          <button className="pp-tab">Amigos</button>
        </div>
      </div>

      {/* ===== POSTS ===== */}
      <div className="pp-posts">
        {loading ? (
          <div className="pp-loading">
            <div className="search-spinner" />
            <span>Cargando...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="pp-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            <h3>{isOwner ? "Sin publicaciones" : `${profile?.full_name} no tiene publicaciones aún`}</h3>
            {isOwner && <p>Comparte tu primer post desde el feed</p>}
            <a href="/" className="btn btn-primary btn-sm">Ir al feed</a>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} currentUserId={currentUserId}
              onUpdate={(id, updates) => setPosts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))}
              onDelete={(id) => setPosts(prev => prev.filter(p => p.id !== id))} />
          ))
        )}
      </div>
    </div>
  );
}
