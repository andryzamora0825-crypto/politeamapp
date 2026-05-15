/* eslint-disable */
"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { CreatePost } from "./CreatePost";
import { PostCard } from "./PostCard";
import { Stories } from "./Stories";

interface FeedProps {
  currentUserId: string;
  profile: any;
}

export function Feed({ currentUserId, profile }: FeedProps) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const { data: postsData } = await supabase
      .from("posts")
      .select(`
        *,
        author:profiles!posts_author_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)
      `)
      .order("created_at", { ascending: false })
      .limit(80);

    if (postsData) {
      // Get friends list for filtering
      const { data: friendships } = await supabase.from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
      const friendIds = new Set((friendships || []).map((f: any) => f.user_id === currentUserId ? f.friend_id : f.user_id));

      // Get custom visibility entries for this user
      const { data: customVis } = await supabase.from("post_visibility")
        .select("post_id")
        .eq("user_id", currentUserId);
      const customPostIds = new Set((customVis || []).map((v: any) => v.post_id));

      // Get likes
      const { data: userLikes } = await supabase
        .from("likes")
        .select("post_id")
        .eq("user_id", currentUserId);
      const likedPostIds = new Set(userLikes?.map((l: any) => l.post_id) || []);

      // Filter by visibility
      const visiblePosts = postsData.filter((post: any) => {
        if (post.author_id === currentUserId) return true; // Always see own
        if (!post.visibility || post.visibility === "public") return true;
        if (post.visibility === "friends") return friendIds.has(post.author_id);
        if (post.visibility === "private") return false;
        if (post.visibility === "custom") return customPostIds.has(post.id);
        return true;
      });

      const enrichedPosts = visiblePosts.map((post: any) => ({
        ...post,
        isLiked: likedPostIds.has(post.id),
      }));

      setPosts(enrichedPosts);
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleNewPost = (newPost: any) => {
    setPosts((prev) => [
      { ...newPost, author: profile, isLiked: false },
      ...prev,
    ]);
  };

  const handlePostUpdate = (postId: string, updates: any) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...updates } : p)));
  };

  const handlePostDelete = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  return (
    <div>
      {/* Stories bar at top of feed */}
      <Stories currentUserId={currentUserId} profile={profile} />

      <CreatePost currentUserId={currentUserId} profile={profile} onNewPost={handleNewPost} />
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card post-card">
            <div className="post-header">
              <div className="skeleton skeleton-avatar" />
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text" style={{ width: "40%" }} />
                <div className="skeleton skeleton-text-sm" />
              </div>
            </div>
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            <div className="skeleton skeleton-image" />
          </div>
        ))
      ) : posts.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            <h3>No hay publicaciones aún</h3>
            <p>¡Sé el primero en compartir algo!</p>
          </div>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} currentUserId={currentUserId} onUpdate={handlePostUpdate} onDelete={handlePostDelete} />
        ))
      )}
    </div>
  );
}
