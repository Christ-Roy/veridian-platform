import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  isServiceActive,
} from '@/lib/user-tenant';
import { LockedServicePage } from '@/components/locked-service-page';
import { PushDashboard } from './push-dashboard';

// Force-dynamic : le nombre d'abonnes peut changer a tout moment.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PushPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { cookies } = await import('next/headers');
  const cookieJar = await cookies();
  const asTenant = cookieJar.get('veridian_admin_as_tenant')?.value || null;
  const platformRole = (session.user as { platformRole?: string }).platformRole || null;
  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug: asTenant,
    requesterRole: platformRole,
  });
  const active = aggregateActiveServices(status);

  if (!status || !isServiceActive(active, 'push')) {
    const domain = status?.sites[0]?.domain ?? '';
    return <LockedServicePage service="push" siteDomain={domain} />;
  }

  return (
    <PushDashboard
      tenantId={status.tenant.id}
      pushCount={status.pushSubscriptionsCount}
    />
  );
}
