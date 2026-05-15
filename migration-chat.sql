-- ============================================
-- PoliTeam - MIGRACION: Chat IG + Historias
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- 1. ACTUALIZAR MENSAJES
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','image','sticker','ephemeral'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sticker_id TEXT DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ephemeral BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS opened BOOLEAN DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reaction TEXT DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for TEXT[] DEFAULT '{}';
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;
ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

-- 2. HISTORIAS
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_stories_author ON public.stories(author_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at);

-- 3. VISTAS DE HISTORIAS
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS idx_story_views_story ON public.story_views(story_id);

-- 4. BLOQUEOS
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON public.blocks(blocked_id);

-- 5. REPORTES
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  reported_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  context TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

-- 7. DESACTIVAR RLS EN TABLAS NUEVAS
ALTER TABLE public.stories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports DISABLE ROW LEVEL SECURITY;
