/*
 * Moteur de calepinage de lames (murs), sans dépendance.
 * Copyright (c) 2026 Sven Ringger, 01lab.ch (https://01lab.ch)
 * SPDX-License-Identifier: MIT
 * Utilisé par calepinage_v1.cjs (ligne de commande) et embarqué tel quel dans la page dynamique.
 *
 * Entrée (objet JSON) : { projet, lames[], murs[], options{} }
 *   lames[] : { id, largeurUtile, longueur, epaisseur?, famille?, quantite? (vide = illimité),
 *               prix?, lamesParPaquet?, refendable? (défaut vrai), libelle? }   dimensions en mm
 *   murs[]  : { id, largeur, hauteur, orientation?, obstacles[] : { x, y, largeur, hauteur, libelle? } }
 *             origine des coordonnées : coin bas gauche du mur, y vers le haut
 *   options : voir DEFAUTS (réglages modifiables, jamais des règles de l'art)
 *
 * Principe : un mur est couvert par des rangs (largeurs de lames empilées). Chaque rang est rempli
 * par des pièces bout à bout. Les joints de deux rangs voisins restent éloignés d'au moins
 * decalageMin. Les chutes réutilisables (>= longueurMinPiece) alimentent les rangs suivants, y
 * compris ceux des autres murs du lot.
 *
 * Les règles esthétiques et techniques (valeurs conseillées, cas d'usage) vivent dans les
 * compétences de l'assistant, pas ici : ce fichier ne fait que calculer.
 */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Calepinage = fabrique();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 0.01;

  var DEFAUTS = {
    orientation: 'auto',
    motif: 'auto',
    famille: null,
    sequence: null,
    graine: 1,
    jeuEntreLames: 0,
    decalageMin: 300,
    longueurMinPiece: 400,
    largeurMinBord: 30,
    margeBord: 0,
    margeCommandePct: 10,
    pasCoupe: 5,
    tailleTrouMax: 250,
    ordreMurs: 'auto'
  };

  var OPTIONS_NUMERIQUES = ['jeuEntreLames', 'decalageMin', 'longueurMinPiece', 'largeurMinBord',
    'margeBord', 'margeCommandePct', 'pasCoupe', 'graine', 'tailleTrouMax'];

  function arrondi(x) { return Math.round(x * 10) / 10; }
  function num(x) { return (x === undefined || x === null || x === '') ? NaN : Number(x); }
  function texte(x) { return String(arrondi(x)).replace('.', ','); }
  function m2(mm2) { return mm2 / 1e6; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normaliser(entree) {
    if (!entree || typeof entree !== 'object') throw new Error('Entrée invalide.');
    var erreurs = [];
    var avert = [];
    var o = {};
    Object.keys(DEFAUTS).forEach(function (k) { o[k] = DEFAUTS[k]; });
    var saisies = entree.options || {};
    Object.keys(saisies).forEach(function (k) {
      if (saisies[k] !== undefined && saisies[k] !== null && saisies[k] !== '') o[k] = saisies[k];
    });
    OPTIONS_NUMERIQUES.forEach(function (k) {
      o[k] = Number(o[k]);
      if (!isFinite(o[k]) || o[k] < 0) erreurs.push('Option ' + k + ' invalide.');
    });
    if (!(o.pasCoupe > 0)) erreurs.push('Option pasCoupe invalide.');

    var familles = {};
    var cles = [];
    var types = [];
    var ids = {};
    (entree.lames || []).forEach(function (l, i) {
      var id = (l.id !== undefined && l.id !== null && l.id !== '') ? String(l.id) : 'L' + (i + 1);
      var lu = num(l.largeurUtile);
      var lo = num(l.longueur);
      var ep = (l.epaisseur === undefined || l.epaisseur === null || l.epaisseur === '') ? null : num(l.epaisseur);
      if (!(lu > 0)) erreurs.push('Lame ' + id + ' : largeur utile manquante ou invalide.');
      if (!(lo > 0)) erreurs.push('Lame ' + id + ' : longueur manquante ou invalide.');
      if (ids[id]) erreurs.push('Identifiant de lame en double : ' + id + '.');
      ids[id] = true;
      var q = (l.quantite === undefined || l.quantite === null || l.quantite === '') ? Infinity : num(l.quantite);
      if (!(q >= 0)) erreurs.push('Lame ' + id + ' : quantité invalide.');
      var cle = l.famille ? String(l.famille) : (lu + 'x' + (ep === null ? '' : ep));
      var t = {
        id: id, famille: cle, largeurUtile: lu, longueur: lo, epaisseur: ep, quantite: q,
        prix: (l.prix === undefined || l.prix === null || l.prix === '') ? null : num(l.prix),
        lamesParPaquet: (l.lamesParPaquet === undefined || l.lamesParPaquet === null || l.lamesParPaquet === '') ? null : num(l.lamesParPaquet),
        refendable: l.refendable !== false,
        libelle: l.libelle || (texte(lu) + ' x ' + texte(lo) + ' mm')
      };
      types.push(t);
      if (!familles[cle]) {
        familles[cle] = { cle: cle, largeurUtile: lu, epaisseur: ep, refendable: t.refendable, types: [] };
        cles.push(cle);
      } else if (Math.abs(familles[cle].largeurUtile - lu) > EPS) {
        erreurs.push('Famille ' + cle + ' : largeurs utiles différentes.');
      }
      familles[cle].types.push(t);
      familles[cle].refendable = familles[cle].refendable && t.refendable;
    });
    if (!types.length) erreurs.push('Aucune lame déclarée.');
    cles.sort(function (a, b) { return familles[a].largeurUtile - familles[b].largeurUtile; });

    var idsMurs = {};
    var murs = (entree.murs || []).map(function (m, i) {
      var id = (m.id !== undefined && m.id !== null && m.id !== '') ? String(m.id) : 'mur' + (i + 1);
      var W = num(m.largeur);
      var H = num(m.hauteur);
      if (!(W > 0) || !(H > 0)) erreurs.push('Mur ' + id + ' : largeur ou hauteur manquante ou invalide.');
      if (idsMurs[id]) erreurs.push('Identifiant de mur en double : ' + id + '.');
      idsMurs[id] = true;
      var obstacles = [];
      (m.obstacles || []).forEach(function (ob, j) {
        var x = num(ob.x), y = num(ob.y), w = num(ob.largeur), h = num(ob.hauteur);
        var lib = ob.libelle || ('obstacle ' + (j + 1));
        if (!isFinite(x) || !isFinite(y) || !(w > 0) || !(h > 0)) {
          erreurs.push('Mur ' + id + ', ' + lib + ' : x, y, largeur et hauteur sont requis.');
          return;
        }
        var x0 = Math.max(0, x), y0 = Math.max(0, y);
        var x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
        if (x0 !== x || y0 !== y || x1 !== x + w || y1 !== y + h) {
          avert.push('Mur ' + id + ' : ' + lib + ' dépasse du mur, il a été rogné.');
        }
        if (x1 - x0 > EPS && y1 - y0 > EPS) {
          var type = (ob.type === 'trou' || ob.type === 'ouverture') ? ob.type
            : ((x1 - x0 <= o.tailleTrouMax && y1 - y0 <= o.tailleTrouMax) ? 'trou' : 'ouverture');
          obstacles.push({ x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0, libelle: lib, type: type });
        }
      });
      var orient = (m.orientation === 'horizontal' || m.orientation === 'vertical') ? m.orientation : null;
      return { id: id, largeur: W, hauteur: H, obstacles: obstacles, orientation: orient };
    });
    if (!murs.length) erreurs.push('Aucun mur déclaré.');

    if (erreurs.length) throw new Error(erreurs.join('\n'));
    return { projet: entree.projet || '', o: o, familles: familles, cles: cles, types: types, murs: murs, avert: avert };
  }

  function resoudreFamille(norm, ref) {
    if (ref === null || ref === undefined) return null;
    if (norm.familles[ref]) return String(ref);
    var n = Number(ref);
    if (isFinite(n)) {
      for (var i = 0; i < norm.cles.length; i++) {
        if (Math.abs(norm.familles[norm.cles[i]].largeurUtile - n) < EPS) return norm.cles[i];
      }
    }
    throw new Error('Famille de lames inconnue : ' + ref);
  }

  function cycleDepuisMotif(norm, motif) {
    if (motif.motif === 'uniforme') return [resoudreFamille(norm, motif.famille)];
    if (motif.motif === 'aleatoire') {
      var rnd = mulberry32(Number(motif.graine) || 1);
      var seq = [];
      var prec = null;
      for (var i = 0; i < 600; i++) {
        var k = norm.cles[Math.floor(rnd() * norm.cles.length)];
        if (norm.cles.length > 1 && k === prec) { i--; continue; }
        seq.push(k); prec = k;
      }
      return seq;
    }
    if (motif.motif === 'sequence') {
      if (!Array.isArray(motif.sequence) || !motif.sequence.length) throw new Error('Séquence de largeurs vide.');
      return motif.sequence.map(function (r) { return resoudreFamille(norm, r); });
    }
    throw new Error('Motif inconnu : ' + motif.motif);
  }

  function libelleMotif(norm, motif) {
    var F = norm.familles;
    function l(k) { return texte(F[k].largeurUtile); }
    if (motif.motif === 'uniforme') return 'largeur unique ' + l(resoudreFamille(norm, motif.famille));
    if (motif.motif === 'aleatoire') return 'mélange aléatoire (graine ' + motif.graine + ')';
    var s = motif.sequence.map(function (r) { return l(resoudreFamille(norm, r)); });
    return 'rythme ' + s.join(' / ');
  }

  function enumererMotifs(norm) {
    var o = norm.o;
    var res = [];
    function uniformes() { norm.cles.forEach(function (k) { res.push({ motif: 'uniforme', famille: k }); }); }
    if (o.motif === 'uniforme') {
      if (o.famille !== null && o.famille !== undefined) res.push({ motif: 'uniforme', famille: resoudreFamille(norm, o.famille) });
      else uniformes();
      return res;
    }
    if (o.motif === 'sequence') { res.push({ motif: 'sequence', sequence: o.sequence }); return res; }
    if (o.motif === 'aleatoire') { res.push({ motif: 'aleatoire', graine: o.graine }); return res; }
    if (o.motif !== 'auto') throw new Error('Motif inconnu : ' + o.motif);
    uniformes();
    var c = norm.cles;
    for (var i = 0; i < c.length; i++) {
      for (var j = i + 1; j < c.length; j++) {
        res.push({ motif: 'sequence', sequence: [c[i], c[j]] });
        res.push({ motif: 'sequence', sequence: [c[i], c[i], c[j]] });
        res.push({ motif: 'sequence', sequence: [c[i], c[j], c[j]] });
      }
    }
    if (c.length >= 3) res.push({ motif: 'sequence', sequence: c.slice() });
    if (c.length >= 2) [1, 2, 3].forEach(function (g) { res.push({ motif: 'aleatoire', graine: g }); });
    return res;
  }

  function planifierRangs(V, cycle, norm, avert, idMur) {
    var o = norm.o, g = o.jeuEntreLames, F = norm.familles;
    var vFin = V - o.margeBord;
    var pos = o.margeBord;
    var rangs = [];
    var i = 0;
    while (true) {
      var f = F[cycle[i % cycle.length]];
      if (pos + f.largeurUtile <= vFin + EPS) {
        rangs.push({ v0: pos, v1: pos + f.largeurUtile, largeur: f.largeurUtile, source: f.cle, refendu: false });
        pos += f.largeurUtile + g;
        i++;
      } else break;
    }
    var dernier = rangs.length ? rangs[rangs.length - 1].v1 : o.margeBord;
    var reste = vFin - dernier - (rangs.length ? g : 0);
    if (reste > 0.5) {
      var debut = rangs.length ? dernier + g : o.margeBord;
      if (reste >= o.largeurMinBord || !rangs.length) {
        var cand = norm.cles.filter(function (k) { return F[k].largeurUtile >= reste - EPS; });
        var refendables = cand.filter(function (k) { return F[k].refendable; });
        var choix = (refendables.length ? refendables : cand)[0];
        if (!choix) {
          avert.push('Mur ' + idMur + ' : aucune lame assez large pour le dernier rang de ' + texte(reste) + ' mm.');
        } else {
          if (!F[choix].refendable) avert.push('Mur ' + idMur + ' : le dernier rang exige de refendre une lame déclarée non refendable.');
          rangs.push({ v0: debut, v1: vFin, largeur: reste, source: choix, refendu: reste < F[choix].largeurUtile - EPS });
        }
      } else {
        var last = rangs.pop();
        var wnew = (last.largeur + reste) / 2;
        if (wnew < o.largeurMinBord) avert.push('Mur ' + idMur + ' : les deux derniers rangs restent plus étroits que ' + texte(o.largeurMinBord) + ' mm.');
        if (!F[last.source].refendable) avert.push('Mur ' + idMur + ' : le rééquilibrage des derniers rangs exige de refendre une lame non refendable.');
        var a = { v0: last.v0, v1: last.v0 + wnew, largeur: wnew, source: last.source, refendu: true };
        var b = { v0: a.v1 + g, v1: vFin, largeur: wnew, source: last.source, refendu: true };
        rangs.push(a, b);
        avert.push('Mur ' + idMur + ' : reste de ' + texte(reste) + ' mm rééquilibré sur les deux derniers rangs (' + texte(wnew) + ' mm chacun).');
      }
    }
    return rangs;
  }

  function segmentsLibres(rang, obs, uMin, uMax) {
    var segs = [[uMin, uMax]];
    obs.forEach(function (ob) {
      if (ob.v0 < rang.v1 - EPS && ob.v1 > rang.v0 + EPS) {
        var suite = [];
        segs.forEach(function (s) {
          var a = s[0], b = s[1];
          if (ob.u1 <= a + EPS || ob.u0 >= b - EPS) { suite.push([a, b]); return; }
          if (ob.u0 > a + EPS) suite.push([a, Math.min(ob.u0, b)]);
          if (ob.u1 < b - EPS) suite.push([Math.max(ob.u1, a), b]);
        });
        segs = suite;
      }
    });
    return segs.filter(function (s) { return s[1] - s[0] > 0.5; });
  }

  function coutChute(l, o) {
    if (l <= EPS) return 0;
    if (l < o.longueurMinPiece) return l;
    return l * 0.1;
  }

  function evaluer(L, c, r, prev, dec, o, interdits) {
    if (L >= r - EPS) return { e: r, cout: coutChute(L - r, o) };
    var emax = Math.min(L, r - o.longueurMinPiece);
    var best = null;
    for (var e = emax; e >= o.longueurMinPiece - EPS; e -= o.pasCoupe) {
      var pos = c + e;
      var ok = true;
      for (var k = 0; k < prev.length; k++) {
        if (Math.abs(prev[k] - pos) < dec - EPS) { ok = false; break; }
      }
      if (!ok) continue;
      for (var q = 0; q < interdits.length && ok; q++) {
        if (pos > interdits[q][0] - EPS && pos < interdits[q][1] + EPS) ok = false;
      }
      if (!ok) continue;
      var cout = coutChute(L - e, o);
      if (!best || cout < best.cout - 1e-9) best = { e: e, cout: cout };
      if (best.cout <= 1e-9) break;
    }
    return best;
  }

  function comparerCles(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] < b[i] - 1e-9) return -1;
      if (a[i] > b[i] + 1e-9) return 1;
    }
    return 0;
  }

  function choisirPiece(ctx, rang, c, r, prev, interdits) {
    var o = ctx.o;
    var fam = ctx.familles[rang.source];
    var cle = rang.source + '@' + arrondi(rang.largeur);
    var pool = ctx.pool[cle] || (ctx.pool[cle] = []);
    var base = [];
    pool.forEach(function (it, idx) { base.push({ origine: 'chute', L: it.L, idx: idx, typeId: it.typeId }); });
    fam.types.forEach(function (t) {
      base.push({ origine: ctx.restant[t.id] > 0 ? 'neuve' : 'manquante', L: t.longueur, type: t, typeId: t.id });
    });
    var decs = [o.decalageMin, o.decalageMin / 2, 0];
    for (var d = 0; d < decs.length; d++) {
      var best = null;
      for (var i = 0; i < base.length; i++) {
        var ev = evaluer(base[i].L, c, r, prev, decs[d], o, d < 2 ? interdits : []);
        if (!ev) continue;
        var cout = ev.cout + (base[i].origine === 'manquante' ? 1e6 : 0);
        var k = [cout, base[i].origine === 'chute' ? 0 : 1, -ev.e];
        if (!best || comparerCles(k, best.k) < 0) best = { cand: base[i], e: ev.e, k: k };
      }
      if (best) {
        if (d > 0) ctx.decalagesRelaches++;
        return { cand: best.cand, e: best.e, cle: cle, pool: pool };
      }
    }
    var choix = base[0];
    base.forEach(function (b) { if (b.L > choix.L) choix = b; });
    ctx.contraintesRelachees++;
    return { cand: choix, e: Math.min(choix.L, r), cle: cle, pool: pool };
  }

  function remplirSegment(ctx, rang, a, b, prev, nouveaux, sortie, interdits) {
    var o = ctx.o;
    var c = a;
    var garde = 0;
    while (b - c > EPS && garde++ < 5000) {
      var r = b - c;
      var ch = choisirPiece(ctx, rang, c, r, prev, interdits);
      var cand = ch.cand, e = ch.e;
      if (cand.origine === 'chute') {
        ch.pool.splice(cand.idx, 1);
      } else {
        ctx.consomme[cand.typeId] = (ctx.consomme[cand.typeId] || 0) + 1;
        if (cand.origine === 'manquante') ctx.manquantes[cand.typeId] = (ctx.manquantes[cand.typeId] || 0) + 1;
        else ctx.restant[cand.typeId]--;
      }
      var reste = cand.L - e;
      if (reste >= o.longueurMinPiece - EPS) ch.pool.push({ L: reste, typeId: cand.typeId });
      if (b - (c + e) > EPS) nouveaux.push(c + e);
      sortie.push({
        u0: c, u1: c + e, longueur: e, origine: cand.origine === 'chute' ? 'chute' : 'neuve',
        manquante: cand.origine === 'manquante', typeId: cand.typeId, longueurLame: cand.L,
        coupe: e < cand.L - EPS
      });
      c += e;
    }
  }

  function disposerMur(ctx, mur, orientation, cycle) {
    var horiz = orientation === 'horizontal';
    var U = horiz ? mur.largeur : mur.hauteur;
    var V = horiz ? mur.hauteur : mur.largeur;
    var o = ctx.o;
    function versUV(ob) {
      return horiz
        ? { u0: ob.x, u1: ob.x + ob.largeur, v0: ob.y, v1: ob.y + ob.hauteur, libelle: ob.libelle }
        : { u0: ob.y, u1: ob.y + ob.hauteur, v0: ob.x, v1: ob.x + ob.largeur, libelle: ob.libelle };
    }
    var ouvertures = mur.obstacles.filter(function (ob) { return ob.type === 'ouverture'; }).map(versUV);
    var trous = mur.obstacles.filter(function (ob) { return ob.type === 'trou'; }).map(versUV);
    var uMin = o.margeBord, uMax = U - o.margeBord;
    var rangsPlan = planifierRangs(V, cycle, ctx.norm, ctx.avert, mur.id);
    var prev = [];
    var pieces = [];
    var rangs = [];

    function enregistrer(ri, rang, brutes, offset) {
      brutes.forEach(function (p, pi) {
        var x = horiz ? p.u0 : rang.v0, y = horiz ? rang.v0 : p.u0;
        var w = horiz ? p.u1 - p.u0 : rang.largeur, h = horiz ? rang.largeur : p.u1 - p.u0;
        var perces = trous.filter(function (t) {
          var u0 = horiz ? x : y, u1 = horiz ? x + w : y + h, v0 = horiz ? y : x, v1 = horiz ? y + h : x + w;
          return t.u0 < u1 - EPS && t.u1 > u0 + EPS && t.v0 < v1 - EPS && t.v1 > v0 + EPS;
        }).map(function (t) { return t.libelle; });
        pieces.push({
          rang: ri + 1, index: offset + pi + 1, x: x, y: y, w: w, h: h,
          longueur: p.longueur, largeurRang: rang.largeur, famille: rang.source, refendu: rang.refendu,
          raccord: !!rang.raccord, percements: perces,
          origine: p.origine, manquante: p.manquante, typeId: p.typeId, longueurLame: p.longueurLame, coupe: p.coupe
        });
      });
    }

    rangsPlan.forEach(function (rang, ri) {
      var nouveaux = [];
      var brutes = [];
      var interdits = trous.filter(function (t) { return t.v0 < rang.v1 - EPS && t.v1 > rang.v0 + EPS; })
        .map(function (t) { return [t.u0, t.u1]; });
      segmentsLibres(rang, ouvertures, uMin, uMax).forEach(function (s) {
        remplirSegment(ctx, rang, s[0], s[1], prev, nouveaux, brutes, interdits);
      });
      enregistrer(ri, rang, brutes, 0);
      var nbRaccords = 0;
      ouvertures.forEach(function (ob) {
        if (!(ob.v0 < rang.v1 - EPS && ob.v1 > rang.v0 + EPS)) return;
        var a = Math.max(ob.u0, uMin), b = Math.min(ob.u1, uMax);
        if (b - a < 0.5) return;
        var bandes = [];
        if (ob.v0 > rang.v0 + 0.5) bandes.push([rang.v0, Math.min(ob.v0, rang.v1)]);
        if (ob.v1 < rang.v1 - 0.5) bandes.push([Math.max(ob.v1, rang.v0), rang.v1]);
        bandes.forEach(function (bd) {
          var sous = { v0: bd[0], v1: bd[1], largeur: bd[1] - bd[0], source: rang.source, refendu: true, raccord: true };
          if (sous.largeur < o.largeurMinBord) {
            ctx.avert.push('Mur ' + mur.id + ' : bande de raccord de ' + texte(sous.largeur) + ' mm près de ' + ob.libelle
              + ' (rang ' + (ri + 1) + '), à éviter en calant un rang sur le bord de l\'ouverture.');
          }
          var brutesRaccord = [];
          remplirSegment(ctx, sous, a, b, [], [], brutesRaccord, []);
          enregistrer(ri, sous, brutesRaccord, brutes.length + nbRaccords);
          nbRaccords += brutesRaccord.length;
        });
      });
      rangs.push({
        rang: ri + 1, largeur: rang.largeur, famille: rang.source, refendu: rang.refendu,
        pieces: brutes.length + nbRaccords, joints: nouveaux.length
      });
      prev = nouveaux;
    });
    var surfaceMur = mur.largeur * mur.hauteur;
    var surfaceOuvertures = mur.obstacles.filter(function (ob) { return ob.type === 'ouverture'; })
      .reduce(function (s, ob) { return s + ob.largeur * ob.hauteur; }, 0);
    var couvert = pieces.reduce(function (s, p) { return s + p.w * p.h; }, 0);
    return {
      id: mur.id, largeur: mur.largeur, hauteur: mur.hauteur, orientation: orientation, obstacles: mur.obstacles,
      rangs: rangs, pieces: pieces,
      stats: {
        surfaceMur: m2(surfaceMur), surfaceObstacles: m2(surfaceOuvertures), surfaceARevetir: m2(surfaceMur - surfaceOuvertures),
        surfaceRevetue: m2(couvert), rangs: rangs.length, pieces: pieces.length,
        joints: rangs.reduce(function (s, r) { return s + r.joints; }, 0),
        rangsRefendus: rangs.filter(function (r) { return r.refendu; }).length,
        trous: trous.length
      }
    };
  }

  function nouveauContexte(norm, avert) {
    var restant = {};
    norm.types.forEach(function (t) { restant[t.id] = t.quantite; });
    return {
      norm: norm, o: norm.o, familles: norm.familles, restant: restant, pool: {}, consomme: {}, manquantes: {},
      decalagesRelaches: 0, contraintesRelachees: 0, avert: avert
    };
  }

  function synthese(norm, ctx, murs, avert) {
    var o = norm.o;
    var surfaceAchetee = 0;
    var commande = [];
    norm.types.forEach(function (t) {
      var n = ctx.consomme[t.id] || 0;
      var manque = ctx.manquantes[t.id] || 0;
      surfaceAchetee += m2(n * norm.familles[t.famille].largeurUtile * t.longueur);
      var illimite = t.quantite === Infinity;
      var avecMarge = illimite ? Math.ceil(n * (1 + o.margeCommandePct / 100) - 1e-9) : n;
      var paquets = (illimite && t.lamesParPaquet > 0 && n > 0) ? Math.ceil(avecMarge / t.lamesParPaquet) : null;
      var commandees = paquets !== null ? paquets * t.lamesParPaquet : avecMarge;
      commande.push({
        id: t.id, libelle: t.libelle, famille: t.famille, largeurUtile: t.largeurUtile, longueur: t.longueur,
        epaisseur: t.epaisseur, necessaires: n, aCommander: illimite ? commandees : 0, paquets: paquets,
        stock: illimite ? null : t.quantite, manque: manque, restantApres: illimite ? null : Math.max(0, t.quantite - n),
        montant: (illimite && t.prix !== null && n > 0) ? Math.round(commandees * t.prix * 100) / 100 : null
      });
    });
    var surfaceRevetue = murs.reduce(function (s, m) { return s + m.stats.surfaceRevetue; }, 0);
    var restantes = [];
    var surfaceRestantes = 0;
    Object.keys(ctx.pool).forEach(function (cle) {
      var largeur = Number(cle.split('@')[1]);
      var fam = cle.split('@')[0];
      ctx.pool[cle].forEach(function (it) {
        restantes.push({ famille: fam, largeurRang: largeur, longueur: arrondi(it.L) });
        surfaceRestantes += m2(it.L * largeur);
      });
    });
    var total = {
      surfaceARevetir: murs.reduce(function (s, m) { return s + m.stats.surfaceARevetir; }, 0),
      surfaceRevetue: surfaceRevetue,
      surfaceAchetee: surfaceAchetee,
      chutePct: surfaceAchetee > 0 ? (surfaceAchetee - surfaceRevetue) / surfaceAchetee * 100 : 0,
      chutesRestantesPct: surfaceAchetee > 0 ? surfaceRestantes / surfaceAchetee * 100 : 0,
      lamesNeuves: commande.reduce(function (s, c) { return s + c.necessaires; }, 0),
      lamesManquantes: commande.reduce(function (s, c) { return s + c.manque; }, 0),
      pieces: murs.reduce(function (s, m) { return s + m.stats.pieces; }, 0),
      joints: murs.reduce(function (s, m) { return s + m.stats.joints; }, 0),
      rangsRefendus: murs.reduce(function (s, m) { return s + m.stats.rangsRefendus; }, 0),
      piecesEnChute: murs.reduce(function (s, m) { return s + m.pieces.filter(function (p) { return p.origine === 'chute'; }).length; }, 0),
      coupes: murs.reduce(function (s, m) { return s + m.pieces.filter(function (p) { return p.coupe; }).length; }, 0),
      decalagesRelaches: ctx.decalagesRelaches,
      contraintesRelachees: ctx.contraintesRelachees,
      montant: commande.some(function (c) { return c.montant !== null; })
        ? Math.round(commande.reduce(function (s, c) { return s + (c.montant || 0); }, 0) * 100) / 100 : null
    };
    if (total.lamesManquantes > 0) avert.push('Stock insuffisant : il manque ' + total.lamesManquantes + ' lame(s) pour couvrir tout le lot.');
    if (ctx.decalagesRelaches > 0) avert.push('Le décalage minimum entre joints n\'a pas pu être tenu pour ' + ctx.decalagesRelaches + ' pièce(s).');
    if (ctx.contraintesRelachees > 0) avert.push('Des pièces plus courtes que la longueur minimale ont été nécessaires (' + ctx.contraintesRelachees + ').');
    return { total: total, commande: commande, chutesRestantes: restantes };
  }

  function permutations(a) {
    if (a.length <= 1) return [a.slice()];
    var out = [];
    a.forEach(function (x, i) {
      var reste = a.slice(0, i).concat(a.slice(i + 1));
      permutations(reste).forEach(function (p) { out.push([x].concat(p)); });
    });
    return out;
  }

  function calculerFixe(norm, orientation, motif) {
    var cycle = cycleDepuisMotif(norm, motif);
    var orders = [norm.murs.map(function (m) { return m.id; })];
    if (norm.o.ordreMurs === 'auto' && norm.murs.length > 1 && norm.murs.length <= 5) {
      orders = permutations(orders[0]);
    }
    var meilleur = null;
    orders.forEach(function (ordre) {
      var avert = norm.avert.slice();
      var ctx = nouveauContexte(norm, avert);
      var parId = {};
      norm.murs.forEach(function (m) { parId[m.id] = m; });
      var resultats = {};
      ordre.forEach(function (id) {
        var m = parId[id];
        resultats[id] = disposerMur(ctx, m, m.orientation || orientation, cycle);
      });
      var murs = norm.murs.map(function (m) { return resultats[m.id]; });
      var syn = synthese(norm, ctx, murs, avert);
      var cle = [syn.total.lamesManquantes, syn.total.surfaceAchetee, syn.total.joints];
      if (!meilleur || comparerCles(cle, meilleur.cle) < 0) {
        meilleur = { cle: cle, ordre: ordre, murs: murs, syn: syn, avert: avert };
      }
    });
    function refLisible(cle) {
      var w = norm.familles[cle].largeurUtile;
      var memes = norm.cles.filter(function (k) { return Math.abs(norm.familles[k].largeurUtile - w) < EPS; });
      return memes.length === 1 ? w : cle;
    }
    var optionsRetenues = { orientation: orientation, motif: motif.motif };
    if (motif.motif === 'uniforme') optionsRetenues.famille = refLisible(cycle[0]);
    if (motif.motif === 'sequence') optionsRetenues.sequence = cycle.map(refLisible);
    if (motif.motif === 'aleatoire') optionsRetenues.graine = Number(motif.graine) || 1;
    var uniques = [];
    meilleur.avert.forEach(function (a) { if (uniques.indexOf(a) < 0) uniques.push(a); });
    return {
      projet: norm.projet,
      parametres: {
        orientation: orientation, motif: motif.motif, libelleMotif: libelleMotif(norm, motif),
        ordreMurs: meilleur.ordre, options: norm.o
      },
      optionsRetenues: optionsRetenues,
      murs: meilleur.murs,
      total: meilleur.syn.total,
      commande: meilleur.syn.commande,
      chutesRestantes: meilleur.syn.chutesRestantes,
      avertissements: uniques
    };
  }

  function score(res) {
    var t = res.total;
    return t.lamesManquantes * 1000 + t.chutePct * 10 + t.decalagesRelaches * 5 + t.contraintesRelachees * 20 +
      t.joints * 0.3 + t.coupes * 0.1 + t.rangsRefendus * 1;
  }

  function categorie(res) {
    return res.parametres.orientation + ':' + (res.parametres.motif === 'sequence' ? 'rythme' : res.parametres.motif);
  }

  function candidats(norm) {
    var o = norm.o;
    var orientations = o.orientation === 'auto' ? ['horizontal', 'vertical'] : [o.orientation];
    if (o.orientation !== 'auto' && o.orientation !== 'horizontal' && o.orientation !== 'vertical') {
      throw new Error('Orientation inconnue : ' + o.orientation);
    }
    var motifs = enumererMotifs(norm);
    var out = [];
    orientations.forEach(function (ori) { motifs.forEach(function (m) { out.push({ orientation: ori, motif: m }); }); });
    return out;
  }

  function proposerVariantes(entree, opt) {
    var norm = normaliser(entree);
    var max = (opt && opt.max) || 6;
    var vus = {};
    var liste = [];
    candidats(norm).forEach(function (c) {
      var res = calculerFixe(norm, c.orientation, c.motif);
      var signature = JSON.stringify([c.orientation, res.murs.map(function (m) {
        return m.pieces.map(function (p) { return [p.x, p.y, arrondi(p.w), arrondi(p.h)]; });
      })]);
      if (vus[signature]) return;
      vus[signature] = true;
      liste.push({ score: score(res), resultat: res });
    });
    liste.sort(function (a, b) { return a.score - b.score; });
    var retenues = [];
    var categories = {};
    liste.forEach(function (v) {
      var k = categorie(v.resultat);
      if (!categories[k] && retenues.length < max) { categories[k] = true; retenues.push(v); }
    });
    liste.forEach(function (v) {
      if (retenues.length < max && retenues.indexOf(v) < 0) retenues.push(v);
    });
    retenues.sort(function (a, b) { return a.score - b.score; });
    return retenues.map(function (v, i) {
      return {
        rang: i + 1,
        orientation: v.resultat.parametres.orientation,
        libelle: v.resultat.parametres.libelleMotif,
        options: v.resultat.optionsRetenues,
        total: v.resultat.total,
        avertissements: v.resultat.avertissements,
        resultat: v.resultat
      };
    });
  }

  function calculer(entree) {
    var norm = normaliser(entree);
    var liste = candidats(norm).map(function (c) { return calculerFixe(norm, c.orientation, c.motif); });
    liste.sort(function (a, b) { return score(a) - score(b); });
    return liste[0];
  }

  function rapport(res) {
    var t = res.total;
    var L = [];
    var p = res.parametres;
    L.push('Projet : ' + (res.projet || '(sans nom)') + ', ' + res.murs.length + ' mur(s), sens ' + p.orientation + ', ' + p.libelleMotif + '.');
    if (res.murs.length > 1) L.push('Ordre de pose retenu pour réutiliser les chutes : ' + p.ordreMurs.join(', ') + '.');
    res.murs.forEach(function (m) {
      L.push('');
      L.push('Mur ' + m.id + ' (' + texte(m.largeur) + ' x ' + texte(m.hauteur) + ' mm, ' + m.orientation + ') : '
        + m.stats.rangs + ' rangs, ' + m.stats.pieces + ' pièces, ' + m.stats.joints + ' joints, '
        + texte(Math.round(m.stats.surfaceARevetir * 100) / 100) + ' m2 à revêtir.');
    });
    L.push('');
    L.push('Lames à prévoir :');
    res.commande.forEach(function (c) {
      if (!c.necessaires && !c.stock) return;
      var ligne = '- ' + c.libelle + ' [' + c.id + '] : ' + c.necessaires + ' nécessaire(s)';
      if (c.stock === null) {
        ligne += ', à commander ' + c.aCommander + (c.paquets !== null ? ' (' + c.paquets + ' paquet(s))' : '') + ' avec marge';
        if (c.montant !== null) ligne += ', ' + texte(c.montant) + ' CHF';
      } else {
        ligne += ', stock ' + c.stock + ', restant ' + c.restantApres + (c.manque ? ', MANQUE ' + c.manque : '');
      }
      L.push(ligne);
    });
    L.push('');
    L.push('Chute globale : ' + texte(Math.round(t.chutePct * 10) / 10) + ' % (achetée ' + texte(Math.round(t.surfaceAchetee * 100) / 100)
      + ' m2 pour ' + texte(Math.round(t.surfaceRevetue * 100) / 100) + ' m2 posés), dont '
      + texte(Math.round(t.chutesRestantesPct * 10) / 10) + ' % en chutes réutilisables restantes.');
    L.push('Pièces : ' + t.pieces + ' (dont ' + t.piecesEnChute + ' issues de chutes), ' + t.coupes + ' coupes en bout, '
      + t.rangsRefendus + ' rang(s) refendu(s).');
    var perces = [];
    res.murs.forEach(function (m) {
      m.pieces.forEach(function (p) {
        p.percements.forEach(function (n) { perces.push('mur ' + m.id + ', rang ' + p.rang + ', ' + n); });
      });
    });
    if (perces.length) L.push('Pièces à percer : ' + perces.join(' ; ') + '.');
    if (res.avertissements.length) {
      L.push('');
      L.push('Points d\'attention :');
      res.avertissements.forEach(function (a) { L.push('- ' + a); });
    }
    return L.join('\n');
  }

  function rapportVariantes(liste) {
    var L = [];
    liste.forEach(function (v) {
      var t = v.total;
      L.push(v.rang + '. sens ' + v.orientation + ', ' + v.libelle + ' : ' + t.lamesNeuves + ' lames, chute '
        + texte(Math.round(t.chutePct * 10) / 10) + ' %, ' + t.joints + ' joints, ' + t.coupes + ' coupes, '
        + t.rangsRefendus + ' rang(s) refendu(s)' + (t.lamesManquantes ? ', MANQUE ' + t.lamesManquantes + ' lame(s)' : '') + '.');
    });
    return L.join('\n');
  }

  function csvCommande(res) {
    var lignes = ['id;libelle;largeur utile mm;longueur mm;necessaires;a commander;paquets;montant CHF'];
    res.commande.forEach(function (c) {
      if (!c.necessaires) return;
      lignes.push([c.id, c.libelle, c.largeurUtile, c.longueur, c.necessaires, c.stock === null ? c.aCommander : '',
        c.paquets === null ? '' : c.paquets, c.montant === null ? '' : c.montant].join(';'));
    });
    return lignes.join('\n');
  }

  return {
    DEFAUTS: DEFAUTS, normaliser: normaliser, calculer: calculer, proposerVariantes: proposerVariantes,
    rapport: rapport, rapportVariantes: rapportVariantes, csvCommande: csvCommande
  };
}));
