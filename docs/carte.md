# La carte mentale du tableau

État au 20 novembre 2026. Les cases se cochent au fil des PR.

## Pourquoi

Vider sa tête dans une carte, transformer en tâches Google les nœuds qui sont des tâches, puis les planifier et les
cocher dans Google Agenda. La carte garde la structure ; Google Tasks garde l'état des tâches.

Règle : tout nœud-tâche d'une carte dont l'envoi est activé existe dans Google Tasks ; toutes les tâches Google ne sont
pas dans une carte. Seule exception : une tâche supprimée chez Google, que la carte signale sans la recréer.

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
- [x] **9. Créer** : quand l'envoi est activé pour une carte, ses nœuds-tâches sans lien sont créés dans Google Tasks
  après un enregistrement, dans la liste nommée par `mindmap.taskList` de `dashboard.config.ts`, avec le chemin de la
  branche dans leur détail. L'envoi est activé d'office pour une carte neuve et proposé par un bouton pour une carte
  importée ou reprise. Chaque tâche porte une référence dans son détail : une tâche déjà créée est reconnue et reliée
  au lieu d'être recréée. Les liens (nœud → tâche Google) sont gardés par le serveur, à côté de la carte. Un nœud qui
  n'est plus une tâche garde son lien, marqué « détaché ». Essayé contre le vrai Google le 21 novembre 2026.
- [ ] **10. De la carte vers Google** : cocher, décocher ou renommer un nœud lié met sa tâche Google à jour. Une tâche
  supprimée chez Google est notée perdue : la carte garde son nœud et n'y écrit plus. Codé et testé avec un Google en
  mémoire ; **reste à constater contre le vrai Google** avant de cocher.
- [ ] **10 bis. De Google vers la carte** : une tâche cochée ou renommée dans Google Tasks ou Google Agenda se coche ou
  se renomme dans la carte ouverte, au plus une minute plus tard. Champ par champ : changé d'un seul côté, l'autre
  suit ; changé des deux côtés, la carte l'emporte. Codé et testé avec un Google en mémoire ; **reste à constater
  contre le vrai Google** avant de cocher.
- [ ] **10 ter. Le serveur envoie de lui-même** : juste après chaque enregistrement, même si l'onglet se ferme, et toutes
  les cinq minutes ce qui n'a pas pu partir. Codé et testé avec un Google en mémoire ; **reste à constater en ligne**.
- [ ] **11. Détacher ou supprimer** : retirer un nœud détache sa tâche, qui reste chez Google. Le clic droit propose
  « Supprimer, avec sa tâche Google… » (ou « avec ses N tâches Google » pour une branche), avec confirmation : le nœud
  est retiré, et l'enregistrement qui le retire demande au serveur de supprimer ses tâches chez Google. Annuler après
  coup remet le nœud et crée une tâche neuve. Supprimer une carte détache ses tâches, qui restent chez Google. Codé et
  testé avec un Google en mémoire ; **reste à constater en ligne**.
- [ ] **12. Les tâches libres** : un panneau, ouvert depuis l'en-tête d'une carte qui envoie ses tâches, liste les tâches
  Google ouvertes qui ne sont dans aucune carte ; « Ajouter » la place sous le nœud sélectionné. La tâche reste dans sa
  liste Google : la carte suit chaque liste où elle a des tâches. Codé et testé avec un Google en mémoire ; **reste à
  constater en ligne**.
- [ ] **13. Reprendre les tâches existantes** et réduire le nombre de listes.
- [ ] **14. Alléger le tableau** : retirer l'ancien onglet « Carte », les panneaux de tâches devenus inutiles et les
  étiquettes dans les titres.

## Décisions à reprendre aux étapes suivantes

- **Qui déclenche l'envoi vers Google** : le serveur, juste après chaque enregistrement, et un tour toutes les cinq
  minutes pour ce qui n'a pas pu partir (en production seulement). Sans éditeur, Google n'est pas relu : ce qu'il a
  changé est lu à l'ouverture de la carte. L'éditeur ouvert redemande toutes les minutes, et 1,5 s après chaque
  enregistrement : ce second appel fait en partie doublon avec l'envoi du serveur, mais c'est lui qui rapporte à la
  carte ce que Google a changé. Une carte importée n'envoie rien tant que son envoi n'est pas activé.
- **Tâche reprise d'une autre liste** : elle reste dans sa liste ; la carte relit chaque liste où elle a des tâches. Une
  liste supprimée chez Google rend ses tâches « disparues » dans la carte. La carte ne propose pas de supprimer chez
  Google une tâche reprise. Une tâche déjà suivie par une autre carte n'est pas reprise une seconde fois : la carte le
  signale. Une carte importée peut désigner n'importe laquelle de tes tâches ; rien n'en part tant que son envoi n'est
  pas activé. À trancher avant l'étape 13 : garder N listes, ou déplacer les tâches reprises dans « Cartes ».
- **Une seule instance du tableau** : les verrous d'envoi vivent dans la mémoire du processus. À plusieurs instances,
  il faudrait une tâche planifiée Coolify ou un verrou dans un fichier.
- **Comment le serveur parle à l'éditeur** : l'état coché vit dans la carte, que seul l'éditeur écrit. Ce que Google a
  changé est rendu par l'envoi des tâches (`pulls`) et gardé dans le lien (`incoming`) tant que l'éditeur ne l'a pas
  repris ; l'éditeur l'applique comme une modification ordinaire. L'annuler aussitôt ne sert à rien : tant que le
  passage suivant ne l'a pas entériné, Google la redonne. Une fois entérinée, l'annuler la renvoie vers Google.
  Une carte fermée ne lit pas Google : elle reprend ses changements à l'ouverture. À l'étape 10 ter, le serveur pourra
  lire Google seul et garder ce qui arrive dans le lien, en attendant l'ouverture.
- **Carte supprimée** : ses liens partent avec elle dans la corbeille, les tâches restent chez Google (étape 11).
- **Carte importée deux fois** : l'envoi y est éteint tant qu'on ne l'active pas. Les nœuds à identifiant unique
  retrouvent leur tâche grâce à sa référence ; ceux d'une carte faite à la main (identifiants courts) seraient
  recréés. À revoir à l'étape 13.

## Limites de Google Tasks à garder en tête

Pas de champ libre dans une tâche, pas d'étoile ni de répétition visibles, une date sans heure, et aucun avertissement
quand une tâche change : la carte doit relire.
