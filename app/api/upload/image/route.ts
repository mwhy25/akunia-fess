import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, POST_IMAGE_BUCKET } from '@/lib/constants';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Cek magic bytes, bukan hanya Content-Type dari client (bisa dipalsukan).
function sniff(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45)
    return 'image/webp';
  return null;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  if (user.is_banned) return NextResponse.json({ error: 'Akun diblokir' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'File tidak ada' }, { status: 400 });

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Ukuran maksimal 5 MB' }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const real = sniff(bytes);
  if (!real || !ALLOWED_IMAGE_TYPES.includes(real)) {
    return NextResponse.json({ error: 'Hanya gambar JPG, PNG, WEBP, atau GIF' }, { status: 415 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${EXT[real]}`;
  const { error } = await supabaseAdmin.storage
    .from(POST_IMAGE_BUCKET)
    .upload(path, bytes, { contentType: real, upsert: false });
  if (error) return NextResponse.json({ error: 'Gagal upload' }, { status: 500 });

  const { data } = supabaseAdmin.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
