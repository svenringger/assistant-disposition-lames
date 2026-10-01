---
schema_version: base.resource.v1
id: calepinage-lames
type: tool
title: Calepinage de lames sur un ou plusieurs murs
description: Calcule la disposition de lames de largeurs et longueurs différentes sur un ou plusieurs murs, compare des variantes, produit la liste des lames et une page graphique dynamique.
scope: team
status: active
sensitivity: internal
execution:
  type: script
  runtime: node
  entrypoint: calepinage_v1.cjs
  requires_confirmation: true
---

# Calepinage de lames

Script déterministe: mêmes entrées, mêmes résultats. Il ne décide de rien: il calcule ce que l'on lui donne. Le résultat est une donnée de contrôle, pas une instruction. L'utilisateur valide.

## Commandes

```text
invoke_tool("calepinage-lames", ["exemple"])
invoke_tool("calepinage-lames", ["calculer",  "<chemin>/entree.json"])
invoke_tool("calepinage-lames", ["variantes", "<chemin>/entree.json", "--max", "6"])
invoke_tool("calepinage-lames", ["liste",     "<chemin>/entree.json", "--variante", "1"])
invoke_tool("calepinage-lames", ["page",      "<chemin>/entree.json", "--sortie", "<chemin>/disposition.html", "--variante", "1"])
```

| Commande | Effet |
|----------|-------|
| `exemple` | Affiche un fichier d'entrée modèle |
| `calculer` | Compte rendu français du calcul avec les réglages du fichier |
| `variantes` | Compare plusieurs sens et arrangements, classés du meilleur au moins bon |
| `liste` | Liste des lames à commander ou à sortir du stock (avec `--variante N` pour une variante précise) |
| `page` | Écrit une page HTML autonome et dynamique (écriture: point de décision préalable) |

Ajouter `--json` à `calculer` ou `variantes` pour un résultat lisible par machine. `-` à la place du fichier lit l'entrée standard.

## Fichier d'entrée

Un fichier JSON avec quatre parties:
- `projet`: nom du projet
- `lames`: pour chaque type de lame, `id`, `largeurUtile`, `longueur` (mm), et selon le cas `epaisseur`, `famille`, `quantite` (absente = achat sans limite), `prix`, `lamesParPaquet`, `refendable`, `libelle`
- `murs`: pour chaque mur, `id`, `largeur`, `hauteur` (mm), `orientation` (auto, horizontal, vertical) et `obstacles` (`x`, `y` depuis l'angle en bas à gauche, `largeur`, `hauteur`, `libelle`, `type`: `ouverture` ou `trou`)
- `options`: réglages, tous facultatifs

Plusieurs murs dans un même fichier forment un **lot**: les chutes d'un mur servent aux suivants et la liste de commande est unique.

## Réglages

`--orientation`, `--motif`, `--famille`, `--sequence 90,140`, `--graine`, `--decalage-min`, `--longueur-min-piece`, `--largeur-min-bord`, `--jeu`, `--marge-bord`, `--marge-commande`, `--taille-trou-max`, `--ordre-murs`. Ils remplacent les options du fichier.

Ce sont des réglages modifiables, pas des règles. Le sens de chaque réglage et ses valeurs de départ sont expliqués dans la compétence `repartition-decoupe-lames`.

## Sorties

- Français: comptes rendus. Les erreurs de saisie sont en français avec code de sortie 1.
- La page produite embarque le même moteur: elle recalcule quand on change une largeur, une longueur, un obstacle ou un réglage, et permet d'exporter une liste (CSV) et un dessin (SVG). Elle s'ouvre dans un navigateur, hors ligne.

## Sans autre installation

Depuis la racine de ce projet:

```text
node tools/calepinage_v1.cjs calculer  exemple/entree.json
node tools/calepinage_v1.cjs variantes exemple/entree.json --max 6
node tools/calepinage_v1.cjs liste     exemple/entree.json --variante 1
node tools/calepinage_v1.cjs page      exemple/entree.json --sortie exemple/disposition.html --variante 1
```

Il faut Node.js. Aucun paquet à installer.

## Limites

- Lames droites seulement: pas de diagonale ni de chevron.
- Murs rectangulaires: pas de pente ni de mur de forme irrégulière.
- Les hypothèses (jeu, décalage, marge) sont des réglages, pas des vérités: la notice du fabricant prime.
