import { handle } from '@/lib/api';
import { currentSsid } from '@/lib/providers/presence';
import { config } from '@/dashboard.config';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    const ssid = await currentSsid();
    return {
      ssid,
      /** null quand le reseau ne dit rien : cable, ou Wi-Fi illisible. */
      atHome: ssid ? (config.presence.homeSsids as readonly string[]).includes(ssid) : null,
      fetchedAt: new Date().toISOString(),
    };
  });
}
