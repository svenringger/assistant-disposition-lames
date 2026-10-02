---
schema_version: base.resource.v1
id: proposer-la-disposition
type: process
title: Proposer et comparer les dispositions de lames
description: "Comparer deux ou trois dispositions réellement différentes (sens, arrangement des largeurs) pour un mur ou un lot, avec chiffres, regard esthétique et conseils de pose, produire la page graphique dynamique et faire figer la variante retenue."
scope: team
status: active
sensitivity: internal
use_when: Quand l'utilisateur veut savoir comment disposer ses lames sur un ou plusieurs murs, choisir horizontal ou vertical, mélanger plusieurs largeurs, minimiser les chutes, voir le rendu graphique de la disposition ou comparer des variantes.
routing:
  examples:
    - Horizontal ou vertical pour mes lames sur ce mur
    - Comment répartir mes lames de largeurs différentes sur le mur
    - Optimise l'utilisation de mes lames pour deux murs
    - Montre-moi la disposition des lames avec les dimensions
    - Compare plusieurs arrangements de lames et argumente
    - Combien de lames me faut-il pour ce mur
  avoid_when:
    - Les cotes ne sont pas encore relevées, il faut d'abord ouvrir le projet.
    - Préparer seulement la commande ou le brief pour le monteur d'un choix déjà figé.
    - Choix de finition ou d'essence sans question de calepinage.
requires:
  - ref: repartition-decoupe-lames
    access: read
    purpose: expliquer les réglages et lire les résultats sans réciter
  - ref: esthetique-lames
    access: read
    purpose: argumenter l'effet visuel de chaque variante
  - ref: pose-technique-lames
    access: read
    purpose: donner les conseils de pose propres au mur
  - ref: finitions-essences-bois
    access: read
    purpose: relier la disposition à l'essence et à la finition
  - ref: lames-marqueurs
    access: read
    purpose: marquer les décisions et les points à valider
  - ref: lames-journal
    access: read
    purpose: écrire l'entrée de journal finale
  - ref: calepinage-lames
    access: execute
    purpose: calculer, comparer les variantes et produire la page graphique
may_use:
  - donnees/memoire.md
  - donnees/murs/
  - donnees/lots/
  - templates/proposition-disposition_v1.md
name: proposer-la-disposition
keywords: [disposition, calepinage, horizontal, vertical, largeurs, chutes, variantes, rendu, page, lot]
argument-hint: "[projet de mur ou de lot]"
user-invocable: true
allowed-tools: Read Write Edit Glob Grep Bash
---

# Proposer et comparer les dispositions de lames

Partir d'un projet déjà saisi, calculer avec l'outil, présenter deux ou trois dispositions vraiment différentes, argumenter, montrer le rendu graphique, puis faire figer le choix. Une seule question à la fois.

## Inputs

Demande à l'utilisateur, s'il n'est pas évident:
- **Le projet**: quel mur ou quel lot

Avant de commencer:
- Lis la fiche et `entree.json` du projet
- Lis `memoire.md` (goûts, exclusions) pour orienter les variantes
- Si des `[A COMPLETER]` bloquent le calcul (cote, longueur de lame), reviens au process `ouvrir-un-projet-mur`
- Lis les entrées récentes du journal liées à ce projet

## Étapes

### 1. Confirmer le point de départ

Résume en trois lignes: le mur (ou les murs), les lames disponibles, le mode (stock ou achat), les réglages qui comptent (décalage des joints, marge de commande). Signale si tu gardes les valeurs de départ.

> «Je pars de [résumé]. Je garde les réglages habituels sauf si tu as une préférence. Ça te va?»

← Reformulation

### 2. Calculer et choisir les variantes

Lance l'outil de calcul avec la commande `variantes` sur `entree.json` (jusqu'à 6). Lis le résultat pour toi, ne le montre pas.

Retiens **2 ou 3 variantes réellement différentes** (sens ou arrangement, pas deux tirages presque identiques). Écarte celles dont l'outil signale un manque de lames en mode stock, sauf si aucune ne convient: dis-le alors. Utilise la mémoire pour ne proposer aucun sens ou arrangement exclu.

### 3. Argumenter chaque variante

Pour chacune, en 3 ou 4 phrases (compétence `esthetique-lames`):
1. L'effet dans la pièce
2. Les chiffres: lames à prévoir, chute, joints de bout, coupes
3. Un compromis ou un risque honnête, avec les avertissements de l'outil expliqués simplement
4. Un conseil de pose propre à ce mur (`pose-technique-lames`), y compris la compatibilité avec une isolation phonique si le mur en a une

Si un bord est un joint ou un coin, dis la cote du support et la longueur à couvrir. Au coin à 90°, dis quelle face va au fond et quelle face est plus courte, et que ce sens est celui qui ouvre le moins de lames. Au coin à 270°, donne la pointe longue et la pointe courte. Une suite de faces se présente face par face.

Ajoute un petit tableau de comparaison, puis **ta recommandation** et pourquoi. Nomme aussi ce que tu déconseilles.

> «Voici mes [2 ou 3] variantes. Je recommanderais [A] parce que [raison]. Laquelle te parle le plus?»

← Reformulation

Pour un lot, indique aussi l'ordre de pose des murs que l'outil recommande, et ce qui se passe si on l'ignore.

### 4. Montrer le rendu

**⚠ Point de décision, avant écriture:**
> «Je propose de produire la page graphique de la variante [X], avec les dimensions de chaque lame et des paramètres que tu peux modifier. Je l'enregistre dans le dossier du projet. Confirmes-tu?»

← Point de décision

Après confirmation, génère la page avec la commande `page`, **sans** `--variante`, dans le dossier du projet: `disposition.html`. La page embarque les réglages déjà écrits dans le fichier. `--variante N` les remplacerait par le Nième essai automatique, classé par économie, qui n'est pas forcément la disposition choisie.

En l'expliquant, dis que la carte encadrée au chargement est la disposition retenue. Les autres cartes sont d'autres essais: elles peuvent utiliser d'autres lames. On peut y changer largeurs, longueurs, ouvertures et réglages. Si la personne décrit un dessin qui ne correspond pas à la disposition retenue, c'est un essai affiché, pas une erreur de calcul.

Si la personne modifie des paramètres dans la page, demande-lui de te les redonner ou d'exporter le fichier de paramètres, puis relance le calcul. Ne suppose rien.

### 5. Figer la disposition

Quand la personne a choisi:

**⚠ Point de décision, avant écriture:**
> «Je propose de figer la variante [X]: [sens et arrangement], [n] lames, [chute] %, avec ces réglages [liste courte]. J'écris la proposition dans le dossier du projet et je mets à jour les paramètres de calcul. Confirmes-tu?»

← Point de décision

Après confirmation:
- Écris `proposition.md` avec `templates/proposition-disposition_v1.md`
- Mets à jour `entree.json` avec les options de la variante retenue, pour que la liste et le descriptif reprennent le même calcul
- Régénère la page depuis le fichier mis à jour, sans `--variante`
- Consigne `[DECISION: variante X | raison]` et note les `[A VALIDER]` restants

Propose à la personne de noter dans la mémoire ce qu'elle a appris de son goût (par exemple un sens préféré, une largeur qu'elle n'aime pas). N'écris dans `memoire.md` qu'après sa confirmation.

### 6. Récapitulatif

> «Disposition figée pour [projet]: [variante]. Le rendu est prêt à ouvrir.
> Prochaine étape: préparer la liste des lames et le descriptif pour le monteur. On y va?»

### 7. Journal

Écris une entrée dans `journal/` selon la compétence `lames-journal`.

## Preuve d'achèvement

Le process est terminé quand:
- L'outil a calculé les variantes et 2 ou 3 ont été argumentées avec chiffres
- Une page graphique a été produite
- La variante retenue est enregistrée avec `[DECISION]`, ou la personne a demandé de la garder ouverte
- Le journal est écrit

## Ce que tu ne fais jamais dans ce process

- Donner une quantité, une chute ou une longueur de coupe qui ne vient pas de l'outil
- Montrer du code, du JSON ou une commande à la personne
- Cacher un avertissement de l'outil
- Recommander sans dire ce que la variante coûte en chute, en joints ou en coupes
- Figer une variante sans confirmation explicite
- Présenter le dessin comme une photo du rendu final
- Passer `--variante` pour produire ou régénérer la page d'une disposition déjà écrite dans le fichier
- Présenter la première carte comparée comme la disposition retenue
- Recouper en largeur une lame qui n'est pas la dernière du mur : elle perdrait sa languette
