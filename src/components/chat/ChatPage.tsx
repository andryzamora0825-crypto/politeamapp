/* eslint-disable @next/next/no-img-element, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "../UserAvatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { StickerPicker } from "./StickerPicker";
import { timeAgo } from "@/lib/utils";

interface ChatPageProps {
  currentUserId: string;
  profile: any;
}

type MsgType = "text" | "image" | "sticker" | "ephemeral";

export function ChatPage({ currentUserId, profile }: ChatPageProps) {
  const [activeChat, setActiveChat] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => { fetchConversations(); }, []);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.clerk_user_id);
      markAsRead(activeChat.clerk_user_id);
      const channel = supabase.channel(`chat-${activeChat.clerk_user_id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUserId}` }, (payload) => {
          if (payload.new.sender_id === activeChat.clerk_user_id) {
            setMessages((prev) => [...prev, payload.new]);
            supabase.from("messages").update({ read: true }).eq("id", payload.new.id);
          }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
          setMessages((prev) => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [activeChat]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const fetchConversations = async () => {
    const { data } = await supabase.from("friendships")
      .select("*, friend:profiles!friendships_friend_id_fkey(clerk_user_id, username, full_name, avatar_url, verified), user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("status", "accepted").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    const { data: blocked } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", currentUserId);
    const blockedIds = new Set(blocked?.map(b => b.blocked_id) || []);
    const convos = (data || []).map((f: any) => f.user_id === currentUserId ? f.friend : f.user).filter((c: any) => !blockedIds.has(c.clerk_user_id));

    for (const c of convos) {
      const { data: lastMsg } = await supabase.from("messages").select("content, message_type, created_at, sender_id")
        .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${c.clerk_user_id}),and(sender_id.eq.${c.clerk_user_id},receiver_id.eq.${currentUserId})`)
        .order("created_at", { ascending: false }).limit(1).single();
      c.lastMessage = lastMsg;
      const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", c.clerk_user_id).eq("receiver_id", currentUserId).eq("read", false);
      c.unread = count || 0;
    }
    convos.sort((a: any, b: any) => {
      const ta = a.lastMessage?.created_at || ""; const tb = b.lastMessage?.created_at || "";
      return tb.localeCompare(ta);
    });
    setConversations(convos);
  };

  const fetchMessages = async (otherId: string) => {
    const { data } = await supabase.from("messages").select("*")
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUserId})`)
      .not("deleted_for", "cs", `{${currentUserId}}`)
      .order("created_at", { ascending: true }).limit(200);
    setMessages(data || []);
  };

  const markAsRead = async (otherId: string) => {
    await supabase.from("messages").update({ read: true }).eq("sender_id", otherId).eq("receiver_id", currentUserId).eq("read", false);
  };

  const sendMessage = async (type: MsgType = "text", extra: any = {}) => {
    const content = type === "text" ? newMsg.trim() : "";
    if (type === "text" && !content) return;
    const msg: any = { sender_id: currentUserId, receiver_id: activeChat.clerk_user_id, content, message_type: type, ephemeral: ephemeralMode && type === "image", ...extra };
    const { data } = await supabase.from("messages").insert(msg).select().single();
    if (data) { setMessages(prev => [...prev, data]); setNewMsg(""); setEphemeralMode(false); }
  };

  const sendSticker = (stickerId: string) => {
    sendMessage("sticker", { sticker_id: stickerId, content: "" });
    setShowStickers(false);
  };

  const sendImage = async (file: File) => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${currentUserId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-images").upload(path, file, { upsert: true });
    if (error) return;
    const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
    sendMessage(ephemeralMode ? "ephemeral" : "image", { image_url: urlData.publicUrl, content: "" });
  };

  const openEphemeral = async (msgId: string) => {
    await supabase.from("messages").update({ opened: true }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, opened: true } : m));
  };

  const reactToMessage = async (msgId: string, emoji: string) => {
    const msg = messages.find(m => m.id === msgId);
    const newReaction = msg?.reaction === emoji ? null : emoji;
    await supabase.from("messages").update({ reaction: newReaction }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: newReaction } : m));
  };

  const deleteChat = async () => {
    if (!activeChat) return;
    const { data: msgs } = await supabase.from("messages").select("id, deleted_for")
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${activeChat.clerk_user_id}),and(sender_id.eq.${activeChat.clerk_user_id},receiver_id.eq.${currentUserId})`);
    for (const m of msgs || []) {
      await supabase.from("messages").update({ deleted_for: [...(m.deleted_for || []), currentUserId] }).eq("id", m.id);
    }
    setActiveChat(null); setShowOptions(false); fetchConversations();
  };

  const blockUser = async () => {
    if (!activeChat) return;
    await supabase.from("blocks").insert({ blocker_id: currentUserId, blocked_id: activeChat.clerk_user_id });
    setActiveChat(null); setShowOptions(false); fetchConversations();
  };

  const reportUser = async () => {
    if (!activeChat) return;
    await supabase.from("reports").insert({ reporter_id: currentUserId, reported_id: activeChat.clerk_user_id, reason: "Reportado desde chat" });
    setShowOptions(false);
  };

  const quickReactions = ["❤️", "😂", "😮", "😢", "🔥", "👍"];

  const getLastMsgPreview = (c: any) => {
    if (!c.lastMessage) return "Inicia una conversación";
    const isMe = c.lastMessage.sender_id === currentUserId;
    const prefix = isMe ? "Tú: " : "";
    switch (c.lastMessage.message_type) {
      case "image": case "ephemeral": return `${prefix}Envió una imagen`;
      case "sticker": return `${prefix}Envió un sticker`;
      default: return prefix + (c.lastMessage.content?.substring(0, 30) + (c.lastMessage.content?.length > 30 ? "..." : "") || "");
    }
  };

  const filteredConvos = searchQuery
    ? conversations.filter(c => c.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.username?.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;

  return (
    <div className="cp-container">
      {/* Left: Conversations list */}
      <div className={`cp-sidebar ${activeChat ? "cp-hide-mobile" : ""}`}>
        <div className="cp-sidebar-header">
          <h2>Mensajes</h2>
        </div>
        <div className="cp-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input placeholder="Buscar conversaciones..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="cp-list">
          {filteredConvos.length === 0 ? (
            <div className="cp-empty-list">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <p>Agrega amigos para chatear</p>
            </div>
          ) : filteredConvos.map((c) => (
            <div key={c.clerk_user_id} className={`cp-item ${activeChat?.clerk_user_id === c.clerk_user_id ? "active" : ""}`} onClick={() => setActiveChat(c)}>
              <div className="cp-item-avatar">
                <UserAvatar src={c.avatar_url} name={c.full_name} size="md" />
                {c.unread > 0 && <span className="cp-item-unread-dot" />}
              </div>
              <div className="cp-item-info">
                <div className="cp-item-row">
                  <span className="cp-item-name">
                    <span className="verified-name">{c.full_name}{c.verified && <VerifiedBadge size={13} />}</span>
                  </span>
                  {c.lastMessage && <span className="cp-item-time">{timeAgo(c.lastMessage.created_at)}</span>}
                </div>
                <span className={`cp-item-preview ${c.unread > 0 ? "cp-item-preview-unread" : ""}`}>{getLastMsgPreview(c)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Chat area */}
      <div className={`cp-main ${!activeChat ? "cp-hide-mobile" : ""}`}>
        {!activeChat ? (
          <div className="cp-empty">
            <div className="cp-empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            </div>
            <h3>Tus mensajes</h3>
            <p>Selecciona una conversación para empezar a chatear</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="cp-header">
              <button className="btn btn-icon cp-show-mobile" onClick={() => setActiveChat(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <UserAvatar src={activeChat.avatar_url} name={activeChat.full_name} size="md" />
              <div className="cp-header-info">
                <span className="verified-name cp-header-name">{activeChat.full_name}{activeChat.verified && <VerifiedBadge size={15} />}</span>
                <span className="cp-header-sub">@{activeChat.username}</span>
              </div>
              <div style={{ position: "relative", marginLeft: "auto" }}>
                <button className="btn btn-icon" onClick={() => setShowOptions(!showOptions)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                </button>
                {showOptions && (
                  <div className="cp-options">
                    <button onClick={deleteChat}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Eliminar chat
                    </button>
                    <button onClick={blockUser} className="cp-opt-danger">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                      Bloquear
                    </button>
                    <button onClick={reportUser} className="cp-opt-danger">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                      Reportar
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="cp-messages" onClick={() => { setShowOptions(false); setShowStickers(false); }}>
              <div className="cp-messages-start">
                <UserAvatar src={activeChat.avatar_url} name={activeChat.full_name} size="xl" />
                <h4>{activeChat.full_name}</h4>
                <p>@{activeChat.username}</p>
              </div>
              {messages.map((msg) => {
                const isMine = msg.sender_id === currentUserId;
                const isEphemeral = msg.message_type === "ephemeral";
                const isSticker = msg.message_type === "sticker";
                const isImage = msg.message_type === "image";

                return (
                  <div key={msg.id} className={`cp-msg ${isMine ? "cp-msg-sent" : "cp-msg-received"}`}>
                    <div className="cp-msg-bubble" onDoubleClick={() => reactToMessage(msg.id, "❤️")}>
                      {isSticker && <div className="cp-msg-sticker">{msg.sticker_id}</div>}
                      {isEphemeral && !msg.opened && !isMine && (
                        <button className="cp-msg-ephemeral-btn" onClick={() => openEphemeral(msg.id)}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                          Foto efímera · Toca para ver
                        </button>
                      )}
                      {isEphemeral && msg.opened && <div className="cp-msg-ephemeral-seen">Foto vista ·  eliminada</div>}
                      {isEphemeral && !msg.opened && isMine && msg.image_url && (
                        <div className="cp-msg-img"><img src={msg.image_url} alt="" /><span className="cp-msg-ephemeral-tag">Efímera</span></div>
                      )}
                      {isImage && msg.image_url && <div className="cp-msg-img"><img src={msg.image_url} alt="" /></div>}
                      {msg.content && !isSticker && <div className="cp-msg-text">{msg.content}</div>}
                      <div className="cp-msg-meta">
                        <span>{timeAgo(msg.created_at)}</span>
                        {isMine && <span className={`cp-msg-status ${msg.read ? "cp-msg-read" : ""}`}>{msg.read ? "✓✓" : "✓"}</span>}
                      </div>
                      {msg.reaction && <span className="cp-msg-reaction">{msg.reaction}</span>}
                    </div>
                    <div className="cp-msg-reactions-bar">
                      {quickReactions.map(emoji => (
                        <button key={emoji} onClick={() => reactToMessage(msg.id, emoji)}>{emoji}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Sticker picker */}
            {showStickers && (
              <div className="cp-sticker-tray">
                <StickerPicker onSelect={sendSticker} onClose={() => setShowStickers(false)} />
              </div>
            )}

            {/* Input area */}
            <div className="cp-input-area">
              <button className="btn btn-icon cp-input-btn" onClick={() => setShowStickers(!showStickers)} title="Stickers">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <button className="btn btn-icon cp-input-btn" onClick={() => imageInputRef.current?.click()} title="Enviar imagen">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </button>
              <button className={`btn btn-icon cp-input-btn ${ephemeralMode ? "cp-ephemeral-on" : ""}`} onClick={() => setEphemeralMode(!ephemeralMode)} title="Foto efímera (ver una vez)">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {ephemeralMode && <span className="cp-ephemeral-dot" />}
              </button>
              <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); }} />
              <input className="cp-input" placeholder={ephemeralMode ? "📸 Modo efímero · Envía una imagen que desaparece" : "Escribe un mensaje..."} value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
              <button className="btn cp-send-btn" onClick={() => sendMessage()} disabled={!newMsg.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
