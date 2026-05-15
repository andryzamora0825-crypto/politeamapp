/* eslint-disable */
"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "../UserAvatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { LiveRoom } from "./LiveRoom";
import { timeAgo } from "@/lib/utils";

interface LivePageProps {
  currentUserId: string;
  profile: any;
}

export function LivePage({ currentUserId, profile }: LivePageProps) {
  const [lives, setLives] = useState<any[]>([]);
  const [pastLives, setPastLives] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [replayLive, setReplayLive] = useState<any>(null);
  const [replayMessages, setReplayMessages] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [tab, setTab] = useState<"live" | "saved">("live");
  const supabase = createClient();

  useEffect(() => { fetchLives(); }, []);

  useEffect(() => {
    const ch = supabase.channel("lives-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "lives" }, () => fetchLives())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchLives = async () => {
    const { data: activeLives, error: e1 } = await supabase
      .from("lives")
      .select("*, creator:profiles(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("status", "live")
      .order("created_at", { ascending: false });
    if (e1) console.error("fetchLives active error:", e1);
    setLives(activeLives || []);

    const { data: ended, error: e2 } = await supabase
      .from("lives")
      .select("*, creator:profiles(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("status", "ended")
      .or(`is_public.eq.true,creator_id.eq.${currentUserId}`)
      .order("ended_at", { ascending: false })
      .limit(30);
    if (e2) console.error("fetchLives ended error:", e2);
    setPastLives(ended || []);
  };

  const startLive = async () => {
    if (!title.trim()) return;
    const { data, error } = await supabase.from("lives").insert({
      creator_id: currentUserId,
      title: title.trim(),
      description: description.trim(),
      is_public: isPublic,
      status: "live",
    }).select().single();

    if (error) {
      console.error("startLive error:", error);
      alert("Error al crear live: " + error.message);
      return;
    }

    if (data) {
      // Attach creator profile manually
      data.creator = {
        clerk_user_id: currentUserId,
        username: profile.username,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        verified: profile.verified,
      };
      setShowCreate(false);
      setTitle("");
      setDescription("");
      setActiveRoom(data);
    }
  };

  const joinLive = (live: any) => {
    setActiveRoom(live);
  };

  const openReplay = async (live: any) => {
    setReplayLive(live);
    const { data } = await supabase.from("live_messages")
      .select("*, author:profiles(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("live_id", live.id).order("created_at", { ascending: true }).limit(500);
    setReplayMessages(data || []);
  };

  const toggleVisibility = async (live: any) => {
    await supabase.from("lives").update({ is_public: !live.is_public }).eq("id", live.id);
    fetchLives();
  };

  const deleteLive = async (live: any) => {
    if (!confirm("¿Eliminar esta grabación?")) return;
    await supabase.from("live_messages").delete().eq("live_id", live.id);
    await supabase.from("live_likes").delete().eq("live_id", live.id);
    await supabase.from("lives").delete().eq("id", live.id);
    fetchLives();
  };

  if (activeRoom) {
    return <LiveRoom live={activeRoom} currentUserId={currentUserId} profile={profile} onLeave={() => { setActiveRoom(null); fetchLives(); }} />;
  }

  if (replayLive) {
    return (
      <div className="lr-container">
        <div className="lr-main">
          <div className="lr-topbar">
            <button className="btn btn-icon lr-back-btn" onClick={() => { setReplayLive(null); setReplayMessages([]); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div className="lr-topbar-info">
              <UserAvatar src={replayLive.creator?.avatar_url} name={replayLive.creator?.full_name || "U"} size="sm" />
              <div>
                <span className="verified-name lr-topbar-name">{replayLive.creator?.full_name}{replayLive.creator?.verified && <VerifiedBadge size={13} />}</span>
                <span className="lr-topbar-title">{replayLive.title}</span>
              </div>
            </div>
            <div className="lr-topbar-stats">
              <span className="lr-ended-badge">GRABACIÓN</span>
              <span className="lr-stat">❤️ {replayLive.likes_count}</span>
              <span className="lr-stat">👁 {replayLive.viewer_count}</span>
            </div>
          </div>
          <div className="lr-stage">
            <div className="lr-video-area">
              <div className="lr-no-video">
                <UserAvatar src={replayLive.creator?.avatar_url} name={replayLive.creator?.full_name || "U"} size="xl" />
                <h3>{replayLive.title}</h3>
                {replayLive.description && <p>{replayLive.description}</p>}
                <span className="lr-replay-badge">Clase finalizada — {replayLive.ended_at ? timeAgo(replayLive.ended_at) : ""}</span>
                {replayLive.creator_id === currentUserId && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="lr-ctrl-btn" onClick={() => toggleVisibility(replayLive)}>
                      {replayLive.is_public ? "🔒 Hacer privado" : "🌐 Hacer público"}
                    </button>
                    <button className="lr-ctrl-btn lr-ctrl-end" onClick={() => { deleteLive(replayLive); setReplayLive(null); }}>
                      🗑️ Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="lr-chat">
          <div className="lr-chat-header">
            <h4>Chat de la clase ({replayMessages.length})</h4>
          </div>
          <div className="lr-chat-messages">
            {replayMessages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.3)' }}>No hay mensajes en esta clase</div>
            ) : replayMessages.map((msg) => (
              <div key={msg.id} className="lr-chat-msg">
                <div className="lr-chat-msg-header">
                  <UserAvatar src={msg.author?.avatar_url} name={msg.author?.full_name || "?"} size="sm" />
                  <span className="lr-chat-msg-author"><span className="verified-name">{msg.author?.full_name || msg.author?.username || "Usuario"}{msg.author?.verified && <VerifiedBadge size={11} />}</span></span>
                </div>
                <span className="lr-chat-msg-text">{msg.content}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lp-container">
      {/* Header */}
      <div className="lp-header">
        <div className="lp-header-left">
          <div className="lp-live-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          </div>
          <div>
            <h2>Clases en Vivo</h2>
            <p className="lp-header-sub">Educación interactiva en tiempo real</p>
          </div>
        </div>
        <button className="btn btn-primary lp-create-btn" onClick={() => setShowCreate(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Iniciar Live
        </button>
      </div>

      {/* Tabs */}
      <div className="lp-tabs">
        <button className={`lp-tab ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}>
          <span className="lp-tab-dot-live" /> En Vivo ({lives.length})
        </button>
        <button className={`lp-tab ${tab === "saved" ? "active" : ""}`} onClick={() => setTab("saved")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          Grabados ({pastLives.length})
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="lp-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="lp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h3>Iniciar una clase en vivo</h3>
              <button className="btn btn-icon" onClick={() => setShowCreate(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="lp-modal-body">
              <label className="lp-label">Título de la clase *</label>
              <input className="lp-input" placeholder="Ej: Matemáticas — Cálculo Integral" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
              <label className="lp-label">Descripción (opcional)</label>
              <textarea className="lp-textarea" placeholder="Describe el tema que vas a enseñar..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
              <div className="lp-visibility-toggle">
                <label className="lp-label">Visibilidad</label>
                <div className="lp-toggle-row">
                  <button className={`lp-toggle-btn ${isPublic ? "active" : ""}`} onClick={() => setIsPublic(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    Público
                  </button>
                  <button className={`lp-toggle-btn ${!isPublic ? "active" : ""}`} onClick={() => setIsPublic(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Privado
                  </button>
                </div>
                <p className="lp-vis-hint">{isPublic ? "Todos pueden ver esta clase y aparecerá en tu perfil" : "Solo personas con el link pueden unirse. No aparece en tu perfil"}</p>
              </div>
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary lp-go-live-btn" onClick={startLive} disabled={!title.trim()}>
                <span className="lp-go-dot" /> Comenzar ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {tab === "live" ? (
        <div className="lp-grid">
          {lives.length === 0 ? (
            <div className="lp-empty">
              <div className="lp-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              </div>
              <h4>No hay clases en vivo</h4>
              <p>Sé el primero en iniciar una clase educativa</p>
            </div>
          ) : lives.map((live) => (
            <div key={live.id} className="lp-card" onClick={() => joinLive(live)}>
              <div className="lp-card-preview">
                <div className="lp-card-gradient" />
                <span className="lp-card-live-badge"><span className="lp-card-live-dot" /> EN VIVO</span>
                <span className="lp-card-viewers">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {live.viewer_count}
                </span>
              </div>
              <div className="lp-card-info">
                <div className="lp-card-creator">
                  <UserAvatar src={live.creator?.avatar_url} name={live.creator?.full_name || "U"} size="sm" />
                  <span className="verified-name">{live.creator?.full_name}{live.creator?.verified && <VerifiedBadge size={12} />}</span>
                </div>
                <h4 className="lp-card-title">{live.title}</h4>
                <span className="lp-card-time">{timeAgo(live.started_at || live.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="lp-grid">
          {pastLives.length === 0 ? (
            <div className="lp-empty">
              <div className="lp-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <h4>No hay grabaciones</h4>
              <p>Las clases finalizadas aparecerán aquí</p>
            </div>
          ) : pastLives.map((live) => (
            <div key={live.id} className="lp-card lp-card-ended" onClick={() => openReplay(live)}>
              <div className="lp-card-preview lp-card-preview-ended">
                <div className="lp-card-gradient lp-card-gradient-ended" />
                <span className="lp-card-ended-badge">{live.is_public ? "GRABADO" : "PRIVADO"}</span>
                <span className="lp-card-viewers">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                  {live.likes_count}
                </span>
              </div>
              <div className="lp-card-info">
                <div className="lp-card-creator">
                  <UserAvatar src={live.creator?.avatar_url} name={live.creator?.full_name || "U"} size="sm" />
                  <span className="verified-name">{live.creator?.full_name}{live.creator?.verified && <VerifiedBadge size={12} />}</span>
                </div>
                <h4 className="lp-card-title">{live.title}</h4>
                <div className="lp-card-bottom">
                  <span className="lp-card-time">Terminó {timeAgo(live.ended_at)}</span>
                  {live.creator_id === currentUserId && (
                    <div className="lp-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="lp-card-action" onClick={() => toggleVisibility(live)} title={live.is_public ? "Hacer privado" : "Publicar"}>
                        {live.is_public ? "🔒" : "🌐"}
                      </button>
                      <button className="lp-card-action lp-card-action-del" onClick={() => deleteLive(live)} title="Eliminar">
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
