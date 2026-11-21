export async function register() {
  // Écrit ainsi pour que Next retire cet import de la version « edge » : il charge des modules propres à Node.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTaskRounds } = await import('./lib/mindmap/background');
    startTaskRounds();
  }
}
