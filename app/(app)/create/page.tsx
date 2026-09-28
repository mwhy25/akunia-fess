import { requireUser } from '@/lib/auth';
import { PostForm } from '@/components/post/PostForm';

export default async function CreatePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="display text-[clamp(44px,13vw,80px)]">Tulis<br /><span className="text-red">menfess</span></h1>
      <PostForm credits={user.credits} />
    </div>
  );
}
