import { packageExtension, publicOrigin } from '@/lib/extensionPackage';
import { redirectUri } from '@/lib/google/oauth';

export const dynamic = 'force-dynamic';

/**
 * L'extension du tableau en .zip, a decompresser puis charger dans Chrome
 * (« Charger l'extension non empaquetee »). Chrome refuse d'installer une
 * extension depuis un site : c'est le seul chemin hors Chrome Web Store.
 * Derriere la connexion, comme le reste.
 */
export async function GET() {
  const { zip, fileName } = await packageExtension(publicOrigin(redirectUri()));
  // Copie en Uint8Array : un Buffer n'est pas accepte tel quel comme corps de Response.
  return new Response(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'no-store',
    },
  });
}
