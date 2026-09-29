/**
 * Reglages du dashboard. C'est le seul fichier a editer au quotidien.
 * Les valeurs ci-dessous sont des exemples : remplace-les par tes vrais lieux.
 */

export type Place = {
  label: string;
  lat: number;
  lon: number;
};

export const config = {
  /** Affiche dans l'en-tete. */
  owner: 'Thomas',
  locale: 'fr-BE',
  timezone: 'Europe/Brussels',

  /** Domicile : sert a la meteo et au point de depart des trajets. */
  home: {
    label: 'Frasnes-Lez-Buissenal',
    lat: 50.6677298,
    lon: 3.6224653,
  } as Place,

  /** Lieu de travail : point d'arrivée des trajets. */
  work: {
    label: 'Bruxelles',
    lat: 50.8352666,
    lon: 4.3300396,
  } as Place,

  /** Heure a laquelle tu veux etre au bureau (24h, heure locale). */
  workStart: '09:00',

  /** Jours ouvres (0 = dimanche). Le widget trajet se met en veille les autres jours. */
  workDays: [1, 2, 3, 4, 5],

  train: {
    /** Noms de gares tels que les comprend iRail (ex: "Namur", "Bruxelles-Central"). */
    from: 'Leuze',
    to: 'Bruxelles-Midi',
    /** Minutes de marche entre chez toi et la gare de depart. */
    walkToStation: 12,
    /** Minutes de marche entre la gare d'arrivée et le bureau. */
    walkFromStation: 8,
  },

  weather: {
    /**
     * Modele utilise pour « maintenant » et les prochaines heures.
     * 'dwd_icon_d2' : maille de 2,2 km, le plus fin sur la Belgique, ~48 h.
     * 'best_match'  : le choix d'Open-Meteo, plus grossier mais toujours dispo.
     * Les sept jours viennent toujours de 'best_match' : les modeles fins ne
     * vont pas si loin.
     */
    shortRangeModel: 'dwd_icon_d2',
  },

  /**
   * Ou tu travailles. Le tableau masque le trajet et le repere « Partir »
   * quand tu es a la maison. La detection se fait sur le nom du reseau Wi-Fi ;
   * l'en-tete permet de forcer Maison ou Bureau quand elle se trompe.
   */
  presence: {
    /**
     * Un evenement du jour dont le titre contient un de ces mots signale une
     * journee au bureau. C'est le signal principal : il vaut des le matin,
     * quand tu es encore chez toi mais qu'il faut prendre un train.
     */
    officeKeywords: ['présentiel'],
    /** Signal de repli : le Wi-Fi, qui dit ou tu es a l'instant present. */
    homeSsids: ['VOO-930VM6F'],
  },

  analytics: {
    /**
     * 'all' = toutes les proprietes GA4 auxquelles ton compte a acces.
     * Sinon une liste d'identifiants : ['properties/123456', '789012'].
     */
    properties: 'all' as 'all' | string[],
    /**
     * Proprietes a masquer quand 'all' est utilise. Identifiant complet ou nu.
     * Les nouvelles proprietes apparaissent d'elles-memes ; celles-ci restent
     * cachees.
     */
    exclude: [
      'properties/293895850', // combustibois
      'properties/391962794', // monpatro
      'properties/256060531', // gilets-jaunes
      'properties/273637268', // sebbienbon
    ],
  },

  /** Nombre de secondes entre deux rafraichissements, par widget. */
  refresh: {
    calendar: 300,
    tasks: 300,
    gmail: 120,
    weather: 600,
    commute: 60,
    presence: 120,
    analytics: 120,
    // Lecture de ce que l'extension a pousse : rien ne part vers Meta.
    whatsapp: 30,
    messenger: 30,
  },

  /**
   * Pages ouvertes depuis le titre des panneaux. Agenda, Gmail et Tasks sont
   * deduits automatiquement ; ces deux-la n'ont pas d'URL stable par lieu ou par
   * trajet, alors ils sont ici pour que tu les pointes ou tu veux.
   */
  links: {
    weather: 'https://www.meteo.be/fr/belgique',
    train: 'https://www.belgiantrain.be/fr',
  },

  gmail: {
    /** Requete Gmail. "is:unread in:inbox" = non lus de la boite principale. */
    query: 'is:unread in:inbox', /** category:primary',*/
    maxResults: 9,
    /** Mails suivis (etoiles dans Gmail), lus ou non : onglet « Suivis » du panneau Courrier. */
    starred: {
      query: 'is:starred',
      maxResults: 9,
    },
  },

  calendar: {
    /**
     * 'visible' = tous les agendas coches dans Google Agenda. Decoche-en un
     * la-bas et il disparait d'ici. Remplace par une liste d'identifiants
     * (ex: ['primary', 'xxx@group.calendar.google.com']) pour choisir a la main.
     */
    calendarIds: 'visible' as 'visible' | string[],
    /** Fenetre affichee sur la colonne temps (heures locales). */
    dayStart: 7,
    dayEnd: 24,
    /**
     * Vue ouverte au clic sur un evenement. Google Agenda ignore la vue quand on
     * ouvre un evenement par son lien direct : il retombe sur la vue par defaut
     * du compte, souvent le mois. On vise donc la date, pas l'evenement.
     * 'customday'  = vue personnalisee (4 jours par defaut dans Google Agenda)
     * 'day' | 'week' | 'month' | 'agenda' = les vues fixes
     */
    view: 'customday',
  },
} as const;

export type DashboardConfig = typeof config;
