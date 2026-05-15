"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "./UserAvatar";
import { VerifiedBadge } from "./VerifiedBadge";

interface StoriesProps {
  currentUserId: string;
  profile: any;
}

export function Stories({ currentUserId, profile }: StoriesProps) {
  const [stories, setStories] = useState<any[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const supabase = createClient();

  useEffect(() => { fetchStories(); }, []);

  const fetchStories = async () => {
    const { data } = await supabase.from("stories")
      .select("*, author:profiles!stories_author_id_fkey(clerk_user_id, username, full_name, avatar_url, verified)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    // Group by author
    const groups: any = {};
    for (const s of data || []) {
      const uid = s.author_id;
      if (!groups[uid]) groups[uid] = { author: s.author, stories: [], author_id: uid };
      groups[uid].stories.push(s);
    }
    setStories(Object.values(groups));
  };

  const createStory = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${currentUserId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("stories").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("stories").getPublicUrl(path);
    await supabase.from("stories").insert({ author_id: currentUserId, image_url: urlData.publicUrl });
    setUploading(false);
    fetchStories();
  };

  const openStory = async (group: any) => {
    setActiveStoryGroup(group);
    setActiveIndex(0);
    setViewerOpen(true);
    setProgress(0);
    // Mark as viewed
    for (const s of group.stories) {
      await supabase.from("story_views").upsert({ story_id: s.id, viewer_id: currentUserId }, { onConflict: "story_id,viewer_id" });
    }
    startTimer();
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    timerRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          nextStory();
          return 0;
        }
        return prev + 2;
      });
    }, 100);
  };

  const nextStory = () => {
    setActiveIndex(prev => {
      const next = prev + 1;
      if (next >= (activeStoryGroup?.stories?.length || 0)) {
        closeViewer();
        return prev;
      }
      setProgress(0);
      return next;
    });
  };

  const prevStory = () => {
    setActiveIndex(prev => {
      if (prev <= 0) return 0;
      setProgress(0);
      return prev - 1;
    });
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setActiveStoryGroup(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => {
    if (viewerOpen) startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeIndex, viewerOpen]);

  const hasMyStory = stories.some(g => g.author_id === currentUserId);

  return (
    <>
      <div className="stories-bar">
        {/* Create story */}
        <div className="story-item" onClick={() => fileRef.current?.click()}>
          <div className="story-ring story-ring-create">
            <div className="story-avatar">
              <UserAvatar src={profile?.avatar_url} name={profile?.full_name || "U"} size="md" />
              <div className="story-plus">+</div>
            </div>
          </div>
          <span className="story-name">{uploading ? "Subiendo..." : "Tu historia"}</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) createStory(f); }} />
        </div>

        {/* Stories */}
        {stories.map(group => (
          <div key={group.author_id} className="story-item" onClick={() => openStory(group)}>
            <div className={`story-ring ${group.author_id === currentUserId ? "story-ring-seen" : "story-ring-unseen"}`}>
              <div className="story-avatar">
                <UserAvatar src={group.author?.avatar_url} name={group.author?.full_name || "U"} size="md" />
              </div>
            </div>
            <span className="story-name">{group.author_id === currentUserId ? "Tu" : group.author?.full_name?.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      {/* Viewer fullscreen */}
      {viewerOpen && activeStoryGroup && (
        <div className="story-viewer" onClick={closeViewer}>
          <div className="story-viewer-content" onClick={(e) => e.stopPropagation()}>
            {/* Progress bars */}
            <div className="story-viewer-progress">
              {activeStoryGroup.stories.map((_: any, i: number) => (
                <div key={i} className="story-progress-bar">
                  <div className="story-progress-fill" style={{ width: i < activeIndex ? "100%" : i === activeIndex ? `${progress}%` : "0%" }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="story-viewer-header">
              <UserAvatar src={activeStoryGroup.author?.avatar_url} name={activeStoryGroup.author?.full_name || "U"} size="sm" />
              <span className="verified-name" style={{ color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}>
                {activeStoryGroup.author?.full_name}
                {activeStoryGroup.author?.verified && <VerifiedBadge size={14} />}
              </span>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", marginLeft: 8 }}>
                {timeAgoShort(activeStoryGroup.stories[activeIndex]?.created_at)}
              </span>
              <button className="story-viewer-close" onClick={closeViewer}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Image */}
            <img className="story-viewer-img" src={activeStoryGroup.stories[activeIndex]?.image_url} alt="Historia" />

            {/* Nav */}
            <div className="story-viewer-nav-left" onClick={prevStory} />
            <div className="story-viewer-nav-right" onClick={nextStory} />
          </div>
        </div>
      )}
    </>
  );
}

function timeAgoShort(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m`;
  return `${h}h`;
}
