import { handle } from '@/lib/api';
import { fetchWeather } from '@/lib/providers/weather';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(fetchWeather);
}
