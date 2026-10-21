# Profils, sources et faits de maison

[English](rules.md)

Les six profils partagent une condition de déclenchement, des conditions facultatives d’autorisation et de libération, des délais de confirmation et les commandes manuelles. Les sources acceptent les états, les attributs simples et les valeurs numériques. ET, OU et NON conservent le résultat indéterminé lorsqu’il est nécessaire. Les seuils sont stricts (`>` / `<`). L’hystérésis élargit la plage active jusqu’au franchissement du seuil moins/plus la marge. Les attributs booléens utilisent `true` et `false`.

La durée continue d’une condition (`for`, en secondes) exige qu’elle reste vraie sans interruption. Une indisponibilité interrompt cette confirmation. Les horaires utilisent le fuseau Home Assistant et peuvent traverser minuit. Les références internes aux pièces, faits et modes permettent de détecter les cycles ; utilise ces références typées plutôt que les identifiants bruts des entités Hapo.

## Fonctionnement

- **Direct, mouvement et logique :** la condition de déclenchement est évaluée, puis les transitions sont confirmées selon les délais d’occupation et d’absence. Le profil direct suit une présence maintenue ; le mouvement suit une activité ; le profil logique permet une combinaison générale.
- **Déclenchement et maintien séparés :** seules les sources de déclenchement peuvent démarrer la présence. Les sources de maintien prolongent uniquement une présence déjà active. L’absence commence à être confirmée lorsque plus aucune de ces sources ne la soutient.
- **Contextuel :** une activité locale déclenche la présence. Elle est conservée jusqu’à une condition de libération vraie ou une autorisation fausse. Un contexte indéterminé dégrade le résultat. Une libération avec durée continue permet d’exprimer une règle d’inactivité explicite.
- **Bee in the Box :** chaque porte décrit ses états **ouverts**. L’ouverture de n’importe quelle porte libère la mémoire. La fermeture de toutes les portes lance une stabilisation ; une détection confirmée après cette stabilisation crée la mémoire. Par défaut, une détection tardive peut aussi la créer sans ouverture. La présence reste mémorisée sans mouvement tant que les portes restent fermées. Une durée maximale facultative peut l’expirer. Porte ouverte, les sources et le délai d’absence spécifique s’appliquent.

Le principe Bee est également appelé [Wasp in a Box](https://github.com/dlashua/hass-wasp_sensor). Hapo implémente son propre moteur événementiel. Cette déduction suppose que tous les passages utiles sont surveillés ; elle ne compte pas les entrées et sorties.

L’anticipation à l’ouverture et le maintien tant qu’une porte reste ouverte sont deux options distinctes. L’anticipation exige une ouverture réellement observée ; une porte déjà ouverte au démarrage ne suffit pas. Elle dure le plus grand des délais normal et porte ouverte, avec un minimum d’une seconde, sauf si une vraie détection prend le relais. Cette dernière utilise ensuite son délai d’absence normal. L’anticipation n’est pas suivie d’une deuxième temporisation identique.

### Exiger une ouverture avant une nouvelle présence Bee

Chaque pièce Bee peut activer **Exiger une ouverture avant une nouvelle présence** (`require_opening`). L’option est **désactivée par défaut**, y compris pour les pièces existantes, afin de conserver le comportement décrit ci-dessus. Elle est utile pour un jardin où le vent déclenche des mouvements alors que tous les accès surveillés restent fermés.

Une fois l’option activée, un mouvement ne peut pas établir une nouvelle présence dans une pièce vide et fermée tant qu’une porte surveillée ne s’est pas ouverte. Une porte observée ouverte autorise les vraies détections. Après fermeture de la dernière porte surveillée, la stabilisation habituelle (`close_delay`) est suivie du **Délai de rattrapage après stabilisation** (`recovery_delay`), **120 secondes par défaut et configurable séparément pour chaque pièce**. L’échéance est fixée à la dernière fermeture plus ces deux durées ; ni les détections ni les confirmations interrompues ne la prolongent. Une nouvelle ouverture crée une nouvelle possibilité d’entrée.

Les trois délais ont des rôles distincts :

| Réglage | Rôle |
| --- | --- |
| Confirmation de présence (`on_delay`) | Exige une détection continue avant de confirmer la présence. Une interruption remet cette confirmation à zéro. |
| Stabilisation après fermeture (`close_delay`) | Empêche la mémorisation immédiatement après fermeture de la dernière porte. Elle n’exige pas du mouvement pendant toute la stabilisation. |
| Délai de rattrapage (`recovery_delay`) | Autorise les détections tardives et de nouvelles tentatives de confirmation après stabilisation. Un retour temporaire à « vide » ou une temporisation d’absence ne consomme pas le temps restant. |

Par exemple, avec 20 secondes de stabilisation et 120 secondes de rattrapage, une détection à la 60e seconde après fermeture permet de retenter une confirmation ratée sans rouvrir la porte. Une confirmation continue commencée avant l’échéance peut se terminer après celle-ci ; si la condition de déclenchement devient fausse ou indisponible, cette tentative est interrompue. Après l’échéance, aucune nouvelle tentative n’est acceptée avant une nouvelle ouverture. Adapte `on_delay` à la durée réelle du capteur : un capteur actif seulement 3 secondes ne peut pas satisfaire une confirmation continue de 10 secondes, quel que soit le délai de rattrapage.

Une présence mémorisée consomme l’autorisation d’entrée et reste active sans mouvement tant que toutes les portes restent fermées. L’expiration de la mémoire maximale facultative (`latch_max`) n’autorise pas à elle seule une nouvelle présence. Lorsque l’exigence d’ouverture est activée, l’anticipation à l’ouverture est plafonnée à l’échéance du rattrapage après fermeture de toutes les portes : elle ne peut pas démarrer une confirmation artificielle au-delà de la fermeture, de la stabilisation et du rattrapage.

Les conditions d’autorisation et de libération ainsi que les forçages manuels conservent leur priorité habituelle. Une condition d’autorisation bloquante, une condition de libération satisfaite ou un forçage manuel actif annule l’autorisation d’entrée temporaire. Un passage pendant un forçage ne crée pas d’autorisation réutilisable au retour automatique portes fermées. Une présence Bee réellement mémorisée avant le forçage peut toujours suivre les règles de maintien existantes ; la reprise automatique ne fabrique jamais de nouvelle autorisation d’entrée. Le rattrapage ne contourne pas ces priorités.

Un redémarrage ou une perte de continuité des portes invalide l’autorisation d’entrée et l’échéance de rattrapage. Si les portes sont ensuite connues fermées, le mouvement seul ne peut pas établir la présence : une nouvelle ouverture est nécessaire. Une porte observée ouverte au démarrage autorise les vraies détections, mais n’invente pas d’événement d’ouverture pour l’anticipation. Renommer une pièce conserve une échéance de rattrapage en cours compatible. Le détail de la décision indique si la pièce attend une ouverture ou peut encore rattraper une présence, avec l’échéance des nouvelles tentatives de confirmation.

Le vent peut encore être accepté pendant le rattrapage qui suit une véritable ouverture. Adapte le délai à chaque pièce et surveille tous les accès à la zone.

## Faits et priorités

| Fait | Signification |
| --- | --- |
| `occupied` | Conclusion actuelle de l’autorité de présence choisie, avec l’exception Invités. |
| `present_count` | Nombre connu de résidents configurés présents. |
| `sleeping_count` / `awake_count` | Nombres connus parmi les résidents présents. |
| `counts_known` | Présences et sommeils confirmés, sans invités déclarés. |
| `guests` | Exception explicite Invités. |
| `any_sleeping` / `all_sleeping` | Sommeil des résidents présents ; les invités empêchent la conclusion « tous dorment ». |

Le mode et la présence affichés peuvent temporairement conserver leur dernière valeur lorsque des sources manquent. Les règles dépendantes reçoivent toutefois des faits indéterminés. Une pièce dont le résultat est conservé mais dégradé est également indéterminée pour les autres pièces.

Pour le salon, une libération peut combiner `counts_known = true`, `awake_count = 1` et « bureau occupé ». Les invités ou des nombres incertains suspendent cette exclusion. Une autorisation distincte peut exiger une maison occupée et au moins un résident éveillé. Si elle utilise les modes de maison, ne fais pas aussi dépendre ces mêmes modes du salon.

## Persistance et limites

Les confirmations et les forçages temporisés utilisent des échéances UTC absolues. Au redémarrage, les confirmations compatibles avec les sources actuelles reprennent ; aucun événement manqué n’est inventé. Les durées continues et l’hystérésis numérique recommencent leur évaluation. Bee abandonne l’ancienne mémoire lorsque la continuité des portes n’est plus vérifiable. Si l’exigence d’ouverture est désactivée, dès que les portes surveillées sont connues fermées, la stabilisation normale s’applique, suivie du délai d’absence configuré. Si la condition de déclenchement est fausse, la zone est considérée vide ; elle ne reste plus bloquée en attente de reconfirmation. Une détection confirmée ultérieure peut créer une nouvelle mémoire, sans ouverture de porte. Si l’exigence d’ouverture est activée, une pièce fermée attend en revanche une nouvelle ouverture avant d’accepter une nouvelle présence, selon les règles ci-dessus.

Un détecteur ou une porte réellement indisponible suit toujours la dégradation bornée lorsque les autres sources ne permettent pas de conclure. Une fois les sources rétablies, l’absence de confirmation conduit de nouveau à considérer la zone vide. Les anciens indicateurs de reconfirmation enregistrés par la version 0.1.0 sont ignorés, y compris pour une zone déjà indéterminée ; aucun changement de configuration ni remise à zéro manuelle n’est nécessaire. Les forçages temporaires gardent leur priorité habituelle puis rendent la main à ces règles.

Il s’agit de règles déterministes, sans probabilité ni identification des personnes. Les espaces ouverts, animaux, passages non surveillés et occupants multiples peuvent invalider une hypothèse de pièce fermée. Choisis le profil selon ce que tes capteurs peuvent réellement établir.
