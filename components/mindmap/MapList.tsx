'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { writeJson } from '@/components/mindmap/writeJson';
import { Preparing } from '@/components/Preparing';
import type { MapSummary } from '@/lib/mindmap/store';
import { newNode, parse, type MapNode } from '@/lib/mindmap/tree';
import { readStored, writeStored } from '@/lib/storage';
import { relative } from '@/lib/time';
import { useEndpoint } from '@/lib/useEndpoint';

const BROWSER_MAP_KEY = 'carte.document';

function browserMap(): MapNode | null {
  try {
    const stored = readStored(BROWSER_MAP_KEY);
    const map = stored ? parse(stored) : null;
    return map && map.children.length > 0 ? map : null;
  } catch {
    return null;
  }
}

export function MapList() {
  const router = useRouter();
  const list = useEndpoint<{ maps: MapSummary[] }>('/api/cartes', 0);
  const [local, setLocal] = useState<MapNode | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const notice = failure || list.error;

  useEffect(() => setLocal(browserMap()), []);

  async function create(root: MapNode): Promise<boolean> {
    setBusy(true);
    setFailure('');
    const { status, body } = await writeJson('/api/cartes', 'POST', { root });
    const { id, error } = (body ?? {}) as { id?: string; error?: string };
    if (status === 200 && id) {
      router.push(`/carte/${id}`);
      return true;
    }
    setFailure(error ?? 'Création impossible');
    setBusy(false);
    return false;
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    let root: MapNode;
    try {
      root = parse(await file.text());
    } catch {
      return setFailure(`« ${file.name} » n'est pas une carte valide.`);
    }
    await create(root);
  }

  const maps = list.data?.maps;
  if (!maps && !notice) return <Preparing>Préparation des cartes…</Preparing>;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-mono text-xs text-muted hover:text-ink">
          ← Tableau
        </Link>
        <h1 className="font-display text-xl font-extrabold uppercase tracking-[0.16em] text-ink">Cartes</h1>
        <button type="button" className="action" disabled={busy} onClick={() => create(newNode('Idée centrale'))}>
          Nouvelle carte
        </button>
        <button type="button" className="action" disabled={busy} onClick={() => fileInput.current?.click()}>
          Importer
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void importFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </header>

      {notice && (
        <p role="status" className="font-mono text-xs text-amber">
          {notice}
        </p>
      )}

      {local && (
        <section className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">
            Une carte est gardée dans ce navigateur seulement : <strong>{local.text || 'sans titre'}</strong>.
          </p>
          <button
            type="button"
            className="action"
            disabled={busy}
            onClick={async () => (await create(local)) && writeStored(BROWSER_MAP_KEY, null)}
          >
            La mettre sur le serveur
          </button>
        </section>
      )}

      {maps && maps.length === 0 && <p className="text-sm text-muted">Aucune carte sur le serveur pour l’instant.</p>}

      <ul className="flex flex-col gap-2">
        {maps?.map((map) => (
          <li key={map.id}>
            <Link href={`/carte/${map.id}`} className="panel flex items-baseline justify-between gap-4 px-4 py-3 hover:border-ink">
              <span className="min-w-0 truncate font-display font-bold text-ink">{map.title || 'Sans titre'}</span>
              <time dateTime={map.updatedAt} className="shrink-0 font-mono text-xs text-muted">
                {relative(map.updatedAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
