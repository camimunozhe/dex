-- Premium feature: custom photos per card publication.

ALTER TABLE cards_collection
  ADD COLUMN IF NOT EXISTS custom_photos text[] NOT NULL DEFAULT '{}';

-- Storage bucket for the photos.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('card-photos', 'card-photos', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

-- RLS: anyone can read; only the owner can write/delete their own folder.
DROP POLICY IF EXISTS "Card photos are public" ON storage.objects;
CREATE POLICY "Card photos are public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-photos');

DROP POLICY IF EXISTS "Card photos: owner can upload" ON storage.objects;
CREATE POLICY "Card photos: owner can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'card-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Card photos: owner can update" ON storage.objects;
CREATE POLICY "Card photos: owner can update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'card-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Card photos: owner can delete" ON storage.objects;
CREATE POLICY "Card photos: owner can delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'card-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
