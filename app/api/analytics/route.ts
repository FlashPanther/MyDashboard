import { handle } from '@/lib/api';
import { fetchAnalytics } from '@/lib/providers/analytics';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(fetchAnalytics);
}
