/* eslint-disable */
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { CommentSection } from "./CommentSection";
import { timeAgo } from "@/lib/utils";

interface PostCardProps {
  post: any;
  currentUserId: string;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
}

export function PostCard({ post, currentUserId, onUpdate, onDelete }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [showMenu, setShowMenu] = useState(false);
  const supabase = createClient();
  const isOwner = post.author_id === currentUserId;
  const author = post.author;
  const router = useRouter();

  const goToProfile = () => {
    if (author?.username) router.push(`/perfil/${author.username}`);
  };

  const toggleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount((c: number) => c + (newLiked ? 1 : -1));

    if (newLiked) {
      await supabase.from("likes").insert({ user_id: currentUserId, post_id: post.id });
      await supabase.rpc("increment_post_likes", { post_id: post.id, increment_by: 1 });
    } else {
      await supabase.from("likes").delete().eq("user_id", currentUserId).eq("post_id", post.id);
      await supabase.rpc("increment_post_likes", { post_id: post.id, increment_by: -1 });
    }
  };

  const handleDelete = async () => {
    await supabase.from("posts").delete().eq("id", post.id);
    onDelete(post.id);
  };

  const handleNewComment = () => {
    setCommentsCount((c: number) => c + 1);
  };

  return (
    <div className="card post-card">
      <div className="post-header">
        <div onClick={goToProfile} style={{ cursor: "pointer" }}>
          <UserAvatar src={author?.avatar_url} name={author?.full_name || "U"} />
        </div>
        <div className="post-author-info">
          <div className="post-author-name" onClick={goToProfile} style={{ cursor: "pointer" }}>
            <span className="verified-name">{author?.full_name || "Usuario"}{author?.verified && <VerifiedBadge />}</span>
          </div>
          <div className="post-time">
            {timeAgo(post.created_at)}
            <span className="post-privacy-icon" title={post.visibility === "friends" ? "Amigos" : post.visibility === "private" ? "Privado" : post.visibility === "custom" ? "Compartido" : "Público"}>
              {post.visibility === "friends" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ) : post.visibility === "private" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              ) : post.visibility === "custom" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              )}
            </span>
          </div>
        </div>
        {isOwner && (
          <div style={{ position: "relative" }}>
            <button className="btn btn-icon" onClick={() => setShowMenu(!showMenu)}>⋯</button>
            {showMenu && (
              <div style={{
                position: "absolute", right: 0, top: "100%", background: "var(--bg-secondary)",
                border: "1px solid var(--glass-border)", borderRadius: "var(--radius-md)",
                padding: "4px", minWidth: 140, zIndex: 10, boxShadow: "var(--shadow-md)"
              }}>
                <button className="btn btn-ghost btn-danger" style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={handleDelete}>🗑️ Eliminar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {post.content && <div className="post-content">{post.content}</div>}

      {post.image_url && (
        <div className="post-image-container">
          <img src={post.image_url} alt="Post" />
        </div>
      )}

      <div className="post-stats">
        {likesCount > 0 && <span>❤️ {likesCount}</span>}
        {commentsCount > 0 && (
          <span style={{ cursor: "pointer" }} onClick={() => setShowComments(true)}>
            💬 {commentsCount} comentario{commentsCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="post-actions">
        <button className={`post-action-btn ${liked ? "liked" : ""}`} onClick={toggleLike}>
          <span className="like-icon">{liked ? "❤️" : "🤍"}</span>
          Me gusta
        </button>
        <button className="post-action-btn" onClick={() => setShowComments(!showComments)}>
          💬 Comentar
        </button>
      </div>

      {showComments && (
        <CommentSection postId={post.id} currentUserId={currentUserId} onNewComment={handleNewComment} />
      )}
    </div>
  );
}
