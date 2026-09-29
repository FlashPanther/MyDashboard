import { config } from '@/dashboard.config';
import { relayGet, relayPost } from '@/lib/relayRoute';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Les discussions en sourdine restent hors du tableau, comme sur le telephone.
  return relayGet('whatsapp', (chat) => config.whatsapp.includeMuted || !chat.muted);
}

export async function POST(request: Request) {
  return relayPost('whatsapp', request);
}
