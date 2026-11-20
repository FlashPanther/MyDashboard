import type { Metadata } from 'next';
import { MindMap } from '@/components/mindmap/MindMap';

export const metadata: Metadata = { title: 'Carte' };

export default function CartePage() {
  return <MindMap />;
}
