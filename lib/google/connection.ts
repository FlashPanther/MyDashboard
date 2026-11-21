export type Connection = 'connected' | 'expired' | 'absent';

export async function connectionOf(linked: boolean, renew: () => Promise<unknown>): Promise<Connection> {
  if (!linked) return 'absent';
  try {
    await renew();
    return 'connected';
  } catch (error) {
    // Seul un refus de Google dit que la liaison est à refaire ; une panne de réseau ne dit rien.
    return (error as Error)?.name === 'NotConnectedError' ? 'expired' : 'connected';
  }
}
