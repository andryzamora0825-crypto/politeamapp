/* eslint-disable */
"use client";
import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";

interface CreatePostProps {
  currentUserId: string;
  profile: any;
  onNewPost: (post: any) => void;
}

type Visibility = "public" | "friends" | "private" | "custom";

const VisIcons = {
  public: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  friends: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  private: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  custom: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>,
};

const visibilityOptions: { value: Visibility; label: string; desc: string }[] = [
  { value: "public", label: "Público", desc: "Todos pueden ver" },
  { value: "friends", label: "Amigos", desc: "Solo tus amigos" },
  { value: "private", label: "Privado", desc: "Solo tú" },
  { value: "custom", label: "Compartir con...", desc: "Personas específicas" },
];

export function CreatePost({ currentUserId, profile, onNewPost }: CreatePostProps) {
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [showVisMenu, setShowVisMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const visRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Close visibility menu on outside click
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (visRef.current && !visRef.current.contains(e.target as Node)) setShowVisMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fetchFriends = async () => {
    const { data } = await supabase.from("friendships")
      .select("*, friend:profiles!friendships_friend_id_fkey(clerk_user_id, username, full_name, avatar_url), user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url)")
      .eq("status", "accepted")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    const list = (data || []).map((f: any) => f.user_id === currentUserId ? f.friend : f.user);
    setFriends(list);
  };

  const openShareModal = async () => {
    await fetchFriends();
    setShowShareModal(true);
    setShowVisMenu(false);
  };

  const toggleUserSelection = (uid: string) => {
    setSelectedUsers(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imageFile) return;
    setLoading(true);
    setError(null);

    let image_url = null;

    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${currentUserId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(fileName, imageFile, { cacheControl: "3600", upsert: false });
      if (uploadError) {
        setError("Error al subir la imagen.");
        setLoading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
      image_url = urlData.publicUrl;
    }

    const { data, error: insertError } = await supabase
      .from("posts")
      .insert({ author_id: currentUserId, content: content.trim(), image_url, visibility })
      .select()
      .single();

    if (insertError) {
      setError("Error al publicar: " + insertError.message);
    } else if (data) {
      // If custom, insert visibility entries
      if (visibility === "custom" && selectedUsers.length > 0) {
        const rows = selectedUsers.map(uid => ({ post_id: data.id, user_id: uid }));
        await supabase.from("post_visibility").insert(rows);
      }
      onNewPost(data);
      setContent("");
      removeImage();
      setSelectedUsers([]);
      setVisibility("public");
    }
    setLoading(false);
  };

  const currentVis = visibilityOptions.find(v => v.value === visibility)!;
  const filteredFriends = friendSearch
    ? friends.filter(f => f.full_name?.toLowerCase().includes(friendSearch.toLowerCase()) || f.username?.toLowerCase().includes(friendSearch.toLowerCase()))
    : friends;

  return (
    <>
      <div className="card create-post">
        <div className="create-post-top">
          <UserAvatar src={profile?.avatar_url} name={profile?.full_name || "U"} />
          <textarea
            className="create-post-input"
            placeholder={`¿Qué estás pensando, ${profile?.full_name?.split(" ")[0] || ""}?`}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={1}
          />
        </div>
        {imagePreview && (
          <div className="image-preview">
            <img src={imagePreview} alt="Preview" />
            <button className="image-preview-remove" onClick={removeImage}>✕</button>
          </div>
        )}
        {error && (
          <div style={{ padding: "8px 12px", margin: "8px 0", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "#ef4444", fontSize: "0.8rem" }}>
            {error}
          </div>
        )}
        <div className="create-post-actions">
          <div className="create-post-tools">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImageSelect} />
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Foto
            </button>

            {/* Visibility selector */}
            <div ref={visRef} style={{ position: "relative" }}>
              <button className="btn btn-ghost btn-sm cp-vis-btn" onClick={(e) => { e.stopPropagation(); setShowVisMenu(!showVisMenu); }}>
                <span className="cp-vis-icon">{VisIcons[visibility]}</span> {currentVis.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showVisMenu && (
                <div className="cp-vis-dropdown">
                  {visibilityOptions.map(opt => (
                    <button
                      key={opt.value}
                      className={`cp-vis-option ${visibility === opt.value ? "active" : ""}`}
                      onClick={() => {
                        if (opt.value === "custom") { openShareModal(); }
                        else { setVisibility(opt.value); setShowVisMenu(false); }
                      }}
                    >
                      <span className="cp-vis-icon">{VisIcons[opt.value]}</span>
                      <div>
                        <span className="cp-vis-label">{opt.label}</span>
                        <span className="cp-vis-desc">{opt.desc}</span>
                      </div>
                      {visibility === opt.value && <span className="cp-vis-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            className={`btn btn-primary btn-sm ${loading || (!content.trim() && !imageFile) ? "btn-disabled" : ""}`}
            onClick={handleSubmit}
          >
            {loading ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </div>

      {/* Share-with modal */}
      {showShareModal && (
        <div className="cp-share-overlay" onClick={() => setShowShareModal(false)}>
          <div className="cp-share-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-share-header">
              <h3>Compartir con...</h3>
              <button onClick={() => setShowShareModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="cp-share-search">
              <input placeholder="Buscar amigos..." value={friendSearch} onChange={e => setFriendSearch(e.target.value)} />
            </div>
            <div className="cp-share-list">
              {filteredFriends.length === 0 ? (
                <div className="cp-share-empty">No tienes amigos para compartir</div>
              ) : filteredFriends.map(f => (
                <div key={f.clerk_user_id} className={`cp-share-item ${selectedUsers.includes(f.clerk_user_id) ? "selected" : ""}`} onClick={() => toggleUserSelection(f.clerk_user_id)}>
                  <UserAvatar src={f.avatar_url} name={f.full_name} size="sm" />
                  <span className="cp-share-name">{f.full_name}</span>
                  <div className={`cp-share-check ${selectedUsers.includes(f.clerk_user_id) ? "checked" : ""}`}>
                    {selectedUsers.includes(f.clerk_user_id) && "✓"}
                  </div>
                </div>
              ))}
            </div>
            <div className="cp-share-footer">
              <span className="cp-share-count">{selectedUsers.length} seleccionado{selectedUsers.length !== 1 ? "s" : ""}</span>
              <button className="btn btn-primary btn-sm" onClick={() => { setVisibility("custom"); setShowShareModal(false); }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
