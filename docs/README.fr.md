# Hapo — Home Assistant Presence Orchestrator

La présence des pièces, le sommeil des résidents et les modes de maison dans une seule intégration locale.

[English](../README.md) · [Règles et profils](rules.fr.md) · [Migration](migration.fr.md)

Hapo fait partie de Haxo et reprend les principes de [Halo](https://github.com/Gnol86/Halo) : une installation unique, un panneau intégré, une configuration visuelle et des entités Home Assistant réutilisables. Il fonctionne sans Halo ni Havo et continue ses calculs lorsque le panneau est fermé.

> Première version. Les tests automatiques et une instance Home Assistant isolée couvrent les scénarios documentés. Le placement et la qualité des capteurs déterminent la fiabilité des déductions. Hapo ne reconnaît ni ne compte les personnes à partir des mouvements.

## Les six profils

| Profil | Usage |
| --- | --- |
| Présence directe | Suivre un radar, un capteur de siège ou de lit qui maintient la présence. |
| Mouvement temporisé | Déclencher sur mouvement, puis attendre une période sans activité. |
| Déclenchement et maintien séparés | Un PIR déclenche ; le radar ou une porte peuvent uniquement prolonger la présence. |
| Bee in the Box | Mémoriser une présence derrière des portes surveillées, même sans mouvement. |
| Combinaison logique | Combiner ET, OU, NON, états, attributs, valeurs numériques et horaires. |
| Présence contextuelle | Déclencher localement, puis maintenir ou terminer selon les résidents et les autres pièces. |

Hapo propose des profils en fonction des pièces Home Assistant, des appareils et des classes de capteurs. **Tu choisis explicitement la suggestion à appliquer.** Une porte partagée peut être utilisée dans plusieurs pièces.

## Installation

Home Assistant **2026.10.0 minimum**. L’anglais est la langue de référence ; le français, y compris ses variantes régionales, est entièrement pris en charge. Les noms personnalisés restent inchangés.

1. Dans HACS, ouvre **Dépôts personnalisés**, ajoute `https://github.com/Gnol86/Hapo` et choisis **Intégration**.
2. Télécharge Hapo et redémarre Home Assistant.
3. Ouvre **Paramètres → Appareils et services → Ajouter une intégration → Hapo**.
4. Ouvre **Hapo** dans la barre latérale. Une seule installation gère toute la maison.

Un dépôt personnalisé HACS ne signifie pas une inscription au catalogue HACS par défaut. Pour une installation manuelle, copie `custom_components/hapo` dans la configuration Home Assistant, redémarre puis ajoute l’intégration. Le panneau compilé est inclus.

## Configuration

- **Résidents :** choisis les entités de localisation existantes, les états signifiant « à la maison » et le délai de confirmation. Les autres localisations connues, y compris les zones nommées, signifient une absence. Ajoute éventuellement une condition de sommeil automatique.
- **Pièces :** choisis une pièce, un profil, les sources et les délais. Les portes, le contexte et les commandes manuelles se trouvent dans les réglages avancés.
- **Maison :** choisis l’autorité de présence — résidents, condition externe ou pièces sélectionnées — puis organise les règles des modes.
- **Enregistre le brouillon.** Les mises à jour en direct et les changements d’onglet le conservent. Une modification depuis un autre navigateur bloque une sauvegarde concurrente ; exporte le brouillon avant de l’abandonner pour conserver tes changements.

Les quatre modes initiaux ont des clés stables : `away` (Vide), `sleeping` (Dort), `quiet` (Calme) et `active` (Vie). Tu peux renommer leurs libellés, réordonner leurs règles et créer d’autres modes. La première règle vraie gagne. Une règle prioritaire indéterminée bloque une conclusion potentiellement incorrecte issue d’une règle suivante.

Avec les résidents comme autorité, une pièce occupée ne contredit pas un départ confirmé. L’exception **Invités** est explicite et rend le nombre total de personnes incertain. Les compteurs portent uniquement sur les résidents suivis ; Hapo n’additionne jamais les pièces pour compter des personnes.

Le sommeil manuel reste prioritaire jusqu’à sa libération ou un départ confirmé. Un tracker indisponible ne l’efface pas. Un mode de maison forcé change le mode affiché, pas les faits de présence.

## Entités et commandes

Les appareils Maison, Pièces et Résidents regroupent les capteurs et commandes dans **Paramètres → Appareils et services → Hapo**. Chaque pièce fournit un capteur binaire d’occupation. La maison expose sa présence, son mode, les comptes connus et les invités. Chaque résident expose sa présence et son sommeil.

Les identifiants stables des pièces et résidents sont visibles sous **Détails** dans le panneau. Ils restent inchangés lors d’un renommage.

| Action | Valeurs | Paramètres complémentaires |
| --- | --- | --- |
| `hapo.room_override` | `occupied`, `clear`, `auto` | `target_id` ; `duration` facultative en secondes |
| `hapo.home_override` | Clé d’un mode, ou `auto` | `duration` facultative en secondes |
| `hapo.sleep` | `sleeping`, `awake`, `auto`, `toggle` | `target_id` du résident |
| `hapo.guests` | `true`, `false` | — |

Une durée nulle maintient le forçage jusqu’à la reprise automatique. Les sélecteurs natifs offrent ces commandes sans durée ; les boutons de reprise les libèrent. Un départ confirmé libère aussi le sommeil manuel.

```yaml
action: hapo.room_override
data:
  target_id: office
  value: occupied
  duration: 1800
```

Cet exemple force une pièce présente pendant 30 minutes. Dans les automatisations, compare la clé du capteur de mode, pas son libellé traduit. Les attributs `mode_name` et `modes` exposent les noms personnalisés. Pour déclencher un appareil au départ, exige un mode précédent connu : une récupération `unknown → away` ne doit pas être prise pour un nouveau départ.

## Fiabilité et confidentialité

Un capteur manquant, `unknown`, `unavailable` ou une valeur numérique invalide ne devient pas absent. Les conditions ont trois résultats : vrai, faux ou indéterminé. Lorsque les sources restantes ne permettent plus de conclure, Hapo conserve le dernier résultat avec `degraded: true` pendant un délai configurable, initialement cinq minutes, puis publie `unknown`.

Les résultats, forçages et échéances de confirmation sont persistés localement. Au redémarrage, Hapo attend que Home Assistant soit démarré : une source toujours compatible reprend son échéance, une source modifiée l’annule. Les conditions exigeant une durée continue recommencent leur confirmation. Une mémoire Bee doit être reconfirmée après un redémarrage ou une perte de continuité des portes.

Les dépendances circulaires sont refusées avant enregistrement. Le moteur utilise les événements et les échéances utiles. L’activité native indique Hapo, l’entité concernée et le motif du changement. Les diagnostics téléchargeables depuis l’intégration sont expurgés des noms, identifiants d’entités, localisations et valeurs brutes. **Un export de configuration contient tes noms et identifiants.**

Les administrateurs configurent l’intégration. Les commandes respectent les droits de contrôle des entités Home Assistant. Le panneau suit le thème et s’adapte aux petits écrans.

## Développement

Les commandes de développement et de validation figurent dans le [README anglais](../README.md#development). La CI contrôle Python, le panneau, la reproductibilité du bundle et Hassfest. La publication vérifie aussi HACS et la cohérence des versions.

Licence MIT ; Lit est fourni sous licence BSD-3-Clause.
