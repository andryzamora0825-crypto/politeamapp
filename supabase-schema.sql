-- ============================================
-- PoliTeam - LIMPIAR TABLAS ANTERIORES
-- Ejecutar PRIMERO si ya existen tablas
-- ============================================

DROP TABLE IF EXISTS public.comment_likes CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.posts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.increment_post_likes;
DROP FUNCTION IF EXISTS public.increment_post_comments;
DROP FUNCTION IF EXISTS public.increment_comment_likes;

-- ============================================
-- AHORA CREAR TODO DE NUEVO
-- ============================================

-- 1. PERFILES
CREATE TABLE public.profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_profiles_clerk_user_id ON public.profiles(clerk_user_id);

-- 2. POSTS
CREATE TABLE public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT NULL,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_posts_author_id ON public.posts(author_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);

-- 3. LIKES
CREATE TABLE public.likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);
CREATE INDEX idx_likes_post_id ON public.likes(post_id);

-- 4. COMENTARIOS (con respuestas anidadas)
CREATE TABLE public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  parent_comment_id UUID DEFAULT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_parent ON public.comments(parent_comment_id);

-- 5. LIKES EN COMENTARIOS
CREATE TABLE public.comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, comment_id)
);
CREATE INDEX idx_comment_likes_comment_id ON public.comment_likes(comment_id);

-- 6. AMISTADES
CREATE TABLE public.friendships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  friend_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);
CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);

-- 7. MENSAJES (Chat IG)
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  content TEXT DEFAULT '',
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','image','sticker','ephemeral')),
  image_url TEXT DEFAULT NULL,
  sticker_id TEXT DEFAULT NULL,
  ephemeral BOOLEAN DEFAULT FALSE,
  opened BOOLEAN DEFAULT FALSE,
  reaction TEXT DEFAULT NULL,
  deleted_for TEXT[] DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_created ON public.messages(created_at);

-- 8. HISTORIAS (24h)
CREATE TABLE public.stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX idx_stories_author ON public.stories(author_id);
CREATE INDEX idx_stories_expires ON public.stories(expires_at);

-- 9. VISTAS DE HISTORIAS
CREATE TABLE public.story_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);
CREATE INDEX idx_story_views_story ON public.story_views(story_id);

-- 10. BLOQUEOS
CREATE TABLE public.blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocker ON public.blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON public.blocks(blocked_id);

-- 11. REPORTES
CREATE TABLE public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  reported_id TEXT NOT NULL REFERENCES public.profiles(clerk_user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  context TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. FUNCIONES RPC
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id UUID, increment_by INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.posts SET likes_count = GREATEST(likes_count + increment_by, 0) WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_post_comments(post_id UUID, increment_by INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.posts SET comments_count = GREATEST(comments_count + increment_by, 0) WHERE id = post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.increment_comment_likes(comment_id UUID, increment_by INT DEFAULT 1)
RETURNS void AS $$
BEGIN
  UPDATE public.comments SET likes_count = GREATEST(likes_count + increment_by, 0) WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;

