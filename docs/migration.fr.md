# Remplacer une configuration existante

[English](migration.md)

Hapo fournit de nouvelles entités et commandes. Il ne transforme pas automatiquement des automatisations arbitraires.

1. **Inventorier et conserver.** Exporte les automatisations, scripts, scènes, tableaux de bord et configurations d’intégrations. Note les états des helpers, les automatismes déjà désactivés, chaque référence et la modification inverse. Croise les API et les fichiers : aucune source ne couvre tous les stockages.
2. **Configurer et comparer.** Ajoute les pièces et résidents dans Hapo. Observe ses décisions en laissant les consommateurs sur les anciennes entités. Explique les différences avant de basculer.
3. **Remplacer les lectures et commandes.** Mets à jour Halo, thermostats, volets, modèles YAML, AppDaemon, scènes, groupes, tableaux de bord et automatismes. Utilise les flux d’options et les API, sans éditer `.storage`. Adapte les déclencheurs au nouveau domaine. Un capteur binaire ne reçoit pas `input_boolean.turn_on` : utilise les actions Hapo ou ses commandes natives. `hapo.sleep` accepte également `toggle` pour un ancien bouton ; un sommeil indéterminé exige un choix explicite.
4. **Désactiver les anciens calculateurs.** Désactive les automatismes de présence, de mode maison et de remise à zéro du sommeil, tout en conservant leur configuration. `automation.turn_on` permet de les réactiver ; conserve aussi leurs éventuels états initiaux et réglages de désactivation dans le registre.
5. **Vérifier avant de retirer.** Recherche les anciens identifiants dans tous les consommateurs actifs, vérifie les nouveaux états et commandes, puis retire les helpers inutilisés. Conserve leurs exports. Les historiques, traces et sauvegardes ne sont pas des références actives.

Une récupération `unknown → away` ne doit pas lancer un appareil comme un nouveau départ. Exige un état précédent appartenant aux modes occupés connus. Vérifie d’abord la configuration et les conditions des consommateurs ; observe ensuite leur déclenchement normal sans lancer un aspirateur, déplacer un volet ou modifier la confidentialité d’une caméra pour tester.

## Correspondances analysées

La conception initiale s’appuie sur treize automatismes de pièces :

| Usage | Configuration Hapo |
| --- | --- |
| Chambre | Mouvement/porte, absence après 60 secondes. |
| Hall | Mouvement/portes, absence après 10 secondes. |
| Hall de nuit | Mouvement/portes, sans délai supplémentaire. |
| Buanderie | Mouvement et anticipation d’ouverture, 60 secondes après le mouvement. |
| Cuisine | Mouvement déclencheur ; radar et porte limités au maintien. |
| Cave | Contact OU activité. |
| Chaufferie | Mouvement OU deux portes ouvertes. |
| Bureau, WC, salle de bain, salle de sport, jardin | Bee avec les passages pertinents surveillés. |
| Salon | Activité locale, contexte de maison et exclusion facultative de l’unique personne éveillée dans le bureau. |

Les anciens Bee utilisaient une fenêtre de **20 secondes pour un mouvement actif** et de **13 secondes pour un mouvement inactif** après fermeture. Elles pouvaient ignorer une détection tardive réelle. Hapo les remplace par une stabilisation configurable, une détection confirmable plus tard et un comportement explicite porte ouverte. L’ouverture seule ne prouve pas une entrée ; l’anticipation reste une option.

En buanderie, une anticipation temporisée peut différer de l’ancienne combinaison « porte fermée depuis 15 secondes » et « mouvement inactif depuis 60 secondes ». Vérifie le délai choisi à l’usage. Conserve initialement les 20 secondes de confirmation de localisation si elles existent déjà.

Les autres capteurs du bureau restent des alternatives à confirmer, sans activation silencieuse. Les identifiants personnels et les sauvegardes de migration restent hors du dépôt public.
