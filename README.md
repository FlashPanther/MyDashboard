# Tableau du jour

Dashboard personnel local : agenda, tâches, courrier non lu, météo et trajet domicile–travail
sur une seule page. Tout tourne sur ta machine ; aucun jeton ne quitte le poste.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis remplir (voir plus bas)
npm run dev                  # http://localhost:3737
```

Adapte ensuite `dashboard.config.ts` : domicile, lieu de travail, gares, heure d'arrivée
au bureau, minutes de marche. C'est le seul fichier à modifier au quotidien.

## Relier Google (agenda, tâches, Gmail)

1. Sur [console.cloud.google.com](https://console.cloud.google.com/), crée un projet.
2. **API et services > Bibliothèque** : active *Google Calendar API*, *Google Tasks API*
   et *Gmail API*.
3. **Écran de consentement OAuth** : type « Externe », ajoute ton adresse comme
   utilisateur de test. L'application peut rester en mode test indéfiniment.
4. **Identifiants > Créer > ID client OAuth > Application Web**. Ajoute l'URI de
   redirection autorisée :
   `http://localhost:3737/api/auth/google/callback`
5. Copie l'identifiant et le secret dans `.env.local`.
6. Ouvre le dashboard et clique sur **Relier Google**. Le jeton de rafraîchissement est
   écrit dans `.data/tokens.json` (permissions 600, ignoré par git). Pour changer de
   compte : supprime ce fichier et relie à nouveau.

Les trois portées demandées sont en lecture seule (`calendar.readonly`, `tasks.readonly`,
`gmail.readonly`). Le dashboard n'écrit jamais dans ton compte.

## Maison ou bureau

Le tableau lit d'abord **ton agenda** : un évènement du jour dont le titre contient un mot
de `presence.officeKeywords` (« Présentiel ») signale une journée au bureau. C'est le bon
signal parce qu'il vaut **dès le matin**, quand tu es encore chez toi mais qu'il faut
attraper un train — le Wi-Fi, lui, dirait « maison » et masquerait le panneau Trajet au pire
moment.

L'heure de début de cet évènement devient l'heure à viser pour le repère « Partir » :
un « Présentiel » à 09:30 fait choisir un autre train qu'un à 09:00, sans rien reconfigurer.

À défaut d'évènement, le tableau retombe sur le **nom du réseau Wi-Fi**. Sous WSL, Linux ne
voit pas la carte Wi-Fi : `lib/providers/presence.ts` interroge Windows via
`netsh wlan show interfaces` (et retombe sur `iwgetid` ailleurs). Les SSID reconnus comme
la maison sont dans `presence.homeSsids` de `dashboard.config.ts`.

À la maison, le panneau Trajet disparaît et le repère « Partir » de la colonne du jour
aussi. La météo ne s'étire pas pour autant : **les sept jours sortent dans leur propre
panneau**, en liste verticale (jour, temps en toutes lettres, probabilité de pluie,
maximum et minimum). La colonne se remplit de contenu réel au lieu d'espace vide, et la
semaine y gagne en lisibilité. Les jours de bureau, elle reprend sa forme compacte en
cellules sous la prévision horaire. Le sélecteur **Maison / Bureau / Auto** de
l'en-tête force le choix quand le réseau ne dit rien : câble Ethernet, Wi-Fi invité,
partage de connexion. Le dernier état détecté est mémorisé pour que le panneau Trajet
n'apparaisse pas une fraction de seconde avant de disparaître à chaque chargement.

## Audience (Google Analytics)

Le panneau lit toutes les propriétés GA4 accessibles au compte relié (ou celles listées
dans `analytics.properties`) et affiche, par projet : les utilisateurs **en ligne à
l'instant**, les utilisateurs sur 7 jours, et une courbe des 28 derniers jours. L'infobulle
d'une ligne donne sessions et pages vues.

Deux prérequis, une seule fois :

1. Dans la console Google Cloud, activer **Google Analytics Data API** et
   **Google Analytics Admin API** (la seconde sert à lister les propriétés).
2. Relier à nouveau le compte depuis le dashboard : la portée `analytics.readonly` a été
   ajoutée et le jeton existant ne la couvre pas. Le panneau le dit et propose le lien.

Trois requêtes par propriété toutes les deux minutes, plafonné à 12 propriétés — loin des
quotas GA4 (25 000 jetons par jour et par propriété).

## Trajets

Les trains passent par [iRail](https://docs.irail.be/) : gratuit, sans clé, données SNCB
en temps réel (retards, voie, suppressions). Renseigne les noms de gares tels qu'iRail les
comprend, par exemple `Namur`, `Bruxelles-Central`, `Ottignies`.

Pour la voiture, `CAR_PROVIDER` accepte trois valeurs :

| Valeur   | Clé requise           | Trafic temps réel | Note                                   |
| -------- | --------------------- | ----------------- | -------------------------------------- |
| `osrm`   | aucune                | non               | Défaut. Serveur public de démonstration |
| `tomtom` | `TOMTOM_API_KEY`      | oui               | 2 500 requêtes/jour offertes            |
| `google` | `GOOGLE_MAPS_API_KEY` | oui               | Routes API, facturation à activer       |

Si un fournisseur payant est mal configuré, le dashboard retombe sur OSRM plutôt que de
faire disparaître le panneau.

## Le repère « Partir »

Sur la colonne de gauche, un bandeau ambre indique l'heure à laquelle quitter la maison.
Il prend le dernier train qui te dépose au bureau avant l'heure visée
(`workStart`), marche jusqu'à la gare comprise, et affiche la marge restante. Passé
l'heure de bureau, le repère disparaît : il n'a plus rien à dire.

## Ouvrir un élément

Chaque ligne renvoie vers sa page d'origine, dans un nouvel onglet : une tâche vers Google
Tasks (`webViewLink`), un mail vers Gmail, un événement vers Google Agenda **cadré sur sa
date**.

Pour l'agenda, viser la date plutôt que l'événement est délibéré : ouvrir un événement par
son lien direct (`htmlLink`) laisse Google Agenda choisir la vue, et il retombe sur celle
par défaut du compte — le mois. L'URL `/calendar/r/<vue>/<a>/<m>/<j>` impose la vue. Elle se
règle par `calendar.view` dans `dashboard.config.ts` (`customday` = vue personnalisée,
4 jours par défaut ; sinon `day`, `week`, `month`, `agenda`). Le lien direct vers la fiche
reste disponible dans le champ `eventUrl` de la réponse si tu changes d'avis.
Sur les blocs de l'agenda, la surface cliquable est le bloc entier — le lien du titre porte
un `::after` qui le recouvre — sauf le lien « rejoindre » d'une visio, qui repasse au-dessus.

Les départs de train ne sont pas cliquables : ni iRail ni la SNCB n'exposent d'URL stable
pour une liaison donnée.

## Météo

Deux requêtes Open-Meteo, jamais mises en cache :

- **Maintenant et les prochaines heures** viennent du modèle de `weather.shortRangeModel`
  (`dwd_icon_d2` par défaut : maille de 2,2 km, le plus fin sur la Belgique). Le modèle
  global voit la région de trop loin et annonce « couvert » là où le ciel est dégagé.
- **Les sept jours** viennent de `best_match` : les modèles fins ne portent que sur ~48 h.

Si le modèle fin ne couvre pas le point, tout retombe sur `best_match`.

Reste une limite qu'aucun réglage ne lève : Open-Meteo sert des **sorties de modèle, pas
des observations**. La couverture nuageuse est le champ le plus fragile ; elle peut se
tromper franchement sur un ciel local. Aucune API gratuite ne donne l'état réel du ciel
au-dessus d'un village belge.


Trois niveaux de lecture, du plus immédiat au plus détaillé : les conditions actuelles
(picto, température, ressenti, vent), les dix prochaines heures (un picto par heure), puis
sept jours nommés avec maximum et minimum.

Les pictos sont des SVG écrits à la main dans `components/WeatherIcon.tsx`, regroupant les
codes WMO en huit familles. Le soleil est ambre, le nuage neutre, la précipitation bleue —
et les gouttes sont franchement détachées du nuage, parce que c'est le seul indice qui
sépare « couvert » de « pluie ».

Les deux prévisions sont volontairement dissemblables : **les heures forment un bandeau
continu** sans séparation, **les jours des cellules détachées** — le temps continu se lit
comme une bande, les jours comme des unités. Chaque bloc porte son intitulé, et la journée
en cours est la seule cellule ambre.

La probabilité de pluie est une **ligne continue** sous les pictos, sur le même axe de
temps, avec sa propre échelle 0–100 % et une seule étiquette : le maximum. Elle disparaît
quand rien n'est annoncé — une ligne de texte le dit et rend sa place aux pictos, qui
grandissent. Température et probabilité de pluie ne
partagent jamais un même axe — deux mesures d'échelles différentes empilées sur un axe de
temps commun, jamais superposées.

## Disposition

Trois colonnes qui occupent toute la largeur de l'écran, ordonnées par importance :

| Colonne | Contenu | Largeur |
| --- | --- | --- |
| Gauche | la journée heure par heure | 24 % (27 % au-delà de 1280 px) |
| **Centre** | **courrier et tâches** — ce qu'on fait | la plus large |
| Droite | trajet et météo — ce qu'on consulte | la plus étroite |

Les trois colonnes s'installent dès 1024 px. En dessous, tout s'empile dans le même ordre :
le principal en premier, le consultatif en dernier.

## Compteurs

Les compteurs qui comptent — non lus, à faire aujourd'hui, à planifier — restent dans
l'en-tête de leur panneau, à leur taille, mais le **chiffre** est en gras et en ambre vif
pendant que son libellé reste discret. Il passe au jade à zéro : le tableau accuse
réception du travail fait.

## Tâches sans échéance

Elles remontent dans un bloc séparé en bas du panneau, les plus anciennes d'abord — celles
qu'on a le plus sûrement oubliées, triées sur le champ `updated` de Google Tasks. Le
compteur du panneau annonce combien il en reste (« 15 à planifier »), la puce est creuse
(rien n'est encore posé sur le calendrier) et la colonne de droite reste vide là où les
autres tâches portent leur date : c'est ce manque qui doit se voir.

Quand il n'en reste aucune, le bloc dit « Tout est planifié. »

## Liens vers les pages complètes

Le titre de chaque panneau ouvre sa source : l'agenda sur la vue configurée, Gmail sur
**le même filtre que le panneau** (`gmail.query`, donc les deux restent synchronisés),
Google Tasks. La météo et les trains n'ont pas d'URL stable par lieu ou par trajet : leurs
cibles sont dans `links` de `dashboard.config.ts`, à pointer où tu veux.

## Thèmes

Le sélecteur en haut à droite propose **Clair**, **Sombre** et **Auto**. « Auto » suit le
réglage du système d'exploitation ; les deux autres l'emportent dessus et sont retenus dans
`localStorage`. Un court script inline applique le choix avant le premier rendu, sinon la
page clignoterait dans l'autre thème le temps que React démarre.

L'ambre et le rose sont volontairement éloignés en teinte : ils se côtoient dans les listes
(« aujourd'hui » contre « en retard ») et un rouge-orange contre un rouge-brique était
indistinguable, deutéranopie ou non. Chaque signal coloré est de toute façon doublé d'un
mot — la couleur ne porte jamais l'information seule.

Les couleurs sont des tokens fonctionnels — `ground`, `panel`, `panel-soft`, `rule`, `ink`,
`muted`, plus les signaux `amber` / `jade` / `sky` / `rose`. Ils pointent vers des variables
`--t-*` redéfinies par thème dans `app/globals.css`. Pour ajuster une couleur, modifie la
variable, jamais l'utilitaire dans un composant. Les deux palettes tiennent le niveau AA
(rapport ≥ 4,5:1) sur tous les textes.

## Structure

```
app/api/          une route par source de données, tout en serveur
lib/providers/    iRail, Open-Meteo, itinéraires voiture
lib/google/       OAuth et renouvellement du jeton
lib/leave.ts      choix du train et calcul de l'heure de départ
components/ThemeToggle.tsx   sélecteur clair / sombre / auto
components/       DayColumn (la colonne temps) + widgets
dashboard.config.ts   tes réglages
```

## Notes

- La colonne du jour retient les événements qui **chevauchent** aujourd'hui, pas seulement
  ceux qui y commencent : un séjour entamé la semaine dernière reste visible tant qu'il
  dure, avec sa date de fin, et son lien ouvre l'agenda sur aujourd'hui plutôt que sur sa
  date de début.

- Le port est 3737 (`package.json`). Si tu le changes, mets à jour l'URI de redirection
  dans la console Google **et** dans `.env.local`.
- TypeScript est épinglé en 5.x : Next 15 ne lit pas encore la version 7.
