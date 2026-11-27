import Dashboard from '@/components/Dashboard';
import { getSnapshot } from '@/lib/status';
import type { StatusSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Geet Status',
  url: 'https://status.listengeet.com',
};

export default async function Page() {
  let initial: StatusSnapshot | null = null;
  try {
    initial = await getSnapshot();
  } catch {
    initial = null; // client will show "Checks unavailable"
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <Dashboard initial={initial} />
    </>
  );
}
