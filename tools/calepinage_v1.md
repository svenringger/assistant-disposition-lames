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
invoke_tool("calepinage-lames", ["liste",     "<chemin>/entree.json"])
invoke_tool("calepinage-lames", ["page",      "<chemin>/entree.json", "--sortie", "<chemin>/disposition.html"])
```

| Commande | Effet |
|----------|-------|
| `exemple` | Affiche un fichier d'entrée modèle |
| `calculer` | Compte rendu français du calcul avec les réglages du fichier |
| `variantes` | Compare plusieurs sens et arrangements, classés du meilleur au moins bon |
| `liste` | Liste des lames à commander ou à sortir du stock, selon les réglages du fichier |
| `page` | Écrit une page HTML autonome et dynamique (écriture: point de décision préalable). Elle s'ouvre sur les réglages du fichier: c'est la disposition retenue. Les autres cartes sont des essais |

`--variante N` est facultatif, pour `liste`, `calculer` et `page`. Il **remplace** les réglages du fichier par le Nième essai automatique, classé par économie. Ce n'est pas la disposition déjà écrite dans le fichier. Pour publier ou relire une disposition figée, ne pas passer `--variante`.

`options.prioriteCoupe` vaut `chute` par défaut : le calcul évite d'ouvrir une lame longue quand le bout restant est inutilisable. `longueur` pose la lame la plus longue qui couvre le rang, même si un petit bout se perd. Ne change le défaut que si l'utilisateur l'a choisi.

Ajouter `--json` à `calculer` ou `variantes` pour un résultat lisible par machine. `-` à la place du fichier lit l'entrée standard.

## Fichier d'entrée

Un fichier JSON avec quatre parties:
- `projet`: nom du projet
- `lames`: pour chaque type de lame, `id`, `largeurUtile`, `longueur` (mm), et selon le cas `epaisseur`, `famille`, `quantite` (absente = achat sans limite), `prix`, `lamesParPaquet`, `refendable`, `libelle`
- `murs`: pour chaque face, `id`, `largeur` et `hauteur` du **support** (mm), `orientation` (auto, horizontal, vertical), `epaisseurSupport` (liteau ou lambourde, 0 si la lame est sur le mur), `bords` et `obstacles`
- `bords`: `gauche`, `droite`, `bas`, `haut`. Chacun est `ras` (coupe droite), `joint` (largeur en mm, coupe droite, le vide reste vide) ou `angle`. Un coin à 90° (`sens` rentrant, `coupe` `auto`) est une coupe droite: le calcul choisit la face qui va au fond, l'autre est plus courte de l'épaisseur de la lame plus celle du lambourdage. `passe` ou `arrete` impose ce choix. Un coin à 270° (`sens` sortant, `coupe` 45) coupe les deux faces en onglet. Nomme `voisin` pour relier les deux faces. Sans bords, ou si les quatre sont à ras, la marge de bord s'applique
- `obstacles`: `x`, `y` depuis l'angle en bas à gauche du support, `largeur`, `hauteur`, `libelle`, `type`: `ouverture` ou `trou`

Une crédence ou un retour est plusieurs faces dans le même lot, dans l'ordre, avec l'angle noté sur le bord qui les relie. Ce n'est pas un seul rectangle.
- `options`: réglages, tous facultatifs

Plusieurs murs dans un même fichier forment un **lot**: les chutes d'un mur servent aux suivants et la liste de commande est unique.

## Réglages

`--orientation`, `--motif`, `--famille`, `--sequence 90,140`, `--graine`, `--decalage-min`, `--longueur-min-piece`, `--largeur-min-bord`, `--jeu`, `--marge-bord`, `--marge-commande`, `--taille-trou-max`, `--ordre-murs`, `--sans-languette true|false`. Ils remplacent les options du fichier.

`sansLanguette` est faux par défaut. On ne l'active que pour une plaque que la notice autorise à recouper dans les deux sens. L'outil peut alors recouper une chute plus haute que le rang. Une lame à languette garde le défaut : une chute reste à la hauteur de son rang.

Ce sont des réglages modifiables, pas des règles. Le sens de chaque réglage et ses valeurs de départ sont expliqués dans la compétence `repartition-decoupe-lames`.

## Sorties

- Français: comptes rendus. Les erreurs de saisie sont en français avec code de sortie 1.
- La page produite embarque le même moteur: elle recalcule quand on change une largeur, une longueur, un obstacle ou un réglage, et permet d'exporter une liste (CSV) et un dessin (SVG). Elle s'ouvre dans un navigateur, hors ligne.

## Limites

- Lames droites: pas de chevron ni de pose en diagonale. Le coin à 90° est une coupe droite. Le coin à 270° est une coupe à 45°. Un biseau sur la longueur d'un rang est signalé, il n'est pas dessiné.
- Chaque face est un rectangle: pas de pente ni de mur de forme irrégulière. Une suite de faces se saisit face par face.
- Les hypothèses (jeu, décalage, marge) sont des réglages, pas des vérités: la notice du fabricant prime.
