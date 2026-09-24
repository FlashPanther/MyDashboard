import { type NextRequest } from 'next/server';
import { handle } from '@/lib/api';
import { fetchCarRoute } from '@/lib/providers/car';
import { config } from '@/dashboard.config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reverse = request.nextUrl.searchParams.get('sens') === 'retour';
  return handle(async () => ({
    from: reverse ? config.work.label : config.home.label,
    to: reverse ? config.home.label : config.work.label,
    route: await fetchCarRoute(reverse),
    fetchedAt: new Date().toISOString(),
  }));
}
