"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "../UserAvatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { StickerPicker } from "./StickerPicker";
import { timeAgo } from "@/lib/utils";

interface ChatPanelProps {
  currentUserId: string;
  profile: any;
}

type MsgType = "text" | "image" | "sticker" | "ephemeral";

export function ChatPanel({ currentUserId, profile }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (open && !activeChat) fetchConversations();
  }, [open]);

  // Listen for sidebar "Mensajes" button
  useEffect(() => {
    const handler = () => { setOpen(true); };
    window.addEventListener("open-chat", handler);
    return () => window.removeEventListener("open-chat", handler);
  }, []);

  useEffect(() => {
    fetchUnread();
    const ch = supabase.channel("unread-global").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${currentUserId}` }, () => fetchUnread()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

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

  const fetchUnread = async () => {
    const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("receiver_id", currentUserId).eq("read", false);
    setUnreadCount(count || 0);
  };

  const fetchConversations = async () => {
    const { data } = await supabase.from("friendships")
      .select("*, friend:profiles!friendships_friend_id_fkey(clerk_user_id, username, full_name, avatar_url, verified), user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("status", "accepted").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    const { data: blocked } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", currentUserId);
    const blockedIds = new Set(blocked?.map(b => b.blocked_id) || []);
    const convos = (data || []).map((f: any) => f.user_id === currentUserId ? f.friend : f.user).filter((c: any) => !blockedIds.has(c.clerk_user_id));

    // Get last message for each
    for (const c of convos) {
      const { data: lastMsg } = await supabase.from("messages").select("content, message_type, created_at")
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
    fetchUnread();
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
    if (!c.lastMessage) return "Inicia una conversacion";
    switch (c.lastMessage.message_type) {
      case "image": case "ephemeral": return "Envio una imagen";
      case "sticker": return "Envio un sticker";
      default: return c.lastMessage.content?.substring(0, 35) + (c.lastMessage.content?.length > 35 ? "..." : "") || "";
    }
  };

  // Toggle button
  if (!open) {
    return (
      <button className="ig-chat-toggle" onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        {unreadCount > 0 && <span className="ig-chat-badge">{unreadCount}</span>}
      </button>
    );
  }

  return (
    <div className="ig-chat-overlay">
      <div className="ig-chat">
        {/* Left: Conversations */}
        <div className={`ig-chat-sidebar ${activeChat ? "ig-hide-mobile" : ""}`}>
          <div className="ig-chat-sidebar-header">
            <button className="btn btn-icon" onClick={() => { setOpen(false); setActiveChat(null); }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <h2>Mensajes</h2>
          </div>
          <div className="ig-chat-list">
            {conversations.length === 0 ? (
              <div className="ig-chat-empty-list">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <p>Agrega amigos para chatear</p>
              </div>
            ) : conversations.map((c) => (
              <div key={c.clerk_user_id} className={`ig-chat-item ${activeChat?.clerk_user_id === c.clerk_user_id ? "active" : ""}`} onClick={() => setActiveChat(c)}>
                <div className="ig-chat-item-avatar">
                  <UserAvatar src={c.avatar_url} name={c.full_name} size="md" />
                  {c.unread > 0 && <span className="ig-chat-item-dot" />}
                </div>
                <div className="ig-chat-item-info">
                  <span className="ig-chat-item-name">
                    <span className="verified-name">{c.full_name}{c.verified && <VerifiedBadge size={13} />}</span>
                  </span>
                  <span className="ig-chat-item-preview">{getLastMsgPreview(c)}</span>
                </div>
                {c.lastMessage && <span className="ig-chat-item-time">{timeAgo(c.lastMessage.created_at)}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Messages */}
        <div className={`ig-chat-main ${!activeChat ? "ig-hide-mobile" : ""}`}>
          {!activeChat ? (
            <div className="ig-chat-empty">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              <h3>Tus mensajes</h3>
              <p>Selecciona un chat para empezar</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="ig-chat-header">
                <button className="btn btn-icon ig-show-mobile" onClick={() => setActiveChat(null)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <UserAvatar src={activeChat.avatar_url} name={activeChat.full_name} size="sm" />
                <div className="ig-chat-header-info">
                  <span className="verified-name">{activeChat.full_name}{activeChat.verified && <VerifiedBadge size={14} />}</span>
                  <span className="ig-chat-header-sub">@{activeChat.username}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <button className="btn btn-icon" onClick={() => setShowOptions(!showOptions)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                  {showOptions && (
                    <div className="ig-chat-options">
                      <button onClick={deleteChat}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        Eliminar chat
                      </button>
                      <button onClick={blockUser} className="ig-chat-opt-danger">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        Bloquear
                      </button>
                      <button onClick={reportUser} className="ig-chat-opt-danger">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                        Reportar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="ig-chat-messages" onClick={() => { setShowOptions(false); setShowStickers(false); }}>
                {messages.map((msg) => {
                  const isMine = msg.sender_id === currentUserId;
                  const isEphemeral = msg.message_type === "ephemeral";
                  const isSticker = msg.message_type === "sticker";
                  const isImage = msg.message_type === "image";

                  return (
                    <div key={msg.id} className={`ig-msg ${isMine ? "ig-msg-sent" : "ig-msg-received"}`}>
                      <div className="ig-msg-bubble" onDoubleClick={() => reactToMessage(msg.id, "❤️")}>
                        {isSticker && (
                          <div className="ig-msg-sticker">{msg.sticker_id}</div>
                        )}
                        {isEphemeral && !msg.opened && !isMine && (
                          <button className="ig-msg-ephemeral-btn" onClick={() => openEphemeral(msg.id)}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                            Foto efimera - Toca para ver
                          </button>
                        )}
                        {isEphemeral && msg.opened && (
                          <div className="ig-msg-ephemeral-opened">Foto vista</div>
                        )}
                        {isEphemeral && !msg.opened && isMine && msg.image_url && (
                          <div className="ig-msg-img"><img src={msg.image_url} alt="" /><span className="ig-msg-ephemeral-label">Efimera</span></div>
                        )}
                        {isImage && msg.image_url && (
                          <div className="ig-msg-img"><img src={msg.image_url} alt="" /></div>
                        )}
                        {msg.content && !isSticker && <div className="ig-msg-text">{msg.content}</div>}
                        <div className="ig-msg-meta">
                          <span>{timeAgo(msg.created_at)}</span>
                          {isMine && <span className="ig-msg-read">{msg.read ? "✓✓" : "✓"}</span>}
                        </div>
                        {msg.reaction && <span className="ig-msg-reaction">{msg.reaction}</span>}
                      </div>
                      {/* Quick reactions on hover */}
                      <div className="ig-msg-reactions-bar">
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
              {showStickers && <StickerPicker onSelect={sendSticker} onClose={() => setShowStickers(false)} />}

              {/* Input */}
              <div className="ig-chat-input-area">
                <button className="btn btn-icon" onClick={() => setShowStickers(!showStickers)} title="Stickers">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button className="btn btn-icon" onClick={() => imageInputRef.current?.click()} title="Imagen">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </button>
                <button className={`btn btn-icon ${ephemeralMode ? "ig-ephemeral-active" : ""}`} onClick={() => setEphemeralMode(!ephemeralMode)} title="Foto efimera">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); }} />
                <input className="ig-chat-input" placeholder={ephemeralMode ? "Modo efimero activado..." : "Escribe un mensaje..."} value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
                <button className="btn btn-icon ig-send-btn" onClick={() => sendMessage()} disabled={!newMsg.trim()}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
