#!/usr/bin/env node
/*
 * Ligne de commande du calepinage de lames.
 * Copyright (c) 2026 Sven Ringger, 01lab.ch (https://01lab.ch)
 * SPDX-License-Identifier: MIT
 *
 *   node calepinage_v1.cjs exemple
 *   node calepinage_v1.cjs calculer  <entree.json> [--json] [réglages]
 *   node calepinage_v1.cjs variantes <entree.json> [--max 6] [--json] [réglages]
 *   node calepinage_v1.cjs liste     <entree.json> [--variante N] [réglages]
 *   node calepinage_v1.cjs page      <entree.json> --sortie <fichier.html> [--variante N] [réglages]
 *
 * <entree.json> peut être "-" pour lire l'entrée standard.
 *
 * Réglages (remplacent les options du fichier) :
 *   --orientation auto|horizontal|vertical   --motif auto|uniforme|sequence|aleatoire
 *   --famille <clé ou largeur>               --sequence 90,140,90       --graine 2
 *   --decalage-min mm  --longueur-min-piece mm  --largeur-min-bord mm  --jeu mm
 *   --marge-bord mm    --marge-commande %       --taille-trou-max mm   --ordre-murs auto|donne
 *
 * Sorties : calculer et variantes écrivent un compte rendu en français (ou du JSON avec --json).
 * page écrit une page HTML autonome, dynamique, qui embarque le même moteur.
 * Le calcul est déterministe : mêmes entrées, mêmes résultats.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./calepinage-moteur_v1.cjs');

const REGLAGES = {
  'orientation': ['orientation', String],
  'motif': ['motif', String],
  'famille': ['famille', String],
  'sequence': ['sequence', function (v) { return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean); }],
  'graine': ['graine', Number],
  'decalage-min': ['decalageMin', Number],
  'longueur-min-piece': ['longueurMinPiece', Number],
  'largeur-min-bord': ['largeurMinBord', Number],
  'jeu': ['jeuEntreLames', Number],
  'marge-bord': ['margeBord', Number],
  'marge-commande': ['margeCommandePct', Number],
  'taille-trou-max': ['tailleTrouMax', Number],
  'ordre-murs': ['ordreMurs', String]
};

const EXEMPLE = {
  projet: 'exemple',
  lames: [
    { id: 'A', largeurUtile: 90, epaisseur: 18, longueur: 2400, prix: 6.5, lamesParPaquet: 6, libelle: 'Lame 90 x 18, 2400 mm' },
    { id: 'B', largeurUtile: 140, epaisseur: 18, longueur: 3000, prix: 11, libelle: 'Lame 140 x 18, 3000 mm' }
  ],
  murs: [
    {
      id: 'mur-exemple', largeur: 3600, hauteur: 2450,
      obstacles: [
        { libelle: 'fenetre', x: 1000, y: 900, largeur: 1200, hauteur: 1100 },
        { libelle: 'prise', x: 300, y: 300, largeur: 80, hauteur: 80 }
      ]
    }
  ],
  options: { orientation: 'auto', motif: 'auto' }
};

function echec(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

function lireEntree(fichier) {
  let brut;
  try {
    brut = fichier === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(fichier, 'utf8');
  } catch (e) {
    return echec('Fichier d\'entrée introuvable : ' + fichier);
  }
  try { return JSON.parse(brut); } catch (e) { return echec('Fichier d\'entrée illisible (JSON invalide) : ' + e.message); }
}

function lireDrapeaux(args) {
  const positionnels = [];
  const drapeaux = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.indexOf('--') !== 0) { positionnels.push(a); continue; }
    const eq = a.indexOf('=');
    const cle = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (eq > 0) drapeaux[cle] = a.slice(eq + 1);
    else if (i + 1 < args.length && args[i + 1].indexOf('--') !== 0) drapeaux[cle] = args[++i];
    else drapeaux[cle] = true;
  }
  return { positionnels: positionnels, drapeaux: drapeaux };
}

function appliquerReglages(entree, drapeaux) {
  entree.options = entree.options || {};
  Object.keys(REGLAGES).forEach(function (k) {
    if (drapeaux[k] !== undefined && drapeaux[k] !== true) entree.options[REGLAGES[k][0]] = REGLAGES[k][1](drapeaux[k]);
  });
}

function appliquerVariante(entree, drapeaux) {
  if (drapeaux.variante === undefined) return;
  const n = Number(drapeaux.variante);
  if (!(n >= 1)) echec('--variante attend un numéro à partir de 1.');
  const copie = JSON.parse(JSON.stringify(entree));
  copie.options = copie.options || {};
  copie.options.orientation = 'auto';
  copie.options.motif = 'auto';
  const liste = C.proposerVariantes(copie, { max: Math.max(n, 6) });
  if (!liste[n - 1]) echec('Il n\'y a que ' + liste.length + ' variante(s).');
  const o = liste[n - 1].options;
  entree.options = entree.options || {};
  ['orientation', 'motif', 'famille', 'sequence', 'graine'].forEach(function (k) { delete entree.options[k]; });
  Object.keys(o).forEach(function (k) { entree.options[k] = o[k]; });
}

function main() {
  const argv = process.argv.slice(2);
  const commande = argv[0];
  const { positionnels, drapeaux } = lireDrapeaux(argv.slice(1));
  if (!commande || commande === 'aide' || commande === '--aide') {
    const source = fs.readFileSync(__filename, 'utf8');
    process.stdout.write(source.slice(source.indexOf('/*') + 3, source.indexOf('*/')).replace(/^ \* ?/gm, '') + '\n');
    return;
  }
  if (commande === 'exemple') { process.stdout.write(JSON.stringify(EXEMPLE, null, 2) + '\n'); return; }
  if (!positionnels[0]) echec('Il manque le fichier d\'entrée. Essayer : exemple, calculer, variantes, liste, page.');
  const entree = lireEntree(positionnels[0]);
  appliquerReglages(entree, drapeaux);
  try {
    if (commande === 'calculer') {
      appliquerVariante(entree, drapeaux);
      const res = C.calculer(entree);
      process.stdout.write((drapeaux.json ? JSON.stringify(res, null, 2) : C.rapport(res)) + '\n');
    } else if (commande === 'variantes') {
      const liste = C.proposerVariantes(entree, { max: Number(drapeaux.max) || 6 });
      if (drapeaux.json) {
        process.stdout.write(JSON.stringify(liste.map(function (v) {
          return { rang: v.rang, orientation: v.orientation, libelle: v.libelle, options: v.options, total: v.total, avertissements: v.avertissements };
        }), null, 2) + '\n');
      } else {
        process.stdout.write(C.rapportVariantes(liste) + '\n');
      }
    } else if (commande === 'liste') {
      appliquerVariante(entree, drapeaux);
      process.stdout.write(C.csvCommande(C.calculer(entree)) + '\n');
    } else if (commande === 'page') {
      if (!drapeaux.sortie || drapeaux.sortie === true) echec('Il manque --sortie <fichier.html>.');
      appliquerVariante(entree, drapeaux);
      const gabarit = fs.readFileSync(path.join(__dirname, 'page-disposition_v1.html'), 'utf8');
      const moteur = fs.readFileSync(path.join(__dirname, 'calepinage-moteur_v1.cjs'), 'utf8').replace(/<\/script/gi, '<\\/script');
      const donnees = JSON.stringify(entree).replace(/</g, '\\u003c');
      const html = gabarit.replace('/*@MOTEUR@*/', function () { return moteur; }).replace('/*@ENTREE@*/', function () { return donnees; });
      fs.mkdirSync(path.dirname(path.resolve(String(drapeaux.sortie))), { recursive: true });
      fs.writeFileSync(String(drapeaux.sortie), html);
      process.stdout.write('Page écrite : ' + drapeaux.sortie + '\n');
    } else {
      echec('Commande inconnue : ' + commande + '. Essayer : exemple, calculer, variantes, liste, page.');
    }
  } catch (e) {
    echec('Erreur : ' + e.message);
  }
}

main();
