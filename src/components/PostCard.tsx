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
              {post.visibility === "friends" ? " 👥" : post.visibility === "private" ? " 🔒" : post.visibility === "custom" ? " 👤" : " 🌍"}
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
