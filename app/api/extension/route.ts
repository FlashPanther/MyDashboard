import { packageExtension } from '@/lib/extensionPackage';

export const dynamic = 'force-dynamic';

/**
 * L'extension du tableau en .zip, a decompresser puis charger dans Chrome
 * (« Charger l'extension non empaquetee »). Chrome refuse d'installer une
 * extension depuis un site : c'est le seul chemin hors Chrome Web Store.
 * Derriere la connexion, comme le reste.
 */
export async function GET(request: Request) {
  // L'adresse vue par le navigateur : derriere Traefik, Host et X-Forwarded-Proto.
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host;

  const { zip, fileName } = await packageExtension(`${proto}://${host}`);
  return new Response(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
