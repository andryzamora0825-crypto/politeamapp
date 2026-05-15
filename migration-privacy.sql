-- Migration: Add privacy/visibility to posts and stories + profile privacy fields
-- Run this in Supabase SQL Editor

-- 1. Posts visibility
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
-- Values: 'public', 'friends', 'private', 'custom'

-- 2. Custom visibility (share with specific users)
CREATE TABLE IF NOT EXISTS post_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  UNIQUE(post_id, user_id)
);

-- 3. Stories visibility
ALTER TABLE stories ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';
-- Values: 'public', 'friends', 'private'

-- 4. Profile privacy fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_email boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_birthday boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday date;

-- 5. RLS for post_visibility
ALTER TABLE post_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their post visibility" ON post_visibility
  FOR ALL USING (
    EXISTS (SELECT 1 FROM posts WHERE posts.id = post_visibility.post_id AND posts.author_id = auth.uid()::text)
  );

CREATE POLICY "Users can see posts shared with them" ON post_visibility
  FOR SELECT USING (user_id = auth.uid()::text);

-- Allow anon/service for now (same pattern as other tables)
CREATE POLICY "anon_post_visibility" ON post_visibility FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "service_post_visibility" ON post_visibility FOR ALL TO service_role USING (true) WITH CHECK (true);
