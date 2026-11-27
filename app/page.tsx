import Dashboard from '@/components/Dashboard';
import { getSnapshot } from '@/lib/status';
import type { StatusSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let initial: StatusSnapshot | null = null;
  try {
    initial = await getSnapshot();
  } catch {
    initial = null; // client will show "Checks unavailable"
  }
  return <Dashboard initial={initial} />;
}
