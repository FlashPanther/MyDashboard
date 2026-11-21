import type { Metadata } from 'next';
import { MapList } from '@/components/mindmap/MapList';

export const metadata: Metadata = { title: 'Cartes' };

export default function CartesPage() {
  return <MapList />;
}
