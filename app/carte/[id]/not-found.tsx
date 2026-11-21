import Link from 'next/link';
import { Preparing } from '@/components/Preparing';

export default function CarteIntrouvable() {
  return (
    <Preparing>
      <span>
        Cette carte n’existe pas, ou plus.{' '}
        <Link href="/carte" className="underline">
          Retour aux cartes
        </Link>
      </span>
    </Preparing>
  );
}
