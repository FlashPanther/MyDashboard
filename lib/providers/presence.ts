import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const NETSH = '/mnt/c/Windows/System32/netsh.exe';

/**
 * Nom du reseau Wi-Fi courant, ou null si on ne peut pas le savoir.
 *
 * Sous WSL, Linux ne voit pas la carte Wi-Fi : c'est Windows qu'il faut
 * interroger. La sortie de netsh est en page de code Windows, mais le SSID
 * lui-meme reste lisible apres le deux-points.
 */
export async function currentSsid(): Promise<string | null> {
  try {
    const { stdout } = await run(NETSH, ['wlan', 'show', 'interfaces'], {
      timeout: 5000,
      encoding: 'utf8',
    });
    const match = stdout.match(/^\s*SSID[^:]*:\s*(.+)$/im);
    const ssid = match?.[1]?.trim();
    if (ssid) return ssid;
  } catch {
    // Pas de WSL, pas de carte Wi-Fi, ou machine sur cable.
  }

  try {
    const { stdout } = await run('iwgetid', ['-r'], { timeout: 3000, encoding: 'utf8' });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
