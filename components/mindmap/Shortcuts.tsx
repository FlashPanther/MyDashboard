const SHORTCUTS: [string, string][] = [
  ['Tab', 'Ajouter un enfant'],
  ['Entrée', 'Modifier le nœud, puis ajouter un frère'],
  ['Ctrl Entrée', 'Ajouter un frère au-dessus'],
  ['Alt Entrée', 'Ajouter un parent'],
  ['Maj Tab', 'Revenir au parent'],
  ['Maj Entrée', 'Saut de ligne'],
  ['F, Ctrl /, clic sur le point', 'Replier, déplier'],
  ['← → ↑ ↓', 'Se déplacer'],
  ['Entrée, F2, double-clic', 'Modifier le texte : taper seul ne modifie rien'],
  ['Échap', 'Finir la saisie, désélectionner'],
  ['Suppr', 'Supprimer la branche'],
  ['Alt T', 'Transformer en tâche, ou redevenir une idée'],
  ['Alt C, clic sur la case', 'Cocher, décocher la tâche : chaque branche affiche ses tâches faites sur le total'],
  ['Glisser un nœud', 'Le déplacer avec sa branche : le lien en pointillés montre son futur parent'],
  ['Clic droit sur un nœud', 'Le transformer en tâche, le supprimer avec sa tâche Google, replier ou déplier sa branche'],
  ['Glisser sur le fond', 'Tracer un cadre pour sélectionner plusieurs nœuds, puis les supprimer ou les glisser ensemble'],
  ['Ctrl Z, Ctrl Maj Z', 'Annuler, rétablir'],
  ['= - 0 1', 'Zoom avant, arrière, 100 %, tout voir'],
  ['Molette, Maj molette', 'Déplacer la vue'],
  ['Ctrl molette', 'Zoomer'],
];

export function Shortcuts() {
  return (
    <details className="panel fixed bottom-3 right-3 max-w-[calc(100vw-1.5rem)] px-3 py-2 text-[13px]">
      <summary className="eyebrow cursor-pointer">Raccourcis</summary>
      <table className="mt-2 border-separate border-spacing-y-1">
        <tbody>
          {SHORTCUTS.map(([keys, effect]) => (
            <tr key={keys}>
              <td className="whitespace-nowrap pr-4 font-mono text-xs text-muted">{keys}</td>
              <td>{effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
