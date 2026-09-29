import { handle } from '@/lib/api';
import { whatsappSnapshot } from '@/lib/providers/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(whatsappSnapshot);
}
