import { relayGet, relayPost } from '@/lib/relayRoute';

export const dynamic = 'force-dynamic';

export async function GET() {
  return relayGet('whatsapp');
}

export async function POST(request: Request) {
  return relayPost('whatsapp', request);
}
