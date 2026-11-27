import { getSnapshot } from '@/lib/status';

export const dynamic = 'force-dynamic';

const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.has('refresh');
    return Response.json(await getSnapshot(force), { headers });
  } catch {
    return Response.json({ error: 'Status service misconfigured' }, { status: 500, headers });
  }
}
