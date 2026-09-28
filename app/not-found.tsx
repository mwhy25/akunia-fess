import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-5 text-center">
      <p className="display text-[120px] text-red">404</p>
      <p className="mb-6 text-mute">Halaman ini tidak ada atau sudah dipindah.</p>
      <Link href="/" className="btn">Kembali ke beranda</Link>
    </main>
  );
}
