# Disposition de lames

Assistant et outil de calcul pour habiller un mur, ou plusieurs murs à la fois, avec des lames de bois de largeurs et de longueurs différentes.

Le dépôt est autonome. Il ne contient aucun projet, aucune cote et aucune donnée personnelle: les dossiers de travail commencent vides.

Auteur: Sven Ringger, [01lab.ch](https://01lab.ch).  
Licence: MIT (voir `LICENSE`). Le code peut être réutilisé, y compris dans un autre projet. La mention d'auteur et le texte de la licence doivent rester avec le code.

## Ce que contient le dépôt

| Dossier ou fichier | Rôle |
|--------------------|------|
| `AGENT.md` | Consignes de l'assistant (à lire par l'outil d'IA) |
| `skills/` | Parcours et connaissances: ouvrir un mur, comparer des dispositions, préparer la liste et la pose |
| `templates/` | Fiche de mur, proposition, liste des lames, descriptif pour le monteur |
| `tools/` | Calcul et modèle de la page graphique |
| `exemple/` | Mur d'exemple, déjà calculé, et sa page |
| `donnees/` | Tes futurs projets et la mémoire (goûts, fournisseurs, chutes restantes) |
| `journal/` | Mémoire des sessions de l'assistant |

## Ce qu'il faut installer

### Pour ouvrir la page d'exemple

Un navigateur récent: Safari, Chrome, Firefox ou Edge.

Rien d'autre. Ouvre `exemple/disposition.html` (double clic, ou glisser le fichier dans le navigateur). Le calcul se fait dans la page, sans réseau. Tu peux changer une largeur, une longueur, une ouverture ou un réglage: le dessin se recalcule.

<img width="1189" height="812" alt="image" src="https://github.com/user-attachments/assets/7c88cabd-3a96-48ca-ab12-eac7e75e4f56" />



### Pour calculer un mur et produire une nouvelle page

[Node.js](https://nodejs.org) 18 ou plus récent. Aucun paquet à installer (`npm install` ne sert à rien ici).

Vérification, dans un terminal, depuis ce dossier:

```text
node --version
```

Tu dois voir un numéro qui commence par 18, 20, 22 ou plus.

### Pour l'assistant (conversation, fiches, conseils de pose)

Un outil capable de lire `AGENT.md` et de lancer une commande, par exemple [Cursor](https://cursor.com).

1. Ouvre ce dossier comme projet.
2. Demande de suivre `AGENT.md`.
3. L'assistant pose les questions, appelle l'outil de calcul, et écrit les fiches dans `donnees/` après ton accord.

Sans cet outil, le calcul et la page fonctionnent quand même, à la main, avec les commandes ci-dessous.

## Comment ça marche

1. Tu décris le mur (largeur et hauteur du support, bords, ouvertures) et les lames (largeur utile, longueur, épaisseur, quantité si tu en as déjà).
2. L'outil compare plusieurs dispositions: sens horizontal ou vertical, une seule largeur ou un rythme de largeurs.
3. La page montre chaque lame à l'échelle, avec sa longueur.
4. Une fois le choix figé, tu obtiens la liste des lames (une seule liste si plusieurs murs partagent les chutes) et un descriptif pour le monteur.

Plusieurs murs dans le même fichier forment un lot: une chute du premier mur peut servir au suivant.

## Commandes

Depuis la racine de ce dossier:

```text
node tools/calepinage_v1.cjs exemple
node tools/calepinage_v1.cjs calculer  exemple/entree.json
node tools/calepinage_v1.cjs variantes exemple/entree.json --max 6
node tools/calepinage_v1.cjs liste     exemple/entree.json --variante 1
node tools/calepinage_v1.cjs page      exemple/entree.json --sortie exemple/disposition.html --variante 1
```

`exemple` affiche un fichier modèle. `page` écrit une page HTML autonome: tu peux l'envoyer telle quelle, le moteur de calcul est dedans.

Pour un vrai mur, copie `exemple/entree.json` vers `donnees/murs/<nom>/entree.json`, remplace les cotes, puis relance `page` vers `donnees/murs/<nom>/disposition.html`.

Le détail des réglages est dans `tools/calepinage_v1.md`.

## Limites

- Lames droites: pas de chevron ni de pose en diagonale. Un coin à 90° s'aboutit, sans coupe en biais. Un coin à 270° se coupe à 45°.
- Chaque face est un rectangle. Pas de pente ni de forme irrégulière. Une crédence ou un retour se saisit face par face.
- Un joint de bord, ou l'épaisseur d'un liteau derrière les lames, change la longueur à couvrir. La cote saisie reste celle du support.
- Les valeurs de départ (décalage des joints, marge à l'achat) sont des réglages, pas des règles de l'art. La notice du fabricant prime.
- L'assistant propose. Il ne remplace pas un menuisier.

## Licence

MIT. Tu peux utiliser, modifier et redistribuer ce code, y compris dans un usage commercial. Deux obligations: garder la mention «Copyright (c) 2026 Sven Ringger, 01lab.ch» et le texte de `LICENSE` avec toute copie substantielle. Le code est fourni tel quel, sans garantie.
