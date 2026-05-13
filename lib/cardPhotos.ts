import { supabase } from '@/lib/supabase';

export const MAX_CUSTOM_PHOTOS = 5;

/**
 * Upload a photo from a local asset URI to the user's card-photos bucket.
 * Returns the public URL (cache-busted).
 */
export async function uploadCardPhoto(params: {
  userId: string;
  cardId: string;
  uri: string;
}): Promise<{ url: string } | { error: string }> {
  const { userId, cardId, uri } = params;
  const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext) ? ext : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const path = `${userId}/${cardId}/${filename}`;

  let arrayBuffer: ArrayBuffer;
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    arrayBuffer = await new Response(blob).arrayBuffer();
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo leer la imagen' };
  }

  const { error: upErr } = await supabase.storage
    .from('card-photos')
    .upload(path, arrayBuffer, {
      contentType: `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`,
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data } = supabase.storage.from('card-photos').getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function deleteCardPhoto(url: string): Promise<{ error: string | null }> {
  try {
    // Extract path after "/card-photos/"
    const marker = '/card-photos/';
    const idx = url.indexOf(marker);
    if (idx === -1) return { error: 'URL inválida' };
    const path = url.slice(idx + marker.length).split('?')[0];
    const { error } = await supabase.storage.from('card-photos').remove([path]);
    return { error: error?.message ?? null };
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo eliminar' };
  }
}
