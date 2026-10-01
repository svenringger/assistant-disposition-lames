---
schema_version: base.resource.v1
id: repartition-decoupe-lames
type: competence
title: Répartition et découpe des lames
description: "Vocabulaire, principes de répartition des lames sur un mur, sens des réglages de l'outil de calcul et valeurs de départ, avec ce qu'il faut demander pour un calcul fiable."
scope: team
status: active
sensitivity: internal
name: repartition-decoupe-lames
user-invocable: false
allowed-tools: Read
---

# Répartition et découpe des lames

Repères pour répartir des lames de largeurs et de longueurs différentes sur un mur, et pour régler l'outil de calcul. Les valeurs ci-dessous sont des **valeurs de départ ajustables**, pas des règles: elles changent avec le produit, le goût et le monteur. L'outil applique les réglages; toi tu expliques leur sens.

## Vocabulaire simple

| Mot | Sens |
|-----|------|
| Rang | Une bande de lames posées bout à bout, sur toute la longueur du mur, d'une seule largeur |
| Largeur utile | Largeur visible d'une lame une fois posée (sans la languette ni le recouvrement) |
| Joint de bout | Endroit où deux lames se touchent dans le sens de la longueur |
| Décalage | Distance entre les joints de bout de deux rangs voisins |
| Chute | Morceau restant après une coupe |
| Refente | Coupe d'une lame dans sa largeur, pour le dernier rang ou un raccord |
| Raccord | Pièce coupée autour d'une ouverture (fenêtre, porte) |
| Trou | Petit passage dans une pièce (prise, sortie de câble), sans interrompre le rang |
| Lot | Plusieurs murs calculés ensemble avec les mêmes lames |

## Ce que tu dois avoir avant de calculer

À demander une question à la fois, et à noter `[A COMPLETER]` si absent:
- **Le mur**: largeur et hauteur **mesurées**, pas lues sur un plan. Mesure la hauteur à plusieurs endroits si le plafond ou le sol peuvent varier.
- **Les obstacles**: chaque fenêtre, porte, niche ou trou, avec position depuis l'angle en bas à gauche (mesure du bas et du côté gauche), largeur et hauteur.
- **Les lames**: largeur utile, longueur, épaisseur, et pour chaque type la quantité en stock ou, à défaut, le catalogue du fournisseur (prix, lames par paquet).
- **Les contraintes de bord**: plinthe, moulure, corniche, angle rentrant ou sortant, réserve à laisser en haut ou en bas.
- **La refente**: le monteur peut-il recouper des lames en largeur? Certaines lames se refendent mal (rainure, languette, finition de chant).

## Principes de répartition

- **Le sens fixe la structure.** En sens horizontal, les rangs s'empilent sur la hauteur et les lames courent sur la largeur du mur. En sens vertical, l'inverse. Le nombre de rangs et la longueur des pièces en découlent.
- **Les joints de bout sont le vrai sujet.** Moins il y en a, plus le mur est calme. Ils doivent être décalés entre rangs voisins pour que le mur ne montre pas de ligne verticale ou diagonale involontaire.
- **Le dernier rang décide de la finition.** Un dernier rang très étroit se voit et se pose mal. L'outil rééquilibre alors avec le rang du début quand le reste passe sous la largeur minimale.
- **Les ouvertures imposent leurs coupes.** Autour d'une fenêtre, on préfère aligner un joint de rang sur le bord de l'ouverture plutôt que de terminer sur une pièce minuscule.
- **Les chutes se réutilisent.** Une chute assez longue alimente un rang suivant, même sur un autre mur du lot. C'est ce qui réduit la commande.
- **Deux modes de calcul.** *Stock*: les quantités sont limitées, l'outil signale ce qui manque. *Achat*: pas de limite, l'outil ajoute une marge de commande et arrondit aux paquets.

## Réglages de l'outil et valeurs de départ

| Réglage | Valeur de départ | Ce que ça change |
|---------|------------------|------------------|
| Sens | automatique | L'outil compare horizontal et vertical, ou on le fixe |
| Arrangement | automatique | Une seule largeur, un rythme répété de largeurs (ex. 90 / 90 / 140), une progression ou un tirage aléatoire reproductible |
| Décalage minimal des joints | 300 mm | Plus grand = mur plus régulier, mais plus de chutes ou de coupes |
| Longueur minimale d'une pièce | 400 mm | En dessous, la pièce est jugée trop courte à poser ou à garder |
| Largeur minimale du dernier rang | 30 mm | En dessous, le début et la fin sont rééquilibrés |
| Jeu entre lames | 0 mm | À régler si la notice du fabricant demande un jeu de dilatation ou un joint creux |
| Marge de bord | 0 mm | Réserve non couverte sur le pourtour (plinthe, moulure) |
| Marge de commande | 10 % | Ajoutée à l'achat pour les casses, défauts et recoupes |
| Taille maximale d'un trou | 250 mm | Au-delà, l'outil traite le passage comme une ouverture |
| Ordre des murs | automatique | L'outil teste l'ordre de pose qui gaspille le moins |

Ces valeurs sont des points de départ courants, pas des exigences. Demande à l'utilisateur s'il a une préférence, sinon garde les valeurs de départ et dis-le. Si une notice fabricant impose autre chose (jeu, décalage), elle **prime**.

## Lire un résultat sans le réciter

Ce qui compte pour l'utilisateur, dans cet ordre:
1. **Ça manque de lames ou pas** (mode stock) ou **combien acheter** (mode achat).
2. **La chute**: sous 8 % c'est très économe, 8 à 15 % c'est courant, au-delà cherche pourquoi (largeurs qui s'accordent mal avec la hauteur, longueur de lame mal choisie).
3. **Le nombre de joints de bout** et **de coupes**: du travail en plus pour le monteur.
4. **Les avertissements**: décalage relâché, contrainte relâchée, rang refendu, pièce en chute. À expliquer un par un.

Ces repères sur la chute sont indicatifs. Ne les présente pas comme une norme.

## Quand la solution est mauvaise

Cherche la cause avant de changer les lames: souvent un changement de sens, une largeur différente pour le dernier rang, ou une longueur de lame qui tombe mieux sur la dimension du mur suffit. Propose ces pistes à l'utilisateur, chiffres de l'outil à l'appui.

## Ce que tu ne fais jamais

- Calculer à la main une quantité, une chute ou une longueur de coupe
- Cacher un avertissement de l'outil
- Considérer une valeur de départ comme une règle de l'art
