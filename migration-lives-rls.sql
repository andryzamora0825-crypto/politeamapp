-- ============================================
-- PoliTeam - RLS Policies para Lives
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- LIVES
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public lives" ON public.lives
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create lives" ON public.lives
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Creators can update their lives" ON public.lives
  FOR UPDATE USING (true);

CREATE POLICY "Creators can delete their lives" ON public.lives
  FOR DELETE USING (true);

-- LIVE MESSAGES
ALTER TABLE public.live_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live messages" ON public.live_messages
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can send messages" ON public.live_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their messages" ON public.live_messages
  FOR DELETE USING (true);

-- LIVE LIKES
ALTER TABLE public.live_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view live likes" ON public.live_likes
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like" ON public.live_likes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can unlike" ON public.live_likes
  FOR DELETE USING (true);
