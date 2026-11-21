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
  - `sync.ts` : l'enregistrement vers le serveur (brouillon, un envoi à la fois, conflit entre appareils).
  - `store.ts`, `request.ts` : les fichiers de cartes côté serveur et la lecture des requêtes.
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

- [x] **6. Des tâches dans la carte, sans Google** : un nœud devient une tâche (`Alt` + `T` ou clic droit), se coche
  (`Alt` + `C` ou clic sur la case) et reste visible, barré. L'état vit dans la carte et son fichier.
- [x] **6 bis. L'avancement par branche** : chaque nœud qui contient des tâches affiche « faites / total ».
- [x] **6 ter. Masquer les tâches faites** : un interrupteur dans la barre. Une tâche faite disparaît avec ce qu'elle
  contient, sauf si sa branche garde une tâche à faire.
- [x] **7. Des cartes gardées par le serveur** : plusieurs cartes, chacune dans un fichier de `.data/cartes/` sur le
  volume, lues et écrites par `/api/cartes`. Une carte supprimée part dans `.data/cartes/corbeille/`.
  Le verrou d'écriture est en mémoire : une seule instance du tableau à la fois, comme pour les jetons Google.
- [x] **7 bis. L'éditeur branché sur le serveur** : `/carte` liste les cartes, `/carte/<id>` en ouvre une ; chaque
  modification part au serveur après un court silence, un brouillon reste dans le navigateur tant que le serveur n'a
  pas répondu, et une carte modifiée sur un autre appareil demande de choisir une version. La carte que le navigateur
  gardait avant se reprend d'un clic.
- [x] **7 ter. Supprimer une carte** depuis la liste, après confirmation ; elle part dans la corbeille du serveur.
- [x] **8. Un signal clair quand la liaison Google est à refaire** : un jeton refusé par Google est noté comme tel,
  l'en-tête du tableau affiche « Google expiré : relier ». Le signal sera repris dans la page Carte à l'étape 9.
- [ ] **8 bis. Une liaison qui tient** : cela dépend de Google Cloud, pas du code. Tant que l'application y est en état
  « Test », la liaison tombe après sept jours ; il faut la publier, puis relier de nouveau (voir le README).
- [ ] **9. Créer** : quand l'envoi est activé pour une carte, ses nœuds-tâches sans lien sont créés dans Google Tasks
  après un enregistrement, dans la liste nommée par `mindmap.taskList` de `dashboard.config.ts`, avec le chemin de la
  branche dans leur détail. L'envoi est activé d'office pour une carte neuve et proposé par un bouton pour une carte
  importée ou reprise. Chaque tâche porte une référence dans son détail : une tâche déjà créée est reconnue et reliée
  au lieu d'être recréée. Les liens (nœud → tâche Google) sont gardés par le serveur, à côté de la carte. Un nœud qui
  n'est plus une tâche garde son lien, marqué « détaché ». Codé et testé avec un faux Google ; **reste à essayer
  contre le vrai Google** avant de cocher.
- [ ] **10. Relire et cocher**, dans les deux sens.
- [ ] **11. Détacher ou supprimer** : retirer un nœud détache la tâche ; la supprimer pour de bon est un second geste.
  Supprimer une carte détache toutes ses tâches : c'est le serveur qui le fait, derrière la suppression.
- [ ] **12. Le menu latéral** des tâches Google qui ne sont dans aucune carte.
- [ ] **13. Reprendre les tâches existantes** et réduire le nombre de listes.
- [ ] **14. Alléger le tableau** : retirer l'ancien onglet « Carte », les panneaux de tâches devenus inutiles et les
  étiquettes dans les titres.

## Décisions à reprendre aux étapes suivantes

- **Qui déclenche l'envoi vers Google** : aujourd'hui l'éditeur, une seconde et demie après l'enregistrement, et à
  l'ouverture d'une carte. Une carte importée et jamais ouverte n'est donc pas envoyée. À l'étape 10, le serveur
  devra le faire lui-même derrière chaque enregistrement.
- **Comment le serveur parle à l'éditeur** : l'état coché vit dans la carte, que seul l'éditeur écrit. Quand Google
  dira « cochée ailleurs », la réponse de l'envoi des tâches portera ces changements, et l'éditeur les appliquera
  comme une modification ordinaire.
- **Carte supprimée** : ses liens partent avec elle dans la corbeille, les tâches restent chez Google (étape 11).
- **Carte importée deux fois** : l'envoi y est éteint tant qu'on ne l'active pas. Les nœuds à identifiant unique
  retrouvent leur tâche grâce à sa référence ; ceux d'une carte faite à la main (identifiants courts) seraient
  recréés. À revoir à l'étape 13.

## Limites de Google Tasks à garder en tête

Pas de champ libre dans une tâche, pas d'étoile ni de répétition visibles, une date sans heure, et aucun avertissement
quand une tâche change : la carte doit relire.
