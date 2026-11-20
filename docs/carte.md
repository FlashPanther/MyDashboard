# La carte mentale du tableau

État au 20 novembre 2026. Les cases se cochent au fil des PR.

## Pourquoi

Vider sa tête dans une carte, transformer en tâches Google les nœuds qui sont des tâches, puis les planifier et les
cocher dans Google Agenda. La carte garde la structure ; Google Tasks garde l'état des tâches.

Règle : tout nœud-tâche existe dans Google Tasks ; toutes les tâches Google ne sont pas dans une carte.

## Comment c'est construit

- `lib/mindmap/` : le cœur, sans React ni navigateur, testé avec `npm test`.
  - `tree.ts` : l'arbre et sa lecture depuis un fichier. Une modification rend une nouvelle carte, l'ancienne reste
    intacte (c'est ce qui rendra l'annulation simple).
  - `layout.ts` : la place de chaque nœud, à droite et à gauche de la racine.
  - `view.ts` : le zoom et le cadrage.
  - `drop.ts` : où irait un nœud glissé (futur parent, rang, côté).
  - `keymap.ts` : quelle touche donne quelle commande.
  - `editor.ts` : l'état de l'éditeur (carte, sélection, saisie en cours, historique) et toutes ses règles :
    nœud vide qui disparaît, étapes d'annulation, sélection après une suppression.
- `components/mindmap/` : l'affichage, en composants React.
- `app/carte/` : la page plein écran, ouverte depuis l'en-tête du tableau.

La couleur et le côté d'une branche sont portés par son nœud de premier niveau ; ses descendants en héritent.

## Étapes

Reconstruction de l'éditeur (il existait à part, on le rebâtit ici avec les mêmes fonctions) :

- [x] **1. Voir une carte** : page plein écran, import et export d'un fichier, zoom et défilement à la molette,
  replier et déplier une branche. La carte est gardée dans le navigateur.
- [x] **2. Éditer au clavier** : créer, renommer, supprimer, se déplacer, annuler, avec les raccourcis des cartes
  mentales de Whimsical.
- [x] **3. Glisser les nœuds** : réordonner, changer de parent, passer de l'autre côté de la racine.
- [x] **4. Sélection au cadre** : supprimer ou déplacer plusieurs nœuds ensemble.
- [x] **5. Menu de branche** : replier ou déplier toute une branche.

Puis le lien avec Google Tasks :

- [ ] **6. Des tâches dans la carte, sans Google** : nœud-tâche, case à cocher, tâche faite barrée, avancement par
  branche, interrupteur pour masquer les tâches faites.
- [ ] **7. La carte enregistrée par le serveur**, sur son volume : même carte sur tous les appareils.
- [ ] **8. Une connexion Google qui tient**, et un signal clair quand elle est à refaire.
- [ ] **9. Créer** : marquer un nœud comme tâche la crée dans Google Tasks, avec le chemin de la branche dans son
  détail.
- [ ] **10. Relire et cocher**, dans les deux sens.
- [ ] **11. Détacher ou supprimer** : retirer un nœud détache la tâche ; la supprimer pour de bon est un second geste.
- [ ] **12. Le menu latéral** des tâches Google qui ne sont dans aucune carte.
- [ ] **13. Reprendre les tâches existantes** et réduire le nombre de listes.
- [ ] **14. Alléger le tableau** : retirer l'ancien onglet « Carte », les panneaux de tâches devenus inutiles et les
  étiquettes dans les titres.

## Limites de Google Tasks à garder en tête

Pas de champ libre dans une tâche, pas d'étoile ni de répétition visibles, une date sans heure, et aucun avertissement
quand une tâche change : la carte doit relire.
