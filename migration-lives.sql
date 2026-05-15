-- ============================================
-- PoliTeam - LIVES (Educación en Vivo)
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- 1. LIVES
CREATE TABLE IF NOT EXISTS public.lives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
  is_public BOOLEAN DEFAULT TRUE,
  thumbnail_url TEXT DEFAULT NULL,
  likes_count INT DEFAULT 0,
  viewer_count INT DEFAULT 0,
  share_token TEXT DEFAULT encode(gen_random_bytes(8), 'hex'),
  whiteboard_data JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lives_creator ON public.lives(creator_id);
CREATE INDEX IF NOT EXISTS idx_lives_status ON public.lives(status);
CREATE INDEX IF NOT EXISTS idx_lives_share ON public.lives(share_token);

-- 2. LIVE MESSAGES (Chat en vivo)
CREATE TABLE IF NOT EXISTS public.live_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  live_id UUID NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_messages_live ON public.live_messages(live_id);
CREATE INDEX IF NOT EXISTS idx_live_messages_created ON public.live_messages(created_at);

-- 3. LIVE LIKES
CREATE TABLE IF NOT EXISTS public.live_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  live_id UUID NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(live_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_live_likes_live ON public.live_likes(live_id);

-- 4. FUNCIONES RPC
CREATE OR REPLACE FUNCTION public.increment_live_likes(p_live_id UUID, increment_by INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.lives SET likes_count = GREATEST(likes_count + increment_by, 0) WHERE id = p_live_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_live_viewers(p_live_id UUID, increment_by INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.lives SET viewer_count = GREATEST(viewer_count + increment_by, 0) WHERE id = p_live_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lives;
