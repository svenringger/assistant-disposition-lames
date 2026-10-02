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
| Support | Le mur ou le meuble mesuré. Sa largeur et sa hauteur ne sont pas forcément la longueur à couvrir |
| Joint de bord | Vide laissé entre la lame et le bord du support, coupe droite |
| Angle | Rencontre avec une face voisine. Chaque bord se règle à part |
| Coin à 90° | Les lames s'aboutent droit. L'une va au fond du coin, l'autre s'appuie contre elle et perd l'épaisseur de la lame plus celle du lambourdage. Le calcul choisit celle qui va au fond pour ouvrir le moins de lames |
| Coin à 270° | Les deux faces sont coupées à 45°. On note la pointe longue et la pointe courte |
| Pointe longue | Côté le plus long d'une pièce à 45°. C'est la longueur à sortir du stock |
| Pointe courte | Côté le plus court de la même pièce. L'écart avec la pointe longue est l'épaisseur de la lame |

## Ce que tu dois avoir avant de calculer

À demander une question à la fois, et à noter `[A COMPLETER]` si absent:
- **Le support**: largeur et hauteur **mesurées**, pas lues sur un plan. Ce sont les cotes du mur ou du meuble, pas encore la longueur à couvrir. Mesure la hauteur à plusieurs endroits si le plafond ou le sol peuvent varier.
- **Chaque bord**, gauche, droite, bas et haut: à ras (coupe droite), un joint de tant de millimètres (le vide reste vide), ou un angle avec la face voisine.
- **Si c'est un coin à 90°**: le nom de la face voisine. Le calcul choisit qui va au fond. Ne demande un choix à la main que si la personne en a un. Pas de coupe à 45°.
- **Si c'est un coin à 270°**: les deux faces sont à 45°.
- **L'épaisseur**: celle de la lame, et celle d'un liteau ou d'une lambourde s'il y en a un. Zéro si la lame est fixée sur le mur.
- **Une suite de faces**: une crédence ou un retour est plusieurs murs du même lot, dans l'ordre, avec le type d'angle entre eux. On ne les traite pas comme un seul mur plan.
- **Les obstacles**: chaque fenêtre, porte, niche ou trou, avec position depuis l'angle en bas à gauche (mesure du bas et du côté gauche), largeur et hauteur.
- **Les lames**: largeur utile, longueur, épaisseur, et pour chaque type la quantité en stock ou, à défaut, le catalogue du fournisseur (prix, lames par paquet).
- **Les contraintes de bord**: plinthe, moulure, corniche, angle rentrant ou sortant, réserve à laisser en haut ou en bas.
- **La refente**: le monteur peut-il recouper des lames en largeur? Certaines lames se refendent mal (rainure, languette, finition de chant).

## Principes de répartition

- **Le sens fixe la structure.** En sens horizontal, les rangs s'empilent sur la hauteur et les lames courent sur la largeur du mur. Les bords gauche et droit changent la longueur des pièces. Les bords haut et bas changent la hauteur couverte, donc le nombre de rangs. En sens vertical, c'est l'inverse.
- **Le support et la face habillée sont deux mesures.** L'outil part de la cote du support et calcule la longueur à couvrir selon chaque bord. Les deux restent visibles.
- **Un coin à 90° est un aboutement droit.** Une face va au fond et garde la cote du mur. L'autre s'arrête contre elle et perd l'épaisseur de la lame plus celle du lambourdage. Le calcul essaie les deux sens et garde celui qui ouvre le moins de lames. Si le nombre de lames est le même, il garde celui qui coupe le moins. Si tout se vaut, la face la plus longue va au fond. À longueur égale, c'est la première de la liste. On ne met pas les deux faces à 45°.
- **Un coin à 270° est coupé à 45°.** L'écart entre pointe longue et pointe courte est l'épaisseur de la lame. Le lambourdage ajoute sa propre épaisseur au dépassement. Si l'épaisseur de lame manque, l'outil le signale et ne chiffre pas le biseau.
- **Une chute déjà coupée à 45° n'est pas une chute droite.** On la réutilise telle quelle seulement si le bout suivant accepte le même biseau. Sinon on la remet d'équerre, elle perd l'épaisseur de la lame, ou on la laisse de côté.
- **Les joints de bout sont le vrai sujet.** Moins il y en a, plus le mur est calme. Ils doivent être décalés entre rangs voisins pour que le mur ne montre pas de ligne verticale ou diagonale involontaire.
- **Seule la dernière lame du mur peut être recoupée en largeur.** Les autres gardent leur largeur d'usine : une recoupe enlève la languette, et la lame ne s'assemble plus à la suivante. Si le reste est trop étroit pour un rang, l'outil élargit seulement cette dernière lame. Il ne recoupe jamais la lame d'avant pour partager le reste. Cette règle vaut pour les lames à languette. Elle ne vaut pas pour une plaque sans languette.

## Plaques recoupables sans languette

Une plaque que la notice autorise à recouper dans les deux sens ne suit pas la règle de la languette. Active le réglage `sansLanguette` dans le fichier de calcul. L'outil recoupe alors une chute encore trop haute pour un rang plus court, et il garde le décalage des joints déjà saisi. Le nombre annoncé est celui de l'outil avec ce réglage.

Sans ce réglage, l'outil range les chutes par hauteur de rang. Une chute de 625 mm de haut ne sert pas un rang plus court, et le compte peut afficher une plaque de trop. On ne corrige pas ce compte à la main : on active le réglage et on relance le calcul.

La longueur minimale de 400 mm est un réglage des lames de bois. Si la notice de la plaque ne l'impose pas, baisse ce réglage plutôt que de laisser l'outil jeter une chute juste en dessous. Une chute ne passe d'une maison à l'autre que si le calcul du lot entier baisse le total.
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
| Largeur minimale du dernier rang | 30 mm | En dessous, seule la dernière lame est élargie. La lame d'avant n'est jamais recoupée en largeur |
| Jeu entre lames | 0 mm | À régler si la notice du fabricant demande un jeu de dilatation ou un joint creux |
| Marge de bord | 0 mm | Réserve identique sur les quatre côtés, seulement si aucun bord n'est un joint ou un angle. Dès qu'un bord est précisé, c'est lui qui compte |
| Marge de commande | 10 % | Ajoutée à l'achat pour les casses, défauts et recoupes |
| Plaque sans languette | non | Oui seulement si la notice autorise de recouper la plaque dans les deux sens. Une chute plus haute peut alors alimenter un rang plus court |
| Taille maximale d'un trou | 250 mm | Au-delà, l'outil traite le passage comme une ouverture |
| Ordre des murs | automatique | L'outil teste l'ordre de pose qui gaspille le moins |

Ces valeurs sont des points de départ courants, pas des exigences. Demande à la personne si elle a une préférence, sinon garde les valeurs de départ et dis-le. Si une notice fabricant impose autre chose (jeu, décalage), elle **prime**.

## Lire un résultat sans le réciter

Ce qui compte pour la personne, dans cet ordre:
1. **Ça manque de lames ou pas** (mode stock) ou **combien acheter** (mode achat).
2. **La chute**: sous 8 % c'est très économe, 8 à 15 % c'est courant, au-delà cherche pourquoi (largeurs qui s'accordent mal avec la hauteur, longueur de lame mal choisie).
3. **Le nombre de joints de bout** et **de coupes**: du travail en plus pour le monteur.
4. **Les avertissements**: décalage relâché, contrainte relâchée, rang refendu, pièce en chute. À expliquer un par un.

Ces repères sur la chute sont indicatifs. Ne les présente pas comme une norme.

## Quand la solution est mauvaise

Cherche la cause avant de changer les lames: souvent un changement de sens, une largeur différente pour le dernier rang, ou une longueur de lame qui tombe mieux sur la dimension du mur suffit. Propose ces pistes à la personne, chiffres de l'outil à l'appui.

## Ce que tu ne fais jamais

- Annoncer un nombre de plaques sans languette en laissant le réglage éteint
- Calculer à la main une quantité, une chute ou une longueur de coupe
- Cacher un avertissement de l'outil
- Considérer une valeur de départ comme une règle de l'art
