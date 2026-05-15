"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { VerifiedBadge } from "./VerifiedBadge";
import { timeAgo } from "@/lib/utils";

interface CommentSectionProps {
  postId: string;
  currentUserId: string;
  onNewComment: () => void;
}

export function CommentSection({ postId, currentUserId, onNewComment }: CommentSectionProps) {
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => { fetchComments(); }, [postId]);

  const fetchComments = async () => {
    // Fetch ALL comments for this post (flat), then nest them client-side
    const { data } = await supabase.from("comments")
      .select(`*, author:profiles!comments_author_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)`)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    const commentIds = (data || []).map((c: any) => c.id);
    const { data: likedComments } = await supabase.from("comment_likes")
      .select("comment_id").eq("user_id", currentUserId)
      .in("comment_id", commentIds.length ? commentIds : ["none"]);
    const likedSet = new Set(likedComments?.map((l: any) => l.comment_id) || []);

    // Build tree
    const enriched = (data || []).map((c: any) => ({ ...c, isLiked: likedSet.has(c.id), replies: [] as any[] }));
    const map = new Map<string, any>();
    const roots: any[] = [];
    for (const c of enriched) map.set(c.id, c);
    for (const c of enriched) {
      if (c.parent_comment_id && map.has(c.parent_comment_id)) {
        map.get(c.parent_comment_id).replies.push(c);
      } else {
        roots.push(c);
      }
    }
    setComments(roots);
    setLoading(false);
  };

  const submitComment = async (parentId: string | null = null) => {
    const text = parentId ? replyText : newComment;
    if (!text.trim()) return;

    const { data } = await supabase.from("comments").insert({
      post_id: postId, author_id: currentUserId, content: text.trim(), parent_comment_id: parentId,
    }).select(`*, author:profiles!comments_author_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)`).single();

    if (data) {
      await supabase.rpc("increment_post_comments", { post_id: postId, increment_by: 1 });
      onNewComment();
      // Re-fetch to rebuild tree properly
      fetchComments();
      if (parentId) { setReplyTo(null); setReplyText(""); }
      else { setNewComment(""); }
    }
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("comments").delete().eq("id", commentId);
    await supabase.rpc("increment_post_comments", { post_id: postId, increment_by: -1 });
    fetchComments();
  };

  const toggleCommentLike = async (commentId: string, isLiked: boolean) => {
    if (isLiked) {
      await supabase.from("comment_likes").delete().eq("user_id", currentUserId).eq("comment_id", commentId);
      await supabase.rpc("increment_comment_likes", { comment_id: commentId, increment_by: -1 });
    } else {
      await supabase.from("comment_likes").insert({ user_id: currentUserId, comment_id: commentId });
      await supabase.rpc("increment_comment_likes", { comment_id: commentId, increment_by: 1 });
    }
    setComments(prev => updateCommentLike(prev, commentId, !isLiked));
  };

  const updateCommentLike = (list: any[], id: string, liked: boolean): any[] => {
    return list.map(c => {
      if (c.id === id) return { ...c, isLiked: liked, likes_count: c.likes_count + (liked ? 1 : -1) };
      if (c.replies?.length) return { ...c, replies: updateCommentLike(c.replies, id, liked) };
      return c;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, parentId: string | null = null) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(parentId); }
  };

  const renderComment = (comment: any, depth: number = 0) => (
    <div key={comment.id} style={{ marginLeft: depth > 0 ? Math.min(depth * 24, 72) : 0 }}>
      <div className="comment-item">
        <UserAvatar src={comment.author?.avatar_url} name={comment.author?.full_name || "U"} size="sm" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="comment-bubble">
            <div className="comment-author">
              <span className="verified-name">{comment.author?.full_name || "Usuario"}{comment.author?.verified && <VerifiedBadge size={13} />}</span>
            </div>
            <div className="comment-text">{comment.content}</div>
          </div>
          <div className="comment-actions">
            <button className={comment.isLiked ? "liked-comment" : ""} onClick={() => toggleCommentLike(comment.id, comment.isLiked)}>
              {comment.isLiked ? "❤️" : "Me gusta"} {comment.likes_count > 0 ? comment.likes_count : ""}
            </button>
            <button onClick={() => setReplyTo({ id: comment.id, name: comment.author?.full_name || "Usuario" })}>Responder</button>
            {comment.author_id === currentUserId && (
              <button className="comment-delete-btn" onClick={() => deleteComment(comment.id)}>Eliminar</button>
            )}
            <span>{timeAgo(comment.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Reply input for this comment */}
      {replyTo?.id === comment.id && (
        <div className="comment-reply-input" style={{ marginLeft: Math.min((depth + 1) * 24, 72) }}>
          <div className="comment-input-row">
            <UserAvatar src="" name="U" size="sm" />
            <input className="comment-input" placeholder={`Responder a ${replyTo.name}...`} value={replyText}
              onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => handleKeyDown(e, comment.id)} autoFocus />
            <button className="btn btn-ghost btn-sm" onClick={() => submitComment(comment.id)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Nested replies */}
      {comment.replies?.length > 0 && comment.replies.map((reply: any) => renderComment(reply, depth + 1))}
    </div>
  );

  if (loading) return <div className="comments-section"><div className="skeleton skeleton-text" /></div>;

  return (
    <div className="comments-section">
      <div className="comment-input-row">
        <UserAvatar src="" name="U" size="sm" />
        <input className="comment-input" placeholder="Escribe un comentario..." value={newComment}
          onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => handleKeyDown(e)} />
        <button className="btn btn-ghost btn-sm" onClick={() => submitComment()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      {comments.map(c => renderComment(c, 0))}
    </div>
  );
}
