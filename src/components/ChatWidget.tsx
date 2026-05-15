"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { timeAgo } from "@/lib/utils";

interface ChatWidgetProps {
  currentUserId: string;
  profile: any;
}

export function ChatWidget({ currentUserId, profile }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (open && !activeChat) fetchConversations();
  }, [open]);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.clerk_user_id);
      const channel = supabase
        .channel(`chat-${activeChat.clerk_user_id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${currentUserId}`,
        }, (payload) => {
          if (payload.new.sender_id === activeChat.clerk_user_id) {
            setMessages((prev) => [...prev, payload.new]);
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchConversations = async () => {
    const { data } = await supabase
      .from("friendships")
      .select(`
        *,
        friend:profiles!friendships_friend_id_fkey(clerk_user_id, username, full_name, avatar_url),
        user:profiles!friendships_user_id_fkey(clerk_user_id, username, full_name, avatar_url)
      `)
      .eq("status", "accepted")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    const convos = (data || []).map((f: any) =>
      f.user_id === currentUserId ? f.friend : f.user
    );
    setConversations(convos);
  };

  const fetchMessages = async (otherUserId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true })
      .limit(100);

    setMessages(data || []);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeChat) return;
    const msg = {
      sender_id: currentUserId,
      receiver_id: activeChat.clerk_user_id,
      content: newMsg.trim(),
    };

    const { data, error } = await supabase.from("messages").insert(msg).select().single();
    if (error) {
      console.error("Error enviando mensaje:", error);
      return;
    }
    if (data) {
      setMessages((prev) => [...prev, data]);
      setNewMsg("");
    }
  };

  if (!open) {
    return (
      <button className="chat-toggle" onClick={() => setOpen(true)} title="Chat">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </button>
    );
  }

  return (
    <>
      <button className="chat-toggle" onClick={() => { setOpen(false); setActiveChat(null); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div className="chat-panel">
        {!activeChat ? (
          <>
            <div className="chat-panel-header">
              <h3>Mensajes</h3>
            </div>
            <div className="chat-list">
              {conversations.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center", padding: 32 }}>
                  Agrega amigos para chatear
                </p>
              ) : (
                conversations.map((c: any) => (
                  <div key={c.clerk_user_id} className="chat-list-item" onClick={() => setActiveChat(c)}>
                    <UserAvatar src={c.avatar_url} name={c.full_name} size="sm" />
                    <div className="chat-list-item-info">
                      <div className="chat-list-item-name">{c.full_name}</div>
                      <div className="chat-list-item-last">Haz clic para chatear</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="chat-panel-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveChat(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <UserAvatar src={activeChat.avatar_url} name={activeChat.full_name} size="sm" />
                <h3 style={{ fontSize: "0.9rem" }}>{activeChat.full_name}</h3>
              </div>
            </div>
            <div className="chat-messages">
              {messages.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.sender_id === currentUserId ? "chat-message-sent" : "chat-message-received"}`}
                >
                  {msg.content}
                  <div className="chat-message-time">{timeAgo(msg.created_at)}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-row">
              <input
                className="chat-input"
                placeholder="Escribe un mensaje..."
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
              />
              <button className="btn btn-primary btn-sm" onClick={sendMessage}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
