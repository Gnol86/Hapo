# Profils, sources et faits de maison

[English](rules.md)

Les six profils partagent une condition de déclenchement, des conditions facultatives d’autorisation et de libération, des délais de confirmation et les commandes manuelles. Les sources acceptent les états, les attributs simples et les valeurs numériques. ET, OU et NON conservent le résultat indéterminé lorsqu’il est nécessaire. Les seuils sont stricts (`>` / `<`). L’hystérésis élargit la plage active jusqu’au franchissement du seuil moins/plus la marge. Les attributs booléens utilisent `true` et `false`.

La durée continue d’une condition (`for`, en secondes) exige qu’elle reste vraie sans interruption. Une indisponibilité interrompt cette confirmation. Les horaires utilisent le fuseau Home Assistant et peuvent traverser minuit. Les références internes aux pièces, faits et modes permettent de détecter les cycles ; utilise ces références typées plutôt que les identifiants bruts des entités Hapo.

## Fonctionnement

- **Direct, mouvement et logique :** la condition de déclenchement est évaluée, puis les transitions sont confirmées selon les délais d’occupation et d’absence. Le profil direct suit une présence maintenue ; le mouvement suit une activité ; le profil logique permet une combinaison générale.
- **Déclenchement et maintien séparés :** seules les sources de déclenchement peuvent démarrer la présence. Les sources de maintien prolongent uniquement une présence déjà active. L’absence commence à être confirmée lorsque plus aucune de ces sources ne la soutient.
- **Contextuel :** une activité locale déclenche la présence. Elle est conservée jusqu’à une condition de libération vraie ou une autorisation fausse. Un contexte indéterminé dégrade le résultat. Une libération avec durée continue permet d’exprimer une règle d’inactivité explicite.
- **Bee in the Box :** chaque porte décrit ses états **ouverts**. L’ouverture de n’importe quelle porte libère la mémoire. La fermeture de toutes les portes lance une stabilisation ; une détection confirmée après cette stabilisation crée la mémoire. Une détection tardive peut aussi la créer. La présence reste mémorisée sans mouvement tant que les portes restent fermées. Une durée maximale facultative peut l’expirer. Porte ouverte, les sources et le délai d’absence spécifique s’appliquent.

Le principe Bee est également appelé [Wasp in a Box](https://github.com/dlashua/hass-wasp_sensor). Hapo implémente son propre moteur événementiel. Cette déduction suppose que tous les passages utiles sont surveillés ; elle ne compte pas les entrées et sorties.

L’anticipation à l’ouverture et le maintien tant qu’une porte reste ouverte sont deux options distinctes. L’anticipation exige une ouverture réellement observée ; une porte déjà ouverte au démarrage ne suffit pas. Elle dure le plus grand des délais normal et porte ouverte, avec un minimum d’une seconde, sauf si une vraie détection prend le relais. Cette dernière utilise ensuite son délai d’absence normal. L’anticipation n’est pas suivie d’une deuxième temporisation identique.

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

Les confirmations et les forçages temporisés utilisent des échéances UTC absolues. Au redémarrage, les confirmations compatibles avec les sources actuelles reprennent ; aucun événement manqué n’est inventé. Les durées continues et l’hystérésis numérique recommencent leur évaluation. La continuité des portes n’est pas supposée : une mémoire Bee conservée devient dégradée, puis indéterminée sans reconfirmation. Une nouvelle ouverture libère cette ancienne incertitude.

Il s’agit de règles déterministes, sans probabilité ni identification des personnes. Les espaces ouverts, animaux, passages non surveillés et occupants multiples peuvent invalider une hypothèse de pièce fermée. Choisis le profil selon ce que tes capteurs peuvent réellement établir.
