/** Une API Google a répondu par un code d'erreur : le code permet de distinguer « introuvable » d'une panne. */
export class GoogleHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleHttpError';
    this.status = status;
  }
}
