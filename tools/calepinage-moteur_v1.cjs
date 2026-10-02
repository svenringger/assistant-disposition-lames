/*
 * Moteur de calepinage de lames (murs), sans dépendance.
 * Copyright (c) 2026 Sven Ringger, 01lab.ch (https://01lab.ch)
 * SPDX-License-Identifier: MIT
 * Utilisé par calepinage_v1.cjs (ligne de commande) et embarqué tel quel dans la page dynamique.
 *
 * Entrée (objet JSON) : { projet, lames[], murs[], options{} }
 *   lames[] : { id, largeurUtile, longueur, epaisseur?, famille?, quantite? (vide = illimité),
 *               prix?, lamesParPaquet?, refendable? (défaut vrai), libelle? }   dimensions en mm
 *   murs[]  : { id, largeur, hauteur, orientation?, epaisseurSupport?, bords?, obstacles[] }
 *             largeur et hauteur = support (mur, meuble), pas forcément la face habillée
 *             bords : { gauche, droite, bas, haut } chacun { type: ras|joint|angle,
 *               joint?, sens?: sortant|rentrant, coupe?: 45|passe|arrete,
 *               epaisseurRencontre?, voisin? }
 *             sans bords, ou si les quatre sont à ras : margeBord s'applique comme avant
 *             obstacles[] : { x, y, largeur, hauteur, libelle? }
 *             origine des coordonnées : coin bas gauche du support, y vers le haut
 *   options : voir DEFAUTS (réglages modifiables, jamais des règles de l'art)
 *             sansLanguette (défaut faux) : une chute plus haute que le rang peut être
 *             recoupée à la hauteur de ce rang. Faux pour une lame à languette.
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
    ordreMurs: 'auto',
    prioriteCoupe: 'chute',
    sansLanguette: false
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
    if (o.prioriteCoupe !== 'chute' && o.prioriteCoupe !== 'longueur') erreurs.push('Option prioriteCoupe invalide.');
    if (o.sansLanguette !== true && o.sansLanguette !== false) erreurs.push('Option sansLanguette invalide.');

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
      var support = (m.epaisseurSupport === undefined || m.epaisseurSupport === null || m.epaisseurSupport === '') ? 0 : num(m.epaisseurSupport);
      if (!(support >= 0)) erreurs.push('Mur ' + id + ' : épaisseur de support invalide.');
      var bords = null;
      if (m.bords) {
        bords = {};
        ['gauche', 'droite', 'bas', 'haut'].forEach(function (nom) {
          var b = m.bords[nom] || {};
          var type = (b.type === 'joint' || b.type === 'angle') ? b.type : 'ras';
          var out = { type: type };
          if (type === 'joint') {
            var j = (b.joint === undefined || b.joint === null || b.joint === '') ? 0 : num(b.joint);
            if (!(j >= 0)) erreurs.push('Mur ' + id + ', bord ' + nom + ' : joint invalide.');
            out.joint = j;
          }
          if (type === 'angle') {
            out.sens = b.sens === 'sortant' ? 'sortant' : 'rentrant';
            if (out.sens === 'sortant') {
              out.coupe = (b.coupe === 'passe' || b.coupe === 'arrete') ? b.coupe : '45';
            } else if (b.coupe === 'arrete' || b.coupe === 'passe') {
              out.coupe = b.coupe;
            } else {
              out.coupe = 'auto';
              if (b.coupe === '45') {
                avert.push('Mur ' + id + ', bord ' + nom + ' : un coin à 90° ne se coupe pas à 45°. Le calcul choisit la face qui va au fond.');
              }
            }
            var er = (b.epaisseurRencontre === undefined || b.epaisseurRencontre === null || b.epaisseurRencontre === '') ? 0 : num(b.epaisseurRencontre);
            if (!(er >= 0)) erreurs.push('Mur ' + id + ', bord ' + nom + ' : retrait de coin invalide.');
            out.epaisseurRencontre = er;
            out.voisin = b.voisin ? String(b.voisin) : '';
          }
          bords[nom] = out;
        });
      }
      return { id: id, largeur: W, hauteur: H, obstacles: obstacles, orientation: orient, epaisseurSupport: support, bords: bords };
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

  function planifierRangs(V, cycle, norm, avert, idMur, vDebut, vFin) {
    var o = norm.o, g = o.jeuEntreLames, F = norm.familles;
    if (vDebut === undefined) vDebut = o.margeBord;
    if (vFin === undefined) vFin = V - o.margeBord;
    var pos = vDebut;
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
    function poserDernier(debut, largeur) {
      var cand = norm.cles.filter(function (k) { return F[k].largeurUtile >= largeur - EPS; });
      var refendables = cand.filter(function (k) { return F[k].refendable; });
      var choix = (refendables.length ? refendables : cand)[0];
      if (!choix) {
        avert.push('Mur ' + idMur + ' : aucune lame assez large pour le dernier rang de ' + texte(largeur) + ' mm.');
        return;
      }
      var refendu = largeur < F[choix].largeurUtile - EPS;
      if (refendu && !F[choix].refendable) avert.push('Mur ' + idMur + ' : le dernier rang exige de refendre une lame déclarée non refendable.');
      rangs.push({ v0: debut, v1: vFin, largeur: largeur, source: choix, refendu: refendu });
    }
    var dernier = rangs.length ? rangs[rangs.length - 1].v1 : vDebut;
    var reste = vFin - dernier - (rangs.length ? g : 0);
    if (reste > 0.5) {
      var debut = rangs.length ? dernier + g : vDebut;
      if (reste >= o.largeurMinBord || !rangs.length) {
        poserDernier(debut, reste);
      } else {
        var last = rangs[rangs.length - 1];
        var combine = vFin - last.v0;
        var assezLarge = norm.cles.some(function (k) { return F[k].refendable && F[k].largeurUtile >= combine - EPS; });
        if (assezLarge) {
          rangs.pop();
          poserDernier(last.v0, combine);
          avert.push(o.sansLanguette
            ? 'Mur ' + idMur + ' : il reste ' + texte(reste) + ' mm, trop peu pour un rang. Le dernier rang est élargi à ' + texte(combine) + ' mm.'
            : 'Mur ' + idMur + ' : il reste ' + texte(reste) + ' mm, trop peu pour un rang. Seule la dernière lame est recoupée en largeur, à ' + texte(combine) + ' mm. La lame d\'avant garde sa largeur, et donc sa languette.');
        } else {
          poserDernier(debut, reste);
          avert.push(o.sansLanguette
            ? 'Mur ' + idMur + ' : il reste ' + texte(reste) + ' mm. Ce dernier rang est plus étroit que ' + texte(o.largeurMinBord) + ' mm.'
            : 'Mur ' + idMur + ' : il reste ' + texte(reste) + ' mm. Ce dernier rang est plus étroit que ' + texte(o.largeurMinBord) + ' mm. On ne recoupe pas la lame d\'avant : elle perdrait sa languette.');
        }
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

  function evaluer(L, c, r, prev, dec, o, interdits, extra) {
    if (!extra) extra = function () { return 0; };
    function tient(e) { return e + extra(e) <= L + EPS; }
    if (tient(r)) return { e: r, cout: coutChute(L - r - extra(r), o) };
    var emax = Math.min(L, r - o.longueurMinPiece);
    var best = null;
    for (var e = emax; e >= o.longueurMinPiece - EPS; e -= o.pasCoupe) {
      if (!tient(e)) continue;
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
      var cout = coutChute(L - e - extra(e), o);
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

  function longueurUtilisable(L, bout, besoin, E) {
    if (!bout || bout === 'droit' || bout === besoin) return L;
    var L2 = L - (E || 0);
    return L2 > EPS ? L2 : 0;
  }

  function clePool(source, hauteur) {
    return source + '@' + arrondi(hauteur);
  }

  function poolsPourRang(ctx, rang) {
    var cle = clePool(rang.source, rang.largeur);
    var pools = [{ cle: cle, pool: ctx.pool[cle] || (ctx.pool[cle] = []), hauteur: rang.largeur }];
    if (!ctx.o.sansLanguette) return pools;
    Object.keys(ctx.pool).forEach(function (k) {
      var parts = k.split('@');
      if (parts[0] !== String(rang.source)) return;
      var h = Number(parts[1]);
      if (h > rang.largeur + EPS) pools.push({ cle: k, pool: ctx.pool[k], hauteur: h });
    });
    return pools;
  }

  function choisirPiece(ctx, rang, c, r, prev, interdits, besoin) {
    var o = ctx.o;
    besoin = besoin || { bout: 'droit', supDebut: 0, supFin: 0, E: 0 };
    var fam = ctx.familles[rang.source];
    var pools = poolsPourRang(ctx, rang);
    var poolExact = pools[0].pool;
    var base = [];
    pools.forEach(function (p) {
      p.pool.forEach(function (it, idx) {
        var Lu = longueurUtilisable(it.L, it.bout || 'droit', besoin.bout, besoin.E);
        if (Lu > EPS) base.push({
          origine: 'chute', L: Lu, Lbrut: it.L, idx: idx, typeId: it.typeId, bout: it.bout || 'droit',
          pool: p.pool, hauteur: p.hauteur
        });
      });
    });
    fam.types.forEach(function (t) {
      base.push({
        origine: ctx.restant[t.id] > 0 ? 'neuve' : 'manquante', L: t.longueur, Lbrut: t.longueur,
        type: t, typeId: t.id, bout: 'droit', pool: poolExact, hauteur: rang.largeur
      });
    });
    function extra(e) { return besoin.supDebut + (e >= r - EPS ? besoin.supFin : 0); }
    var decs = [o.decalageMin, o.decalageMin / 2, 0];
    for (var d = 0; d < decs.length; d++) {
      var best = null;
      for (var i = 0; i < base.length; i++) {
        var ev = evaluer(base[i].L, c, r, prev, decs[d], o, d < 2 ? interdits : [], extra);
        if (!ev) continue;
        var cout = ev.cout + (base[i].origine === 'manquante' ? 1e6 : 0);
        var rip = base[i].hauteur > rang.largeur + EPS ? 1 : 0;
        var k = o.prioriteCoupe === 'longueur'
          ? [base[i].origine === 'manquante' ? 1 : 0, -ev.e, ev.cout, rip, base[i].origine === 'chute' ? 0 : 1]
          : [cout, base[i].origine === 'chute' ? 0 : 1, rip, -ev.e];
        if (!best || comparerCles(k, best.k) < 0) best = { cand: base[i], e: ev.e, k: k };
      }
      if (best) {
        if (d > 0) ctx.decalagesRelaches++;
        return { cand: best.cand, e: best.e, cle: clePool(rang.source, best.cand.hauteur), pool: best.cand.pool, stock: best.e + extra(best.e) };
      }
    }
    var choix = base[0];
    base.forEach(function (b) { if (b.L > choix.L) choix = b; });
    ctx.contraintesRelachees++;
    var eForce = Math.min(choix.L, r);
    return { cand: choix, e: eForce, cle: clePool(rang.source, choix.hauteur), pool: choix.pool, stock: eForce + extra(eForce) };
  }

  function complementBout(code) {
    if (code === '45s') return '45r';
    if (code === '45r') return '45s';
    return 'droit';
  }

  function remplirSegment(ctx, rang, a, b, prev, nouveaux, sortie, interdits, extremites) {
    var o = ctx.o;
    extremites = extremites || { uMin: a, uMax: b, bordDebut: null, bordFin: null, E: 0 };
    var c = a;
    var garde = 0;
    while (b - c > EPS && garde++ < 5000) {
      var r = b - c;
      var auDebut = Math.abs(c - extremites.uMin) < EPS && Math.abs(a - extremites.uMin) < EPS;
      var besoin = {
        bout: auDebut ? (extremites.boutDebut || 'droit') : 'droit',
        supDebut: auDebut ? (extremites.supDebut || 0) : 0,
        supFin: (Math.abs(b - extremites.uMax) < EPS ? (extremites.supFin || 0) : 0),
        E: extremites.E || 0
      };
      var ch = choisirPiece(ctx, rang, c, r, prev, interdits, besoin);
      var cand = ch.cand, e = ch.e;
      var atteintFin = Math.abs(c + e - b) < EPS && Math.abs(b - extremites.uMax) < EPS;
      var stock = e + (auDebut ? besoin.supDebut : 0) + (atteintFin ? besoin.supFin : 0);
      if (cand.origine === 'chute') {
        ch.pool.splice(cand.idx, 1);
      } else {
        ctx.consomme[cand.typeId] = (ctx.consomme[cand.typeId] || 0) + 1;
        if (cand.origine === 'manquante') ctx.manquantes[cand.typeId] = (ctx.manquantes[cand.typeId] || 0) + 1;
        else ctx.restant[cand.typeId]--;
      }
      var boutFin = atteintFin ? complementBout(extremites.boutFin || 'droit') : 'droit';
      var baseReste = (cand.bout && cand.bout !== 'droit' && cand.bout !== besoin.bout) ? (cand.Lbrut - (extremites.E || 0)) : cand.Lbrut;
      if (!(baseReste > 0)) baseReste = cand.L;
      var reste = baseReste - stock;
      if (reste >= o.longueurMinPiece - EPS) ch.pool.push({ L: reste, typeId: cand.typeId, bout: boutFin });
      var bande = (cand.hauteur || rang.largeur) - rang.largeur;
      if (o.sansLanguette && bande > EPS && stock >= o.longueurMinPiece - EPS) {
        var cleBande = clePool(rang.source, bande);
        var poolBande = ctx.pool[cleBande] || (ctx.pool[cleBande] = []);
        poolBande.push({ L: stock, typeId: cand.typeId, bout: 'droit' });
      }
      if (b - (c + e) > EPS) nouveaux.push(c + e);
      var vis = faceVisible(c, e, auDebut, atteintFin, extremites);
      sortie.push({
        u0: vis.u0, u1: vis.u1, longueur: vis.u1 - vis.u0,
        pointeLongue: vis.longue, pointeCourte: vis.courte,
        coupeDebut: auDebut ? (extremites.coupeDebut || 'droite') : 'droite',
        coupeFin: atteintFin ? (extremites.coupeFin || 'droite') : 'droite',
        origine: cand.origine === 'chute' ? 'chute' : 'neuve',
        manquante: cand.origine === 'manquante', typeId: cand.typeId, longueurLame: cand.Lbrut || cand.L,
        coupe: stock < (cand.Lbrut || cand.L) - EPS || vis.longue > vis.courte + EPS || (cand.hauteur || rang.largeur) > rang.largeur + EPS
      });
      c += e;
    }
  }

  function faceVisible(c, e, auDebut, atteintFin, ext) {
    var u0 = c, u1 = c + e;
    var E = ext.E || 0;
    if (auDebut && ext.sensDebut === 'sortant' && ext.coupeDebut === '45') u0 -= E;
    if (auDebut && ext.sensDebut === 'rentrant' && ext.coupeDebut === '45') u0 += E;
    if (atteintFin && ext.sensFin === 'sortant' && ext.coupeFin === '45') u1 += E;
    if (atteintFin && ext.sensFin === 'rentrant' && ext.coupeFin === '45') u1 -= E;
    var dos = e;
    var face = u1 - u0;
    return { u0: u0, u1: u1, longue: Math.max(dos, face), courte: Math.min(dos, face) };
  }

  function bordsActifs(mur) {
    if (!mur.bords) return false;
    return ['gauche', 'droite', 'bas', 'haut'].some(function (k) {
      return mur.bords[k] && mur.bords[k].type && mur.bords[k].type !== 'ras';
    });
  }

  function retraitCoin90(bord, T, E) {
    if (bord && bord.epaisseurRencontre > 0) return bord.epaisseurRencontre;
    var tAutre = (bord && bord.epaisseurLambourdageAutre !== undefined && bord.epaisseurLambourdageAutre !== null)
      ? bord.epaisseurLambourdageAutre
      : (T || 0);
    return tAutre + (E || 0);
  }

  function deltaDos(bord, T, E) {
    if (!bord || bord.type === 'ras') return 0;
    if (bord.type === 'joint') return -(bord.joint || 0);
    var e = E || 0;
    if (bord.sens !== 'sortant') {
      if (bord.coupe === 'arrete') return -retraitCoin90(bord, T, e);
      return 0;
    }
    if (bord.coupe === 'passe') return T + e;
    if (bord.coupe === 'arrete') return -(bord.epaisseurRencontre || 0);
    return T;
  }

  function supplementPointe(bord, E) {
    if (!bord || bord.type !== 'angle' || bord.coupe !== '45' || bord.sens === 'rentrant') return 0;
    return E || 0;
  }

  function codeBout(bord) {
    if (!bord || bord.type !== 'angle' || bord.sens !== 'sortant' || bord.coupe !== '45') return 'droit';
    return '45s';
  }

  function coupeDe(bord) {
    return (bord && bord.type === 'angle' && bord.sens === 'sortant' && bord.coupe === '45') ? '45' : 'droite';
  }

  function libelleBord(bord) {
    if (!bord || bord.type === 'ras') return 'à ras, coupe droite';
    if (bord.type === 'joint') return 'joint de ' + texte(bord.joint) + ' mm, coupe droite';
    var voisin = bord.voisin ? ' avec ' + bord.voisin : '';
    if (bord.sens !== 'sortant') {
      if (bord.coupe === 'arrete') {
        return 'coin à 90°' + voisin + ', cette face s\'arrête contre celle qui va au fond, coupe droite'
          + (bord.origineChoix === 'calcul' ? ', choisi pour utiliser le moins de lames' : '');
      }
      return 'coin à 90°' + voisin + ', cette face va au fond du coin, coupe droite'
        + (bord.origineChoix === 'calcul' ? ', choisi pour utiliser le moins de lames' : '');
    }
    if (bord.coupe === '45' || !bord.coupe) return 'coin à 270°' + voisin + ', coupe à 45°';
    if (bord.coupe === 'passe') return 'coin à 270°' + voisin + ', cette face passe, coupe droite';
    return 'coin à 270°' + voisin + ', cette face s\'arrête, coupe droite';
  }

  function disposerMur(ctx, mur, orientation, cycle) {
    var horiz = orientation === 'horizontal';
    var U = horiz ? mur.largeur : mur.hauteur;
    var V = horiz ? mur.hauteur : mur.largeur;
    var o = ctx.o;
    var actifs = bordsActifs(mur);
    var T = mur.epaisseurSupport || 0;
    function Ede(cle) {
      var ep = ctx.norm.familles[cle].epaisseur;
      return (ep === null || ep === undefined || !isFinite(ep)) ? 0 : ep;
    }
    function bordLong(debut) {
      if (!actifs) return { type: 'ras' };
      return horiz ? (debut ? mur.bords.gauche : mur.bords.droite) : (debut ? mur.bords.bas : mur.bords.haut);
    }
    function bordSpan(debut) {
      if (!actifs) return { type: 'ras' };
      return horiz ? (debut ? mur.bords.bas : mur.bords.haut) : (debut ? mur.bords.gauche : mur.bords.droite);
    }
    var Eref = 0;
    ctx.norm.cles.forEach(function (k) { Eref = Math.max(Eref, Ede(k)); });
    var vDebut, vFin, uMinRef, uMaxRef;
    if (actifs) {
      vDebut = -deltaDos(bordSpan(true), T, Eref);
      vFin = V + deltaDos(bordSpan(false), T, Eref);
      uMinRef = -deltaDos(bordLong(true), T, Eref);
      uMaxRef = U + deltaDos(bordLong(false), T, Eref);
      if (Eref === 0 && [bordLong(true), bordLong(false), bordSpan(true), bordSpan(false)].some(function (b) { return coupeDe(b) === '45'; })) {
        ctx.avert.push('Mur ' + mur.id + ' : coupe à 45° sans épaisseur de lame. Pointe longue et pointe courte restent identiques tant que l\'épaisseur n\'est pas renseignée.');
      }
      if (coupeDe(bordSpan(true)) === '45' || coupeDe(bordSpan(false)) === '45') {
        ctx.avert.push('Mur ' + mur.id + ' : un bord dans la hauteur des rangs est à 45°. Le premier ou le dernier rang est à biseauter sur toute sa longueur.');
      }
    }
    function versUV(ob) {
      return horiz
        ? { u0: ob.x, u1: ob.x + ob.largeur, v0: ob.y, v1: ob.y + ob.hauteur, libelle: ob.libelle }
        : { u0: ob.y, u1: ob.y + ob.hauteur, v0: ob.x, v1: ob.x + ob.largeur, libelle: ob.libelle };
    }
    var ouvertures = mur.obstacles.filter(function (ob) { return ob.type === 'ouverture'; }).map(versUV);
    var trous = mur.obstacles.filter(function (ob) { return ob.type === 'trou'; }).map(versUV);
    var uMin = actifs ? uMinRef : o.margeBord, uMax = actifs ? uMaxRef : U - o.margeBord;
    var rangsPlan = actifs
      ? planifierRangs(V, cycle, ctx.norm, ctx.avert, mur.id, vDebut, vFin)
      : planifierRangs(V, cycle, ctx.norm, ctx.avert, mur.id);
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
          longueur: p.longueur, pointeLongue: p.pointeLongue, pointeCourte: p.pointeCourte,
          coupeDebut: p.coupeDebut || 'droite', coupeFin: p.coupeFin || 'droite',
          coupeGauche: horiz ? (p.coupeDebut || 'droite') : 'droite',
          coupeDroite: horiz ? (p.coupeFin || 'droite') : 'droite',
          coupeBas: horiz ? 'droite' : (p.coupeDebut || 'droite'),
          coupeHaut: horiz ? 'droite' : (p.coupeFin || 'droite'),
          largeurRang: rang.largeur, famille: rang.source, refendu: rang.refendu,
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
      var E = Ede(rang.source);
      var u0 = actifs ? -deltaDos(bordLong(true), T, E) : uMin;
      var u1 = actifs ? U + deltaDos(bordLong(false), T, E) : uMax;
      var ext = {
        uMin: u0, uMax: u1, E: E,
        boutDebut: codeBout(bordLong(true)), boutFin: codeBout(bordLong(false)),
        supDebut: supplementPointe(bordLong(true), E), supFin: supplementPointe(bordLong(false), E),
        coupeDebut: coupeDe(bordLong(true)), coupeFin: coupeDe(bordLong(false)),
        sensDebut: bordLong(true).sens || null, sensFin: bordLong(false).sens || null
      };
      segmentsLibres(rang, ouvertures, u0, u1).forEach(function (s) {
        remplirSegment(ctx, rang, s[0], s[1], prev, nouveaux, brutes, interdits, ext);
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
      epaisseurSupport: T,
      bords: actifs ? {
        gauche: libelleBord(mur.bords.gauche), droite: libelleBord(mur.bords.droite),
        bas: libelleBord(mur.bords.bas), haut: libelleBord(mur.bords.haut)
      } : null,
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
        restantes.push({ famille: fam, largeurRang: largeur, longueur: arrondi(it.L), bout: it.bout || 'droit' });
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

  function copierMurs(murs) {
    return murs.map(function (m) {
      var bords = null;
      if (m.bords) {
        bords = {};
        ['gauche', 'droite', 'bas', 'haut'].forEach(function (n) { bords[n] = Object.assign({}, m.bords[n]); });
      }
      return Object.assign({}, m, { bords: bords });
    });
  }

  function bords90(mur) {
    var out = [];
    if (!mur || !mur.bords) return out;
    ['gauche', 'droite', 'bas', 'haut'].forEach(function (n) {
      var b = mur.bords[n];
      if (b && b.type === 'angle' && b.sens !== 'sortant') out.push(n);
    });
    return out;
  }

  function completerCoinsFixes(murs) {
    var copie = copierMurs(murs);
    var parId = {};
    copie.forEach(function (m) { parId[m.id] = m; });
    var avert = [];
    copie.forEach(function (m) {
      bords90(m).forEach(function (nom) {
        var b = m.bords[nom];
        if (b.coupe !== 'passe' && b.coupe !== 'arrete') return;
        var autre = b.voisin && parId[b.voisin];
        if (!autre) return;
        var candidats = bords90(autre).filter(function (n2) {
          var v = autre.bords[n2].voisin;
          return !v || v === m.id;
        });
        var nom2 = null;
        candidats.forEach(function (n2) { if (autre.bords[n2].voisin === m.id) nom2 = n2; });
        if (!nom2 && candidats.length === 1) nom2 = candidats[0];
        if (!nom2) return;
        var b2 = autre.bords[nom2];
        var voulu = b.coupe === 'passe' ? 'arrete' : 'passe';
        if (b2.coupe === 'auto') {
          b2.coupe = voulu;
          b2.origineChoix = 'calcul';
          if (voulu === 'arrete') b2.epaisseurLambourdageAutre = m.epaisseurSupport || 0;
          if (b.coupe === 'arrete' && !(b.epaisseurLambourdageAutre >= 0 && b.origineChoix === 'calcul')) {
            b.epaisseurLambourdageAutre = autre.epaisseurSupport || 0;
          }
        } else if (b2.coupe === b.coupe) {
          avert.push('Coin à 90° entre ' + m.id + ' et ' + autre.id + ' : les deux faces sont réglées pareil. Une seule doit aller au fond.');
        } else if (b.coupe === 'arrete') {
          b.epaisseurLambourdageAutre = autre.epaisseurSupport || 0;
        }
      });
    });
    return { murs: copie, avert: avert };
  }

  function estCoin90Auto(bord) {
    return bord && bord.type === 'angle' && bord.sens !== 'sortant' && bord.coupe === 'auto';
  }

  function listerCoins(murs) {
    var parId = {};
    murs.forEach(function (m) { parId[m.id] = m; });
    var pris = {};
    var decisions = [];
    murs.forEach(function (m) {
      if (!m.bords) return;
      ['gauche', 'droite', 'bas', 'haut'].forEach(function (nom) {
        var cle = m.id + '/' + nom;
        if (pris[cle] || !estCoin90Auto(m.bords[nom])) return;
        var voisinId = m.bords[nom].voisin;
        var autre = voisinId && parId[voisinId];
        var nom2 = null;
        if (autre && autre.bords) {
          var candidats = [];
          ['gauche', 'droite', 'bas', 'haut'].forEach(function (n2) {
            var b2 = autre.bords[n2];
            if (!estCoin90Auto(b2) || pris[autre.id + '/' + n2]) return;
            if (b2.voisin && b2.voisin !== m.id) return;
            candidats.push(n2);
          });
          candidats.forEach(function (n2) {
            if (autre.bords[n2].voisin === m.id) nom2 = n2;
          });
          if (!nom2 && candidats.length) nom2 = candidats[0];
        }
        if (nom2) {
          pris[cle] = pris[autre.id + '/' + nom2] = true;
          decisions.push({ type: 'paire', a: m.id, ea: nom, b: autre.id, eb: nom2 });
        } else {
          pris[cle] = true;
          decisions.push({ type: 'seule', mur: m.id, bord: nom, voisin: voisinId || '' });
        }
      });
    });
    return decisions;
  }

  function appliquerCoins(murs, decisions, bits) {
    var copie = copierMurs(murs);
    var parId = {};
    copie.forEach(function (m) { parId[m.id] = m; });
    var choix = [];
    var fondLongueur = 0;
    decisions.forEach(function (d, i) {
      var premierAuFond = !bits[i];
      if (d.type === 'paire') {
        var fond = parId[premierAuFond ? d.a : d.b];
        var court = parId[premierAuFond ? d.b : d.a];
        var bordFond = premierAuFond ? d.ea : d.eb;
        var bordCourt = premierAuFond ? d.eb : d.ea;
        fond.bords[bordFond].coupe = 'passe';
        fond.bords[bordFond].origineChoix = 'calcul';
        court.bords[bordCourt].coupe = 'arrete';
        court.bords[bordCourt].origineChoix = 'calcul';
        court.bords[bordCourt].epaisseurLambourdageAutre = fond.epaisseurSupport || 0;
        fondLongueur += fond.largeur;
        choix.push({ auFond: fond.id, plusCourte: court.id, bordFond: bordFond, bordCourt: bordCourt, seule: false });
      } else {
        var mur = parId[d.mur];
        mur.bords[d.bord].coupe = premierAuFond ? 'passe' : 'arrete';
        mur.bords[d.bord].origineChoix = 'calcul';
        if (premierAuFond) fondLongueur += mur.largeur;
        choix.push({
          auFond: premierAuFond ? mur.id : (d.voisin || ''),
          plusCourte: premierAuFond ? (d.voisin || '') : mur.id,
          seule: true, mur: mur.id, bord: d.bord, murAuFond: premierAuFond, voisinConnu: !!d.voisin
        });
      }
    });
    return { murs: copie, choix: choix, fondLongueur: fondLongueur };
  }

  function phraseCoins(choix, pourquoi) {
    if (!choix.length) return [];
    var lignes = [];
    choix.forEach(function (c) {
      if (c.seule) {
        lignes.push('Mur ' + c.mur + ', bord ' + c.bord + ' : '
          + (c.murAuFond ? 'cette face va au fond du coin.' : 'cette face s\'arrête contre l\'autre.')
          + (c.voisinConnu ? '' : ' Le mur voisin n\'est pas dans le calcul.')
          + ' ' + pourquoi);
      } else {
        lignes.push('Coin à 90° entre ' + c.auFond + ' et ' + c.plusCourte + ' : '
          + c.auFond + ' va au fond, ' + c.plusCourte + ' s\'arrête contre elle et perd l\'épaisseur de la lame plus celle du lambourdage. '
          + pourquoi);
      }
    });
    return lignes;
  }

  function calculerFixe(norm, orientation, motif) {
    var cycle = cycleDepuisMotif(norm, motif);
    var orders = [norm.murs.map(function (m) { return m.id; })];
    if (norm.o.ordreMurs === 'auto' && norm.murs.length > 1 && norm.murs.length <= 5) {
      orders = permutations(orders[0]);
    }
    var prepare = completerCoinsFixes(norm.murs);
    var decisions = listerCoins(prepare.murs);
    var k = decisions.length;
    var nAssign = k === 0 ? 1 : (1 << Math.min(k, 8));
    var reduit = nAssign * orders.length > 400;
    var ordresUtiles = reduit ? [orders[0]] : orders;
    var meilleur = null;
    var parBits = {};
    function essayer(bits, ordre) {
      var applique = appliquerCoins(prepare.murs, decisions, bits);
      var avert = norm.avert.concat(prepare.avert);
      var ctx = nouveauContexte(norm, avert);
      var parId = {};
      applique.murs.forEach(function (m) { parId[m.id] = m; });
      var resultats = {};
      ordre.forEach(function (id) {
        resultats[id] = disposerMur(ctx, parId[id], parId[id].orientation || orientation, cycle);
      });
      var murs = norm.murs.map(function (m) { return resultats[m.id]; });
      var syn = synthese(norm, ctx, murs, avert);
      var cle = [syn.total.lamesManquantes, syn.total.surfaceAchetee, syn.total.joints];
      var idBits = bits.join('');
      if (!parBits[idBits] || comparerCles(cle, parBits[idBits]) < 0) parBits[idBits] = cle.slice();
      var candidat = { cle: cle, ordre: ordre, murs: murs, syn: syn, avert: avert, choix: applique.choix, fondLongueur: applique.fondLongueur };
      if (!meilleur) {
        meilleur = candidat;
        return;
      }
      var cmp = comparerCles(cle, meilleur.cle);
      if (cmp < 0 || (cmp === 0 && candidat.fondLongueur > meilleur.fondLongueur)) meilleur = candidat;
    }
    if (k > 8) {
      var bits = [];
      for (var z = 0; z < k; z++) bits.push(0);
      ordresUtiles.forEach(function (ordre) { essayer(bits.slice(), ordre); });
      for (var i = 0; i < k; i++) {
        var garde = meilleur;
        bits[i] = 1;
        ordresUtiles.forEach(function (ordre) { essayer(bits.slice(), ordre); });
        if (meilleur === garde) bits[i] = 0;
      }
    } else {
      for (var a = 0; a < nAssign; a++) {
        var bitsA = [];
        for (var j = 0; j < k; j++) bitsA.push((a >> j) & 1);
        ordresUtiles.forEach(function (ordre) { essayer(bitsA, ordre); });
      }
    }
    var clesBits = Object.keys(parBits).map(function (id) { return parBits[id]; });
    var consoDifferente = clesBits.some(function (c) {
      return c[0] !== clesBits[0][0] || Math.abs(c[1] - clesBits[0][1]) > 1e-6;
    });
    var jointsDifferents = clesBits.some(function (c) { return c[2] !== clesBits[0][2]; });
    var pourquoi = consoDifferente
      ? 'Ce sens est celui qui ouvre le moins de lames.'
      : (jointsDifferents
        ? 'Les deux sens ouvrent le même nombre de lames. Celui-ci demande moins de coupes.'
        : 'Les deux sens ouvrent le même nombre de lames. La face la plus longue va au fond. À longueur égale, c\'est la première de la liste.');
    phraseCoins(meilleur.choix, pourquoi).forEach(function (ligne) {
      if (meilleur.avert.indexOf(ligne) < 0) meilleur.avert.push(ligne);
    });
    function refLisible(cle) {
      var w = norm.familles[cle].largeurUtile;
      var memes = norm.cles.filter(function (k) { return Math.abs(norm.familles[k].largeurUtile - w) < EPS; });
      return memes.length === 1 ? w : cle;
    }
    var optionsRetenues = { orientation: orientation, motif: motif.motif, prioriteCoupe: norm.o.prioriteCoupe };
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
      var signature = JSON.stringify(res.murs.map(function (m) {
        return [m.id, m.orientation, m.pieces.map(function (p) {
          return [p.rang, p.typeId, arrondi(p.x), arrondi(p.y), arrondi(p.w), arrondi(p.h)];
        })];
      }));
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
      L.push('Mur ' + m.id + ' (support ' + texte(m.largeur) + ' x ' + texte(m.hauteur) + ' mm, ' + m.orientation + ') : '
        + m.stats.rangs + ' rangs, ' + m.stats.pieces + ' pièces, ' + m.stats.joints + ' joints, '
        + texte(Math.round(m.stats.surfaceARevetir * 100) / 100) + ' m2 à revêtir.');
      if (m.bords) {
        if (m.epaisseurSupport) L.push('Support derrière les lames : ' + texte(m.epaisseurSupport) + ' mm.');
        L.push('Bords : gauche, ' + m.bords.gauche + '. Droite, ' + m.bords.droite + '. Bas, ' + m.bords.bas + '. Haut, ' + m.bords.haut + '.');
      }
      var biseaux = m.pieces.filter(function (p) {
        return p.pointeLongue && p.pointeCourte && Math.abs(p.pointeLongue - p.pointeCourte) > 0.5;
      });
      if (biseaux.length) {
        L.push('Pièces à 45° (pointe longue / pointe courte, mm) : ' + biseaux.map(function (p) {
          return 'rang ' + p.rang + ' n°' + p.index + ' ' + texte(arrondi(p.pointeLongue)) + '/' + texte(arrondi(p.pointeCourte));
        }).join(' ; ') + '.');
      }
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
