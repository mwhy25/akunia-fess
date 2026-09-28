export const rupiah = (n: number) => 'Rp' + n.toLocaleString('id-ID');

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

// Hitung panjang tweet ala X: URL dihitung 23 karakter, emoji dihitung 2.
export function tweetLength(text: string) {
  const urlRe = /https?:\/\/\S+/g;
  let len = 0;
  const noUrl = text.replace(urlRe, () => {
    len += 23;
    return '';
  });
  for (const ch of noUrl) {
    const cp = ch.codePointAt(0)!;
    len += cp > 0xffff || (cp >= 0x2190 && cp <= 0x2bff) || (cp >= 0x1f000) ? 2 : 1;
  }
  return len;
}
