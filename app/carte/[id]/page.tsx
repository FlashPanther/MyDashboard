import type { Metadata } from 'next';
import { MindMap } from '@/components/mindmap/MindMap';

export const metadata: Metadata = { title: 'Carte' };

export default async function CartePage({ params }: { params: Promise<{ id: string }> }) {
  return <MindMap id={(await params).id} />;
}
