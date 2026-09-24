import { type NextRequest } from 'next/server';
import { handle } from '@/lib/api';
import { fetchTrains } from '@/lib/providers/irail';
import { config } from '@/dashboard.config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const reverse = request.nextUrl.searchParams.get('sens') === 'retour';
  return handle(async () => ({
    from: reverse ? config.train.to : config.train.from,
    to: reverse ? config.train.from : config.train.to,
    walkToStation: reverse ? config.train.walkFromStation : config.train.walkToStation,
    departures: await fetchTrains(reverse),
    fetchedAt: new Date().toISOString(),
  }));
}
