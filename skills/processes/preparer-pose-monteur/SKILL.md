---
schema_version: base.resource.v1
id: preparer-pose-monteur
type: process
title: Préparer la liste des lames et la pose
description: "À partir d'une disposition figée, produire la liste consolidée des lames à acheter ou à sortir du stock (un ou plusieurs murs) et le descriptif pour le monteur, avec conseils de pose, finitions et points de vigilance."
scope: team
status: active
sensitivity: internal
use_when: Quand l'utilisateur veut la liste des lames à acheter ou à prélever après avoir choisi une disposition, le récapitulatif des lames d'un lot de murs, le descriptif ou le brief pour le monteur, ou les conseils de pose et de finition.
routing:
  examples:
    - Prépare la liste des lames à acheter
    - Fais-moi le descriptif pour le monteur
    - Récapitule toutes les lames du lot avec la marge
    - Donne-moi les conseils de pose de ce mur
    - Quelles lames prendre en stock et lesquelles acheter
    - Prépare le brief de pose
  avoid_when:
    - Le sens ou l'arrangement n'est pas encore choisi.
    - Isolation phonique ou plans de rénovation.
    - Comparer des variantes ou tester un autre sens.
requires:
  - ref: pose-technique-lames
    access: read
    purpose: rédiger les consignes de fixation, de jeux, de départ et d'ouvertures
  - ref: finitions-essences-bois
    access: read
    purpose: rédiger les consignes de finition et de protection des coupes
  - ref: esthetique-lames
    access: read
    purpose: dernier regard sur les alignements et l'effet d'ensemble
  - ref: repartition-decoupe-lames
    access: read
    purpose: expliquer chutes, marges et pièces recoupées
  - ref: lames-marqueurs
    access: read
    purpose: marquer les décisions et les points à valider
  - ref: lames-journal
    access: read
    purpose: écrire l'entrée de journal finale
  - ref: calepinage-lames
    access: execute
    purpose: produire la liste des lames et le détail rang par rang
may_use:
  - donnees/memoire.md
  - donnees/murs/
  - donnees/lots/
  - templates/liste-lames_v1.md
  - templates/descriptif-monteur_v1.md
name: preparer-pose-monteur
keywords: [liste des lames, monteur, descriptif, pose, brief, finition, lot, chutes]
argument-hint: "[projet de mur ou de lot]"
user-invocable: true
allowed-tools: Read Write Edit Glob Grep Bash
---

# Préparer la liste des lames et la pose

Transformer une disposition figée en deux documents utilisables: la liste des lames (consolidée pour un lot) et le descriptif pour le monteur. Une seule question à la fois.

## Inputs

Demande à l'utilisateur, s'il n'est pas évident:
- **Le projet**: quel mur ou quel lot
- **Qui pose**: toi-même ou un monteur (adapte le ton du descriptif)

Avant de commencer:
- Lis `proposition.md`, la fiche et `entree.json` du projet. **Si aucune variante n'est figée** (pas de `[DECISION]` dans la proposition), propose de repasser par `proposer-la-disposition` et arrête-toi là
- Lis `donnees/memoire.md` (fournisseurs, mode de pose, stock restant)
- Si une isolation phonique est décrite dans des documents fournis, lis-les pour connaître l'épaisseur et la nature des couches
- Si `journal/` contient des entrées récentes liées, lis-les

## Étapes

### 1. Vérifier les prérequis

Contrôle en une liste courte: disposition figée, cotes confirmées, lames confirmées, support connu, produit nommé ou non. Pour chaque produit nommé (lames, fixations, huile), lis la fiche technique du fabricant; ce qui n'y figure pas s'étiquette «hors notice».

> «Avant de rédiger, il me manque encore [liste]. On complète ça d'abord?»

← Reformulation

### 2. Produire la liste des lames

Lance l'outil (commande `liste`) sur `entree.json`, avec la variante figée. Pour un lot, la liste est **consolidée**: un seul tableau de commande pour tous les murs, avec la répartition par mur.

Prépare, sans code ni JSON, pour l'utilisateur:
- Quantité nécessaire, marge de commande et quantité à commander par type de lame, avec les paquets
- Prix indicatif si les prix sont connus, sinon `[A COMPLETER: prix]`
- Ce que les chutes de ce projet permettent de garder pour la suite
- Ce qu'il faut vérifier avant de commander (même lot de fabrication, délai, disponibilité)

### 3. Rédiger le descriptif pour le monteur

Avec `templates/descriptif-monteur_v1.md` et le détail rang par rang de l'outil. Écris en mots simples, sans jargon inutile, chaque consigne vérifiable:
- Ce qu'on veut obtenir, sens, point de départ, arrangement des largeurs, dernier rang
- Support à contrôler, préparation, acclimatation, finition avant pose
- Fixation et jeux, **selon la notice**, avec la compatibilité phonique si elle s'applique (rien ne doit retraverser l'isolation)
- Ouvertures, raccords, prises et angles
- Coupes sur place et protection des chants
- Points de vigilance en `[ATTENTION]`

Fais un dernier regard esthétique (`esthetique-lames`): alignements sur les repères de la pièce, position des joints près des ouvertures.

### 4. Faire valider

Présente les deux documents en résumé, pas en bloc:

> «Voici l'essentiel: [3 à 5 lignes: quantités, points de pose clés, points d'attention]. Qu'est-ce qui te paraît juste, à corriger ou trop technique pour ton monteur?»

← Reformulation

### 5. Enregistrer

**⚠ Point de décision, avant écriture:**
> «Je propose d'enregistrer dans le dossier du projet [nom]:
> - la liste des lames à commander
> - le descriptif pour le monteur
> et de te proposer ensuite des mises à jour de ta mémoire (lames restantes, fournisseur). Confirmes-tu?»

← Point de décision

Après confirmation:
- Écris `liste-lames.md` et `descriptif-monteur.md` dans le dossier du projet
- Propose d'enregistrer aussi la page finale dans le même dossier (elle est déjà là si le process précédent est passé)
- Consigne `[DECISION: ...]` pour ce qui a été validé

### 6. Mémoire (après confirmation)

Propose, une chose à la fois, ce qui vaut d'être retenu: chutes réutilisables, fournisseur utilisé, qui a posé, préférence apprise. **N'écris dans `memoire.md` qu'après confirmation**, avec la date et le projet d'origine.

### 7. Journal

Écris une entrée dans `journal/` selon la compétence `lames-journal`.

## Preuve d'achèvement

Le process est terminé quand:
- La liste des lames et le descriptif existent dans le dossier du projet
- Chaque quantité de la liste vient de l'outil
- Les `[A COMPLETER]` restants sont listés à l'utilisateur
- La mémoire a été mise à jour uniquement avec ce que l'utilisateur a confirmé
- Le journal est écrit

## Ce que tu ne fais jamais dans ce process

- Préparer une commande sans disposition figée
- Inventer un prix, un délai, une fixation ou un jeu
- Recopier une consigne de fabricant sans la source
- Écrire un descriptif qui suppose une fixation traversant une isolation phonique
- Écrire dans `memoire.md` sans confirmation
