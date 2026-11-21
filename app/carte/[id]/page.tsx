import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MindMap } from '@/components/mindmap/MindMap';
import { readMap } from '@/lib/mindmap/store';

export const metadata: Metadata = { title: 'Carte' };
export const dynamic = 'force-dynamic';

export default async function CartePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const map = await readMap(id);
  if (!map) notFound();
  return <MindMap id={id} server={{ revision: map.revision, root: map.root }} />;
}
