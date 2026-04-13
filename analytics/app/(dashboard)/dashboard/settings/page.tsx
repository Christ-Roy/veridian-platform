import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { SettingsForms } from './settings-forms';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/login');

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Paramètres du compte</h1>
      <SettingsForms email={session.user.email} />
    </div>
  );
}
