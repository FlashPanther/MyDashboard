import type { MouseEvent } from 'react';

// Sans cela, l'appui prend le focus et la saisie en cours se ferme avant le clic.
export function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}
