/* eslint-disable */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { UserAvatar } from "../UserAvatar";
import { VerifiedBadge } from "../VerifiedBadge";
import { timeAgo } from "@/lib/utils";

interface LiveRoomProps { live: any; currentUserId: string; profile: any; onLeave: () => void; }
type Tool = "pen" | "eraser" | "text";

export function LiveRoom({ live, currentUserId, profile, onLeave }: LiveRoomProps) {
  const isCreator = live.creator_id === currentUserId;
  const [messages, setMessages] = useState<any[]>([]);
  const profilesCache = useRef<Record<string, any>>({});
  const [newMsg, setNewMsg] = useState("");
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(live.likes_count || 0);
  const [viewerCount, setViewerCount] = useState(live.viewer_count || 0);
  const [isLive, setIsLive] = useState(live.status === "live");
  const [showChat, setShowChat] = useState(true);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  // Refs to track current state inside broadcast closures (avoid stale closure bug)
  const cameraOnRef = useRef(false);
  const screenOnRef = useRef(false);
  const whiteboardOnRef = useRef(false);
  const creatorModeRef = useRef("idle");

  // Whiteboard
  const [tool, setTool] = useState<Tool>("pen");
  const [penColor, setPenColor] = useState("#1a2332");
  const [penSize, setPenSize] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textItems, setTextItems] = useState<{id:number;x:number;y:number;text:string;color:string}[]>([]);
  const [draggingText, setDraggingText] = useState<number|null>(null);
  const [editingText, setEditingText] = useState<number|null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const screenStreamRef = useRef<MediaStream|null>(null);
  const broadcastRef = useRef<any>(null);
  const [creatorMode, setCreatorMode] = useState<string>("idle");
  const [floatingHearts, setFloatingHearts] = useState<{id:number;x:number;y:number}[]>([]);
  const lastTapRef = useRef<number>(0);
  const heartIdRef = useRef(0);
  // WebRTC
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerRef = useRef<RTCPeerConnection|null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream|null>(null);
  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
  const supabase = createClient();

  // Join room
  useEffect(() => {
    supabase.rpc("increment_live_viewers", { p_live_id: live.id, increment_by: 1 });
    return () => { supabase.rpc("increment_live_viewers", { p_live_id: live.id, increment_by: -1 }); };
  }, []);

  // Messages + realtime
  useEffect(() => {
    fetchMessages();
    const ch = supabase.channel(`live-chat-${live.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `live_id=eq.${live.id}` }, async (p) => {
        const msg = p.new as any;
        if (profilesCache.current[msg.author_id]) {
          msg.author = profilesCache.current[msg.author_id];
        } else {
          const { data: prof } = await supabase.from("profiles").select("clerk_user_id, username, full_name, avatar_url, verified").eq("clerk_user_id", msg.author_id).single();
          if (prof) { msg.author = prof; profilesCache.current[msg.author_id] = prof; }
        }
        setMessages(prev => [...prev, msg]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${live.id}` }, (p) => {
        if (p.new.status === "ended") setIsLive(false);
        setViewerCount(p.new.viewer_count || 0);
        setLikesCount(p.new.likes_count || 0);
      })
      .subscribe();

    // Broadcast channel for whiteboard sync + mode
    const bc = supabase.channel(`live-board-${live.id}`);
    bc.on('broadcast', { event: 'stroke' }, ({ payload }) => {
      if (!isCreator && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx && payload) {
          ctx.strokeStyle = payload.color;
          ctx.lineWidth = payload.size;
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(payload.from.x, payload.from.y);
          ctx.lineTo(payload.to.x, payload.to.y);
          ctx.stroke();
        }
      }
    }).on('broadcast', { event: 'clear' }, () => {
      if (!isCreator && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); }
      }
      if (!isCreator) setTextItems([]);
    }).on('broadcast', { event: 'text_sync' }, ({ payload }) => {
      if (!isCreator) setTextItems(payload || []);
    }).on('broadcast', { event: 'mode' }, ({ payload }) => {
      if (!isCreator) {
        setCreatorMode(payload.mode);
        if (payload.mode.includes('whiteboard')) setShowWhiteboard(true);
        else setShowWhiteboard(false);
      }
    }).on('broadcast', { event: 'request_mode' }, () => {
      if (isCreator) {
        // Use refs — state is stale inside this closure
        const mode = creatorModeRef.current;
        bc.send({ type: 'broadcast', event: 'mode', payload: { mode } });
      }
    // WebRTC signaling
    }).on('broadcast', { event: 'viewer_join' }, ({ payload }) => {
      if (!isCreator) return;
      const viewerId = payload.viewerId;
      // Close and recreate if already exists (viewer reconnect)
      if (peersRef.current.has(viewerId)) {
        peersRef.current.get(viewerId)?.close();
        peersRef.current.delete(viewerId);
      }
      const pc = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(viewerId, pc);
      // Add current tracks
      if (streamRef.current) streamRef.current.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => pc.addTrack(t, screenStreamRef.current!));
      pc.onicecandidate = (e) => { if (e.candidate) bc.send({ type: 'broadcast', event: 'ice_candidate', payload: { candidate: e.candidate, from: currentUserId, target: viewerId } }); };
      // onnegotiationneeded fires automatically after addTrack — handles both initial offer and renegotiation
      let isNegotiating = false;
      pc.onnegotiationneeded = async () => {
        if (isNegotiating) return;
        isNegotiating = true;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          bc.send({ type: 'broadcast', event: 'offer', payload: { sdp: pc.localDescription, target: viewerId, from: currentUserId } });
        } catch (e) { /* ignore if connection closed */ }
        finally { isNegotiating = false; }
      };
      // If no tracks yet, onnegotiationneeded won't fire — send an initial offer manually
      if (!streamRef.current && !screenStreamRef.current) {
        pc.createOffer().then(offer => pc.setLocalDescription(offer)).then(() => {
          bc.send({ type: 'broadcast', event: 'offer', payload: { sdp: pc.localDescription, target: viewerId, from: currentUserId } });
        }).catch(() => {});
      }
    }).on('broadcast', { event: 'answer' }, ({ payload }) => {
      if (!isCreator || payload.target !== currentUserId) return;
      const pc = peersRef.current.get(payload.from);
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(() => {});
    }).on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (isCreator || payload.target !== currentUserId) return;
      // Use existing peer if available (renegotiation), else create new one
      let pc = peerRef.current;
      let rs: MediaStream;
      if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        pc = new RTCPeerConnection(rtcConfig);
        peerRef.current = pc;
        rs = new MediaStream();
        setRemoteStream(rs);
        pc.ontrack = (e) => {
          e.streams[0]?.getTracks().forEach(t => {
            // Replace existing track of same kind, or add new one
            const existing = rs.getTracks().find(x => x.kind === t.kind);
            if (existing) rs.removeTrack(existing);
            rs.addTrack(t);
          });
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = rs;
          setRemoteStream(new MediaStream(rs.getTracks())); // trigger re-render
        };
        pc.onicecandidate = (e) => { if (e.candidate) bc.send({ type: 'broadcast', event: 'ice_candidate', payload: { candidate: e.candidate, from: currentUserId, target: payload.from } }); };
      }
      pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        .then(() => pc!.createAnswer())
        .then(answer => pc!.setLocalDescription(answer))
        .then(() => { bc.send({ type: 'broadcast', event: 'answer', payload: { sdp: pc!.localDescription, target: payload.from, from: currentUserId } }); })
        .catch(() => {});
    }).on('broadcast', { event: 'ice_candidate' }, ({ payload }) => {
      if (payload.target !== currentUserId) return;
      const pc = isCreator ? peersRef.current.get(payload.from) : peerRef.current;
      if (pc) pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
    }).subscribe();
    broadcastRef.current = bc;

    // Viewer: request mode + WebRTC connection (retry until mode arrives)
    if (!isCreator) {
      let retries = 0;
      const viewerJoinInterval = setInterval(() => {
        bc.send({ type: 'broadcast', event: 'request_mode', payload: {} });
        bc.send({ type: 'broadcast', event: 'viewer_join', payload: { viewerId: currentUserId } });
        retries++;
        if (retries >= 6) clearInterval(viewerJoinInterval); // stop after 18s
      }, 3000);
      // First attempt immediately
      setTimeout(() => {
        bc.send({ type: 'broadcast', event: 'request_mode', payload: {} });
        bc.send({ type: 'broadcast', event: 'viewer_join', payload: { viewerId: currentUserId } });
      }, 600);
    }

    // Creator: periodic mode broadcast using refs (closure-safe)
    let modeInterval: any = null;
    if (isCreator) {
      modeInterval = setInterval(() => {
        const mode = creatorModeRef.current;
        bc.send({ type: 'broadcast', event: 'mode', payload: { mode } });
      }, 4000);
    }

    return () => {
      supabase.removeChannel(ch); supabase.removeChannel(bc);
      if (modeInterval) clearInterval(modeInterval);
      peersRef.current.forEach(pc => pc.close()); peersRef.current.clear();
      if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    supabase.from("live_likes").select("id").eq("live_id", live.id).eq("user_id", currentUserId).single().then(({ data }) => { if (data) setLiked(true); });
  }, []);

  // Bind remote stream to video
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, creatorMode]);

  // Camera
  const attachCamera = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) { el.srcObject = streamRef.current; }
  }, []);
  // Broadcast mode helper — also keeps refs in sync for use in closure-safe handlers
  const broadcastMode = (cam: boolean, scr: boolean, wb: boolean) => {
    let mode = 'idle';
    if (wb && cam) mode = 'camera+whiteboard';
    else if (wb) mode = 'whiteboard';
    else if (scr && cam) mode = 'camera+screen';
    else if (scr) mode = 'screen';
    else if (cam) mode = 'camera';
    // Update refs (readable from broadcast handlers despite stale closure)
    cameraOnRef.current = cam;
    screenOnRef.current = scr;
    whiteboardOnRef.current = wb;
    creatorModeRef.current = mode;
    setCreatorMode(mode);
    broadcastRef.current?.send({ type: 'broadcast', event: 'mode', payload: { mode } });
  };

  // Add tracks to all existing WebRTC peers
  const addTracksToPeers = (stream: MediaStream) => {
    peersRef.current.forEach((pc) => {
      stream.getTracks().forEach(track => {
        const senders = pc.getSenders();
        const existing = senders.find(s => s.track?.kind === track.kind);
        if (existing) existing.replaceTrack(track);
        else pc.addTrack(track, stream);
      });
    });
  };

  useEffect(() => {
    if (cameraOn && isCreator) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then((s) => {
          streamRef.current = s;
          if (videoRef.current) videoRef.current.srcObject = s;
          addTracksToPeers(s);
          broadcastMode(true, screenOn, showWhiteboard);
        })
        .catch(() => setCameraOn(false));
    } else if (!cameraOn) {
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (videoRef.current) videoRef.current.srcObject = null;
      if (isCreator) broadcastMode(false, screenOn, showWhiteboard);
    }
  }, [cameraOn]);

  // Screen share
  const attachScreen = useCallback((el: HTMLVideoElement | null) => {
    screenRef.current = el;
    if (el && screenStreamRef.current) { el.srcObject = screenStreamRef.current; }
  }, []);
  useEffect(() => {
    if (screenOn && isCreator) {
      navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        .then((s) => {
          screenStreamRef.current = s;
          if (screenRef.current) screenRef.current.srcObject = s;
          s.getVideoTracks()[0].onended = () => setScreenOn(false);
          addTracksToPeers(s);
          broadcastMode(cameraOn, true, showWhiteboard);
        })
        .catch(() => setScreenOn(false));
    } else if (!screenOn) {
      if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
      if (screenRef.current) screenRef.current.srcObject = null;
      if (isCreator) broadcastMode(cameraOn, false, showWhiteboard);
    }
  }, [screenOn]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  // Init canvas
  useEffect(() => {
    if (showWhiteboard && canvasRef.current) {
      const c = canvasRef.current;
      const p = c.parentElement;
      c.width = p?.clientWidth || 900;
      c.height = (p?.clientHeight || 600) - (isCreator ? 50 : 0);
      const ctx = c.getContext("2d");
      if (ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    }
  }, [showWhiteboard]);

  const fetchMessages = async () => {
    const { data } = await supabase.from("live_messages")
      .select("*, author:profiles(clerk_user_id, username, full_name, avatar_url, verified)")
      .eq("live_id", live.id).order("created_at", { ascending: true }).limit(200);
    setMessages(data || []);
  };

  const sendChat = async () => {
    if (!newMsg.trim()) return;
    const content = newMsg.trim();
    setNewMsg("");
    await supabase.from("live_messages").insert({ live_id: live.id, author_id: currentUserId, content });
  };

  const toggleLike = async () => {
    if (liked) {
      await supabase.from("live_likes").delete().eq("live_id", live.id).eq("user_id", currentUserId);
      await supabase.rpc("increment_live_likes", { p_live_id: live.id, increment_by: -1 });
      setLiked(false); setLikesCount(c => c - 1);
    } else {
      await supabase.from("live_likes").insert({ live_id: live.id, user_id: currentUserId });
      await supabase.rpc("increment_live_likes", { p_live_id: live.id, increment_by: 1 });
      setLiked(true); setLikesCount(c => c + 1);
    }
  };

  const endLive = async () => {
    await supabase.from("lives").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", live.id);
    setIsLive(false);
  };

  const shareLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/lives?join=${live.share_token}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // Drawing
  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const getTouchPos = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const t = e.touches[0];
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const lastPosRef = useRef<{x:number;y:number}|null>(null);
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isCreator) return;
    if (tool === "text") {
      const pos = getPos(e);
      const id = Date.now();
      const newItems = [...textItems, { id, x: pos.x, y: pos.y, text: "Texto", color: penColor }];
      setTextItems(newItems);
      setEditingText(id);
      broadcastRef.current?.send({ type: 'broadcast', event: 'text_sync', payload: newItems });
      return;
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    lastPosRef.current = pos;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isCreator) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    const color = tool === "eraser" ? "#ffffff" : penColor;
    const size = tool === "eraser" ? 20 : penSize;
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    if (lastPosRef.current) {
      broadcastRef.current?.send({ type: 'broadcast', event: 'stroke', payload: { from: lastPosRef.current, to: pos, color, size } });
    }
    lastPosRef.current = pos;
  };
  const stopDraw = () => { setIsDrawing(false); lastPosRef.current = null; };

  // Touch handlers for mobile whiteboard
  const touchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isCreator) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getTouchPos(e);
    lastPosRef.current = pos;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
  };
  const touchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isCreator) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getTouchPos(e);
    const color = tool === "eraser" ? "#ffffff" : penColor;
    const size = tool === "eraser" ? 20 : penSize;
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = color; ctx.lineWidth = size;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    if (lastPosRef.current) {
      broadcastRef.current?.send({ type: 'broadcast', event: 'stroke', payload: { from: lastPosRef.current, to: pos, color, size } });
    }
    lastPosRef.current = pos;
  };
  const touchEnd = () => { setIsDrawing(false); lastPosRef.current = null; };
  const clearCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    setTextItems([]);
    broadcastRef.current?.send({ type: 'broadcast', event: 'clear', payload: {} });
  };

  // Text drag
  const startDragText = (id: number, e: React.MouseEvent) => {
    if (!isCreator) return;
    e.preventDefault();
    setDraggingText(id);
    const onMove = (ev: MouseEvent) => {
      const wb = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (!wb) return;
      setTextItems(prev => {
        const next = prev.map(t => t.id === id ? { ...t, x: ev.clientX - wb.left, y: ev.clientY - wb.top } : t);
        broadcastRef.current?.send({ type: 'broadcast', event: 'text_sync', payload: next });
        return next;
      });
    };
    const onUp = () => { setDraggingText(null); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const colors = ["#1a2332", "#ef4444", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#f97316", "#fff"];
  const quickReactions = ["❤️", "😂", "🔥", "👏", "👍"];

  // Double-tap to like
  const handleDoubleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = heartIdRef.current++;
      setFloatingHearts(prev => [...prev, { id, x, y }]);
      setLikesCount((c: number) => c + 1);
      if (!liked) {
        setLiked(true);
        supabase.from("live_likes").insert({ user_id: currentUserId, live_id: live.id }).then(() => {});
      }
      supabase.rpc("increment_live_likes", { p_live_id: live.id, increment_by: 1 }).then(() => {});
    }
    lastTapRef.current = now;
  };

  return (
    <div className="lr-container">
      <div className="lr-main">
        {/* Topbar */}
        <div className="lr-topbar">
          <button className="btn btn-icon lr-back-btn" onClick={onLeave}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="lr-topbar-info">
            <UserAvatar src={live.creator?.avatar_url} name={live.creator?.full_name || "U"} size="sm" />
            <div>
              <span className="verified-name lr-topbar-name">{live.creator?.full_name}{live.creator?.verified && <VerifiedBadge size={13} />}</span>
              <span className="lr-topbar-title">{live.title}</span>
            </div>
          </div>
          <div className="lr-topbar-stats">
            {isLive ? <span className="lr-live-badge"><span className="lr-live-dot" /> EN VIVO</span> : <span className="lr-ended-badge">FINALIZADO</span>}
            <span className="lr-stat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> {viewerCount}</span>
            <span className="lr-stat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> {likesCount}</span>
          </div>
        </div>

        {/* Stage */}
        <div className="lr-stage" onClick={handleDoubleTap} style={{ position: "relative" }}>
          {showWhiteboard && (
            <div className="lr-whiteboard-wrap">
              {isCreator && (
                <div className="lr-wb-toolbar">
                  <button className={`lr-wb-tool ${tool === "pen" ? "active" : ""}`} onClick={() => setTool("pen")} title="Lápiz">✏️</button>
                  <button className={`lr-wb-tool ${tool === "eraser" ? "active" : ""}`} onClick={() => setTool("eraser")} title="Borrador">🧹</button>
                  <button className={`lr-wb-tool ${tool === "text" ? "active" : ""}`} onClick={() => setTool("text")} title="Texto">T</button>
                  <div className="lr-wb-divider" />
                  {colors.map(c => (
                    <button key={c} className={`lr-wb-color ${penColor === c ? "active" : ""}`} style={{ background: c, border: c === "#fff" ? "2px solid #ccc" : "2px solid transparent" }} onClick={() => { setPenColor(c); if (tool === "eraser") setTool("pen"); }} />
                  ))}
                  <div className="lr-wb-divider" />
                  <select className="lr-wb-size" value={penSize} onChange={(e) => setPenSize(Number(e.target.value))}>
                    <option value={2}>Fino</option><option value={4}>Normal</option><option value={8}>Grueso</option><option value={14}>Extra</option>
                  </select>
                  <button className="lr-wb-tool" onClick={clearCanvas} title="Limpiar">🗑️</button>
                  <div className="lr-wb-divider" />
                  <button className="lr-wb-tool lr-wb-close" onClick={() => { setShowWhiteboard(false); broadcastMode(cameraOn, screenOn, false); }} title="Cerrar pizarra">✕</button>
                </div>
              )}
              {!isCreator && (
                <div className="lr-wb-toolbar lr-wb-toolbar-viewer">
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📝 Pizarra del profesor</span>
                </div>
              )}
              <div style={{ position: "relative", flex: 1 }}>
                <canvas ref={canvasRef} className="lr-wb-canvas" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} style={{ cursor: isCreator ? (tool === "text" ? "text" : tool === "eraser" ? "cell" : "crosshair") : "default", touchAction: "none" }} />
                {textItems.map(t => (
                  <div key={t.id} className="lr-wb-text-item" style={{ left: t.x, top: t.y, color: t.color, cursor: isCreator ? "move" : "default" }} onMouseDown={(e) => startDragText(t.id, e)} onDoubleClick={() => isCreator && setEditingText(t.id)}>
                    {editingText === t.id ? (
                      <input className="lr-wb-text-input" autoFocus value={t.text} onChange={(e) => setTextItems(prev => prev.map(i => i.id === t.id ? { ...i, text: e.target.value } : i))} onBlur={() => setEditingText(null)} onKeyDown={(e) => { if (e.key === "Enter") setEditingText(null); }} />
                    ) : t.text}
                  </div>
                ))}
              </div>
              {cameraOn && (
                <div className="lr-pip">
                  <video ref={attachCamera} autoPlay muted playsInline className="lr-pip-video" />
                </div>
              )}
            </div>
          )}

          {/* Screen share (main view, no whiteboard) */}
          {!showWhiteboard && screenOn && isCreator && (
            <div className="lr-video-area">
              <video ref={attachScreen} autoPlay playsInline className="lr-video lr-screen-video" />
              {cameraOn && (
                <div className="lr-pip">
                  <video ref={attachCamera} autoPlay muted playsInline className="lr-pip-video" />
                </div>
              )}
            </div>
          )}

          {/* Camera only (no whiteboard, no screen) - creator */}
          {!showWhiteboard && !screenOn && cameraOn && isCreator && (
            <div className="lr-video-area">
              <video ref={attachCamera} autoPlay muted playsInline className="lr-video" />
            </div>
          )}

          {/* Viewer: show WebRTC remote stream */}
          {!isCreator && !showWhiteboard && (creatorMode === 'camera' || creatorMode === 'screen' || creatorMode === 'camera+screen') && (
            <div className="lr-video-area">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="lr-video" style={{ objectFit: creatorMode.includes('screen') ? 'contain' : 'cover' }} />
              ) : (
                <div className="lr-no-video">
                  <div className="search-spinner" />
                  <p className="lr-hint">Conectando stream...</p>
                </div>
              )}
            </div>
          )}

          {/* Nothing on — show idle status */}
          {!showWhiteboard && ((isCreator && !screenOn && !cameraOn) || (!isCreator && (creatorMode === 'idle' || (!creatorMode)))) && (
            <div className="lr-video-area">
              <div className="lr-no-video">
                <UserAvatar src={live.creator?.avatar_url} name={live.creator?.full_name || "U"} size="xl" />
                <h3>{live.title}</h3>
                {live.description && <p>{live.description}</p>}
                {!isLive && <span className="lr-replay-badge">Clase finalizada</span>}
                {isLive && isCreator && <p className="lr-hint">Activa la cámara, pizarra o pantalla desde los controles</p>}
                {isLive && !isCreator && <p className="lr-hint">Esperando que el profesor inicie la transmisión...</p>}
              </div>
            </div>
          )}
        </div>

        {/* Floating Hearts */}
        {floatingHearts.map(h => (
          <div key={h.id} className="lr-float-heart" style={{ left: h.x, top: h.y }} onAnimationEnd={() => setFloatingHearts(prev => prev.filter(p => p.id !== h.id))}>❤️</div>
        ))}

        {/* Controls */}
        <div className="lr-controls">
          <button className="lr-ctrl-btn lr-ctrl-exit" onClick={onLeave}>← Salir</button>
          {isCreator && isLive && (
            <>
              <button className={`lr-ctrl-btn ${cameraOn ? "lr-ctrl-on" : ""}`} onClick={() => setCameraOn(!cameraOn)}>📹 Cámara</button>
              <button className={`lr-ctrl-btn ${screenOn ? "lr-ctrl-on" : ""}`} onClick={() => setScreenOn(!screenOn)}>🖥️ Pantalla</button>
              <button className={`lr-ctrl-btn ${showWhiteboard ? "lr-ctrl-on" : ""}`} onClick={() => { const next = !showWhiteboard; setShowWhiteboard(next); broadcastMode(cameraOn, screenOn, next); }}>📝 Pizarra</button>
            </>
          )}
          <button className={`lr-ctrl-btn ${liked ? "lr-ctrl-liked" : ""}`} onClick={toggleLike}>
            {liked ? "❤️" : "🤍"} {likesCount}
          </button>
          <button className="lr-ctrl-btn" onClick={shareLink}>{copied ? "✅ ¡Copiado!" : "🔗 Compartir"}</button>
          <button className="lr-ctrl-btn" onClick={() => setShowChat(!showChat)}>💬 Chat</button>
          {isCreator && isLive && (
            <button className="lr-ctrl-btn lr-ctrl-end" onClick={endLive}>⏹ Finalizar</button>
          )}
        </div>
      </div>

      {/* Chat */}
      {showChat && (
        <div className="lr-chat">
          <div className="lr-chat-header">
            <h4>Chat en vivo</h4>
            <button className="btn btn-icon" onClick={() => setShowChat(false)} style={{ color: "rgba(255,255,255,0.5)" }}>✕</button>
          </div>
          <div className="lr-chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className="lr-chat-msg">
                <div className="lr-chat-msg-header">
                  <UserAvatar src={msg.author?.avatar_url} name={msg.author?.full_name || "?"} size="sm" />
                  <span className="lr-chat-msg-author"><span className="verified-name">{msg.author?.full_name || msg.author?.username || "Usuario"}{msg.author?.verified && <VerifiedBadge size={11} />}</span></span>
                </div>
                <span className="lr-chat-msg-text">{msg.content}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {isLive && (
            <div className="lr-chat-input-area">
              <input className="lr-chat-input" placeholder="Escribe un mensaje..." value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendChat(); } }} />
              <button className="btn btn-icon lr-chat-send" onClick={sendChat} disabled={!newMsg.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
