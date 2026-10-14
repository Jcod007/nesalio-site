/* =====================================================================
   nesa.js — Nesa, la mascotte de Nesalio.

   Une seule forme pleine, violet Nesalio, avec deux yeux blancs en gélule.
   Au repos c'est un cube arrondi ; selon ce que fait le tuteur, la forme
   se transforme : stylo qui trace au tableau, point d'interrogation,
   ampoule, étoile, ondes quand elle parle ou écoute.

   Principes (inspirés du moteur MIT « bloub », code écrit pour Nesalio) :
   - chaque silhouette est un profil radial échantillonné aux mêmes angles,
     donc une transformation = une simple interpolation des rayons ;
   - les yeux sont posés sur une sphère : quand la tête tourne, l'œil du
     bord se compresse, ce qui donne le volume ;
   - le rendu est une fonction pure du temps (clignements pré-tirés,
     dérive du regard en sinus), donc rejouable image par image.

   Usage :
     <script src="/nesa.js" defer></script>
     <nesa-mascot state="repos" size="160"></nesa-mascot>
     el.state = 'stylo';
   ===================================================================== */
(function(){
  'use strict';

  var COLOR = '#5A45D6';
  var N = 180, TAU = Math.PI * 2, R = 112, C = 200;

  /* ---------- utilitaires ---------- */
  function clamp(x, a, b){ return x < a ? a : x > b ? b : x; }
  function lerp(a, b, k){ return a + (b - a) * k; }
  function smooth(x){ x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function outBack(x){ x = clamp(x, 0, 1); var c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function rad(d){ return d * Math.PI / 180; }
  function rng(seed){ return function(){ seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- géométrie : profils radiaux ---------- */
  function circlePts(cx, cy, r, n){ var p = []; for(var i = 0; i < n; i++){ var a = i / n * TAU; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
  function hull(pts){
    pts = pts.slice().sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b){ return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for(i = 0; i < pts.length; i++){ while(lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for(i = pts.length - 1; i >= 0; i--){ while(up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function hullOfCircles(list){ var p = []; list.forEach(function(c){ p = p.concat(circlePts(c[0], c[1], c[2], 64)); }); return hull(p); }
  function rotPts(pts, deg){ var c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return pts.map(function(p){ return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }); }
  function rotPt(p, deg){ return rotPts([p], deg)[0]; }
  // Rayon de la silhouette dans chaque direction, vu depuis l'origine.
  function profile(poly){
    var r = new Array(N);
    for(var i = 0; i < N; i++){
      var th = i / N * TAU, dx = Math.cos(th), dy = Math.sin(th), best = 0;
      for(var j = 0; j < poly.length; j++){
        var p = poly[j], q = poly[(j + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1];
        var det = ex * dy - dx * ey; if(Math.abs(det) < 1e-12) continue;
        var t = (ex * p[1] - p[0] * ey) / det, u = (dx * p[1] - dy * p[0]) / det;
        if(u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
      }
      r[i] = best;
    }
    return r;
  }
  function soften(r, passes){ for(var k = 0; k < passes; k++){ var o = new Array(N); for(var i = 0; i < N; i++) o[i] = (r[(i + N - 1) % N] + 2 * r[i] + r[(i + 1) % N]) / 4; r = o; } return r; }
  function scaleR(r, s){ return r.map(function(x){ return x * s; }); }
  function constR(v){ var r = new Array(N); for(var i = 0; i < N; i++) r[i] = v; return r; }

  /* ---------- silhouettes ---------- */
  // Cube arrondi : hexagone pointe en haut, coins très adoucis.
  var HEX_PTS = []; for(var h = 0; h < 6; h++){ var a6 = rad(-90 + 60 * h); HEX_PTS.push([.8 * Math.cos(a6), .8 * Math.sin(a6), .3]); }
  var HEX = profile(hullOfCircles(HEX_PTS));
  var PEN_TILT = 38;
  var PEN = profile(rotPts(hullOfCircles([[0, -.95, .22], [0, .38, .22], [0, 1.0, .035]]), PEN_TILT));
  var PEN_TIP = rotPt([0, 1.035], PEN_TILT);
  var BULB = profile(hullOfCircles([[0, -.2, .8], [0, .62, .34]]));
  var STAR = (function(){ var p = []; for(var i = 0; i < 10; i++){ var a = rad(-90 + 36 * i), rr = i % 2 ? .6 : 1.2; p.push([rr * Math.cos(a), rr * Math.sin(a)]); } return soften(profile(p), 5); })();
  var DOT = constR(.46);

  /* ---------- tracés de décor (en unités de rayon) ---------- */
  function arcPts(cx, cy, r, a0, a1, n){ var p = []; n = n || 24; for(var i = 0; i <= n; i++){ var a = rad(lerp(a0, a1, i / n)); p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
  function line(x0, y0, x1, y1){ return [[x0, y0], [x1, y1]]; }
  function sparkPts(cx, cy, r){ var p = []; for(var i = 0; i < 8; i++){ var a = rad(-90 + 45 * i), rr = i % 2 ? r * .32 : r; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return p; }
  // Point d'interrogation : le crochet (le point, c'est le corps avec les yeux)
  var HOOK = (function(){
    var p = arcPts(0, -.6, .48, 180, 395, 30), end = p[p.length - 1];
    for(var i = 1; i <= 10; i++){ var k = i / 10; p.push([lerp(end[0], .03, k) + .12 * Math.sin(k * Math.PI), lerp(end[1], .06, k)]); }
    p.push([.03, .2]); return p;
  })();
  // Parabole tracée par le stylo : y = x², sur le tableau
  function curveAt(u){ var x = -1.35 + 1.8 * u, X = (x + .45) / .9; return [x, 1.3 - .6 * X * X]; }
  var CURVE = []; for(var cu = 0; cu <= 40; cu++) CURVE.push(curveAt(cu / 40));

  /* ---------- poses ---------- */
  function face(o){ var f = {x:0, y:.12, s:1, yaw:4, pitch:2, roll:0, split:21, ew:.25, eh:.5, openL:1, openR:1, smileL:0, smileR:0, wander:1}; for(var k in o) f[k] = o[k]; return f; }
  function pose(o){ var p = {r:HEX, cx:0, cy:0, sx:1, sy:1, rot:0, shadow:1, face:face(), decor:{}}; for(var k in o) p[k] = o[k]; return p; }
  function D(kind, pts, w, draw, a){ return {kind:kind, pts:pts, w:w, draw:draw === undefined ? 1 : draw, a:a === undefined ? 1 : a}; }
  function HI(cx, k){ cx = cx || 0; k = k || 1; return D('hi', [[cx - .42 * k, -.66 * k], [cx, -.9 * k], [cx + .42 * k, -.66 * k]], .055, 1, 1); }

  var STATES = {
    repos: {name:'Repos', pose:function(){ return pose({decor:{hi:HI()}}); }},

    ecoute: {name:'Écoute', pose:function(t){
      var d = {hi:HI(.3, .84)};
      for(var i = 0; i < 3; i++){ var ph = (t * .75 + i / 3) % 1, rr = 1.85 - .75 * ph; d['w' + i] = D('line', arcPts(.3, 0, rr, 150, 210, 16), .11, 1, Math.sin(ph * Math.PI)); }
      return pose({r:scaleR(HEX, .84), cx:.3, decor:d, face:face({x:.3, y:.1, s:.88, yaw:-16, pitch:4, eh:.54, ew:.27, wander:.5})});
    }},

    parle: {name:'Parle', pose:function(t){
      var d = {hi:HI(-.3, .84)};
      for(var i = 0; i < 3; i++){ var ph = (t * .9 + i / 3) % 1, rr = 1.0 + .8 * ph; d['w' + i] = D('line', arcPts(-.3, 0, rr, -30, 30, 16), .11, 1, Math.sin(ph * Math.PI)); }
      var talk = Math.max(0, Math.sin(t * 13) * .6 + Math.sin(t * 7.7) * .4);
      return pose({r:scaleR(HEX, .84), cx:-.3, sy:1 + .05 * talk, sx:1 - .02 * talk, decor:d, face:face({x:-.3, y:.1, s:.88, yaw:12, wander:.6})});
    }},

    reflechit: {name:'Réfléchit', pose:function(t){
      return pose({r:DOT, cx:0, cy:.82, rot:4 * Math.sin(t * 1.6), shadow:.7,
        decor:{hook:D('line', HOOK, .3, smooth(t / .55), 1)},
        face:face({x:0, y:.82, s:.6, yaw:-10 + 6 * Math.sin(t * .9), pitch:16, eh:.34, wander:.4})});
    }},

    stylo: {name:'Écrit au tableau', pose:function(t){
      var L = 3.4, tt = t % L, u, lift = 0, fade = 1, axes = smooth(tt / .35);
      if(tt < .35){ u = 0; lift = .14 * (1 - smooth(tt / .35)); }
      else if(tt < 2.15){ u = smooth((tt - .35) / 1.8); }
      else if(tt < 2.7){ u = 1; }
      else { var k = smooth((tt - 2.7) / .7); u = 1 - k; lift = .16 * Math.sin(k * Math.PI); fade = 1 - smooth((tt - 2.7) / .35); axes = fade; }
      var tip = curveAt(u), s = .82;
      var cx = tip[0] - PEN_TIP[0] * s, cy = tip[1] - lift - PEN_TIP[1] * s;
      var band = rotPts([[-.24, .38], [.24, .38]], PEN_TILT).map(function(p){ return [cx + p[0] * s, cy + p[1] * s]; });
      var fc = rotPt([0, -.45], PEN_TILT);
      var drawn = tt < 2.7 ? u : 1;
      return pose({r:scaleR(PEN, s), cx:cx, cy:cy, shadow:0,
        decor:{
          ax:D('axis', line(-1.55, 1.42, .6, 1.42), .035, axes, .35),
          ay:D('axis', line(-.45, 1.55, -.45, .5), .035, axes, .35),
          curve:D('line', CURVE, .085, drawn, fade),
          band:D('hi', band, .06, 1, 1)
        },
        face:face({x:cx + fc[0] * s, y:cy + fc[1] * s, s:.5, split:15, ew:.27, yaw:-8, pitch:-14, eh:.46, roll:-6, wander:.25})});
    }},

    idee: {name:'Idée !', pose:function(t){
      var pop = outBack(t / .5), d = {
        b1:D('line', line(-.24, .95, .24, .95), .12, 1, 1),
        b2:D('line', line(-.15, 1.13, .15, 1.13), .12, 1, 1)
      };
      [-150, -115, -90, -65, -30].forEach(function(a, i){
        var k = smooth((t - .25 - i * .05) / .3), pulse = .8 + .2 * Math.sin(t * 5 + i);
        var c = Math.cos(rad(a)), s = Math.sin(rad(a));
        d['r' + i] = D('line', [[c * 1.08, -.32 + s * 1.08], [c * (1.08 + .26 * pulse), -.32 + s * (1.08 + .26 * pulse)]], .1, k, k);
      });
      return pose({r:BULB, cy:-.12, sy:.9 + .1 * pop, sx:1.05 - .05 * pop, decor:d,
        face:face({x:0, y:-.3, s:.92, pitch:8, eh:.54, ew:.27, wander:.5})});
    }},

    bravo: {name:'Bravo !', pose:function(t){
      var ph = (t % 1.3) / 1.3, jump = Math.sin(clamp(ph / .55, 0, 1) * Math.PI);
      var sq = ph > .55 ? Math.sin(clamp((ph - .55) / .25, 0, 1) * Math.PI) : 0;
      var d = {};
      [[1.3, -1.0, .2], [-1.3, -.7, .13], [1.25, .7, .11]].forEach(function(s, i){
        var k = .75 + .25 * Math.sin(t * 6 + i * 2); d['s' + i] = D('spark', sparkPts(s[0], s[1] - .1 * jump, s[2] * k), 0, 1, smooth(t / .3));
      });
      return pose({r:STAR, cy:-.22 * jump, sy:1 - .08 * sq, sx:1 + .06 * sq, rot:8 * Math.sin(t * 2.4), shadow:1 - .4 * jump, decor:d,
        face:face({y:.1 - .22 * jump, s:.86, eh:.36, smileL:1, smileR:1, pitch:6, wander:.4})});
    }},

    content: {name:'Content', pose:function(t){
      var b = Math.abs(Math.sin(t * 2.6));
      return pose({cy:-.05 * b, shadow:1 - .2 * b, decor:{hi:HI()}, face:face({y:.12 - .05 * b, smileL:1, smileR:1, pitch:4})});
    }},

    clin: {name:"Clin d'œil", pose:function(){
      return pose({rot:-3, decor:{hi:HI()}, face:face({openR:.06, smileL:1, roll:-5, yaw:8})});
    }}
  };
  var ORDER = ['repos', 'ecoute', 'parle', 'reflechit', 'stylo', 'idee', 'bravo', 'content', 'clin'];

  /* ---------- mélange de deux poses ---------- */
  function mix(a, b, k){
    if(k >= 1) return b; if(k <= 0) return a;
    var r = new Array(N); for(var i = 0; i < N; i++) r[i] = lerp(a.r[i], b.r[i], k);
    var f = {}; for(var key in b.face) f[key] = lerp(a.face[key], b.face[key], k);
    var d = {}, id;
    for(id in b.decor){
      var db = b.decor[id], da = a.decor[id];
      if(da && da.pts.length === db.pts.length){
        d[id] = {kind:db.kind, w:lerp(da.w, db.w, k), draw:lerp(da.draw, db.draw, k), a:lerp(da.a, db.a, k),
                 pts:db.pts.map(function(p, j){ return [lerp(da.pts[j][0], p[0], k), lerp(da.pts[j][1], p[1], k)]; })};
      } else d[id] = {kind:db.kind, w:db.w, draw:db.draw, a:db.a * k, pts:db.pts};
    }
    for(id in a.decor) if(!b.decor[id]){ var x = a.decor[id]; d[id] = {kind:x.kind, w:x.w, draw:x.draw, a:x.a * (1 - k), pts:x.pts}; }
    return {r:r, cx:lerp(a.cx, b.cx, k), cy:lerp(a.cy, b.cy, k), sx:lerp(a.sx, b.sx, k), sy:lerp(a.sy, b.sy, k),
            rot:lerp(a.rot, b.rot, k), shadow:lerp(a.shadow, b.shadow, k), face:f, decor:d};
  }
  var MORPH = .45, TAU_E = .09;
  function morphK(dt){ return dt <= 0 ? 0 : dt >= MORPH ? 1 : (1 - Math.exp(-dt / TAU_E)) / (1 - Math.exp(-MORPH / TAU_E)); }
  function statePose(key, local){ return (STATES[key] || STATES.repos).pose(Math.max(0, local)); }

  /* ---------- vie : clignements, regard, respiration ---------- */
  var BLINKS = (function(){ var r = rng(20261014), out = [], t = 1.2; while(t < 1200){ out.push(t); t += 2 + r() * 2.6; if(r() < .2){ out.push(t); t += .26; } } return out; })();
  function lid(t){
    if(t < BLINKS[0]) return 1;
    var lo = 0, hi = BLINKS.length - 1;
    while(lo < hi){ var m = (lo + hi + 1) >> 1; if(BLINKS[m] <= t) lo = m; else hi = m - 1; }
    var k = (t - BLINKS[lo]) / .17; if(k < 0 || k > 1) return 1;
    return k < .45 ? 1 - k / .45 : (k - .45) / .55;
  }
  function live(p, t, opt){
    opt = opt || {};
    var q = {}; for(var k in p) q[k] = p[k];
    var f = {}; for(var j in p.face) f[j] = p.face[j];
    var w = opt.still ? 0 : f.wander;
    f.yaw += (Math.sin(t * .53 + .4) * 6 + Math.sin(t * 1.37 + 2.1) * 2) * w;
    f.pitch += (Math.sin(t * .71 + 1.3) * 3.5 + Math.sin(t * 1.9 + .7) * 1.2) * w;
    if(!opt.still){ var l = .06 + .94 * lid(t); f.openL *= l; f.openR *= l; q.sy = p.sy * (1 + .008 * Math.sin(t * 1.85)); }
    q.face = f; return q;
  }

  /* ---------- rendu SVG ---------- */
  function n2(v){ return Math.round(v * 10) / 10; }
  function X(x){ return n2(C + x * R); } function Y(y){ return n2(C + y * R); }
  function ptsPath(pts){ return pts.map(function(p, i){ return (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1]); }).join(''); }
  var uid = 0;
  function svg(p, o){
    o = o || {}; var id = 'nesa' + (++uid).toString(36), size = o.size || 400;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="' + size + '" height="' + size + '">';
    if(o.bg) s += '<rect width="400" height="400" fill="' + o.bg + '"/>';
    if(o.grid){ s += '<g stroke="' + (o.gridColor || '#E3E8F3') + '" stroke-width="1">'; for(var g = 20; g < 400; g += 20) s += '<path d="M' + g + ' 0V400M0 ' + g + 'H400"/>'; s += '</g>'; }
    var body = '';
    for(var i = 0; i < N; i++){ var th = i / N * TAU, rr = p.r[i]; body += (i ? 'L' : 'M') + X(p.cx + rr * Math.cos(th) * p.sx) + ' ' + Y(p.cy + rr * Math.sin(th) * p.sy); }
    body += 'Z';
    if(p.shadow > .01) s += '<ellipse cx="200" cy="' + Y(1.42) + '" rx="' + n2(.72 * R * (.7 + .3 * p.shadow)) + '" ry="' + n2(.07 * R) + '" fill="#18223A" opacity="' + Math.round(10 * p.shadow) / 100 + '"/>';
    s += '<defs><clipPath id="' + id + '"><path d="' + body + '"/></clipPath></defs>';
    s += '<g transform="rotate(' + n2(p.rot) + ' 200 ' + Y(1.25) + ')">';
    var top = '';
    for(var key in p.decor){
      var d = p.decor[key]; if(d.a < .01 || d.draw < .005) continue;
      var op = Math.round(d.a * 100) / 100;
      if(d.kind === 'spark'){ s += '<path d="' + ptsPath(d.pts) + 'Z" fill="' + COLOR + '" opacity="' + op + '"/>'; continue; }
      var hi = d.kind === 'hi', col = hi ? '#FFFFFF' : COLOR, a2 = hi ? op * .32 : op;
      var el = '<path d="' + ptsPath(d.pts) + '" fill="none" stroke="' + col + '" stroke-width="' + n2(d.w * R) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + (Math.round(a2 * 100) / 100) + '"' +
        (d.draw < .999 ? ' pathLength="1" stroke-dasharray="' + (Math.round(d.draw * 1000) / 1000) + ' 2"' : '') + '/>';
      if(hi) top += el; else s += el;
    }
    s += '<path d="' + body + '" fill="' + COLOR + '"/>';
    s += top;
    var f = p.face;
    s += '<g clip-path="url(#' + id + ')"><g transform="rotate(' + n2(f.roll) + ' ' + X(f.x) + ' ' + Y(f.y) + ')">';
    [-1, 1].forEach(function(side){
      var a = rad(f.yaw + side * f.split), pz = rad(f.pitch);
      var ex = f.x + Math.sin(a) * .92 * f.s, ey = f.y - Math.sin(pz) * .55 * f.s;
      var w = f.ew * f.s * Math.max(.25, Math.cos(a)), open = side < 0 ? f.openL : f.openR, smile = side < 0 ? f.smileL : f.smileR;
      var hFull = f.eh * f.s * Math.cos(pz), h = Math.max(w * .55, hFull * clamp(open, 0, 1));
      if(open < .3) h = Math.max(.025 * f.s, hFull * open);
      var rx = Math.min(w, h) / 2;
      var sm = clamp(smile, 0, 1), ro = open > .3 ? 1 - sm : 1;
      if(ro > .01) s += '<rect x="' + X(ex - w / 2) + '" y="' + Y(ey - h / 2) + '" width="' + n2(w * R) + '" height="' + n2(h * R) + '" rx="' + n2(rx * R) + '" fill="#FFFFFF"' + (ro < .99 ? ' opacity="' + Math.round(ro * 100) / 100 + '"' : '') + '/>';
      if(sm > .01 && open > .3){
        // œil rieur : un arc en accent circonflexe
        var aw = Math.max(w, f.ew * f.s * .8) * .95, ah = hFull * .32;
        s += '<path d="M' + X(ex - aw) + ' ' + Y(ey + ah * .45) + 'Q' + X(ex) + ' ' + Y(ey - ah * 1.6) + ' ' + X(ex + aw) + ' ' + Y(ey + ah * .45) + '" fill="none" stroke="#FFFFFF" stroke-width="' + n2(f.ew * f.s * .62 * R) + '" stroke-linecap="round" opacity="' + Math.round(sm * 100) / 100 + '"/>';
      }
    });
    s += '</g></g></g>';
    return s + '</svg>';
  }

  /* ---------- une suite d'états (fonction pure du temps) ---------- */
  function seqDuration(seq){ return seq.reduce(function(a, b){ return a + b[1]; }, 0); }
  function sampleSeq(seq, t){
    var total = seqDuration(seq), tt = ((t % total) + total) % total, acc = 0;
    for(var i = 0; i < seq.length; i++){
      if(tt < acc + seq[i][1] || i === seq.length - 1){
        var prev = seq[(i - 1 + seq.length) % seq.length], local = tt - acc;
        var from = statePose(prev[0], prev[1]);
        return {pose:mix(from, statePose(seq[i][0], local), morphK(local)), index:i, key:seq[i][0]};
      }
      acc += seq[i][1];
    }
  }
  var SEANCE = [['repos', 1.6], ['ecoute', 2.4], ['reflechit', 2], ['stylo', 3.4], ['parle', 2.4], ['idee', 2], ['bravo', 2.6], ['content', 1.4]];

  /* ---------- moteur pour un affichage vivant ---------- */
  function Engine(key){ this.key = STATES[key] ? key : 'repos'; this.at = 0; this.from = null; }
  Engine.prototype.set = function(key, t){
    if(!STATES[key] || key === this.key) return;
    this.from = this.base(t); this.key = key; this.at = t;
  };
  Engine.prototype.base = function(t){
    var cur = statePose(this.key, t - this.at);
    return this.from ? mix(this.from, cur, morphK(t - this.at)) : cur;
  };
  Engine.prototype.sample = function(t, opt){ return live(this.base(t), t, opt); };

  /* ---------- composant <nesa-mascot> ---------- */
  var hasWin = typeof window !== 'undefined';
  var reduce = hasWin && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(hasWin && window.customElements && !customElements.get('nesa-mascot')){
    var El = function(){ return Reflect.construct(HTMLElement, [], El); };
    El.prototype = Object.create(HTMLElement.prototype); El.prototype.constructor = El; Object.setPrototypeOf(El, HTMLElement);
    El.observedAttributes = ['state', 'size'];
    var P = El.prototype;
    P.now = function(){ return (performance.now() - this._t0) / 1000; };
    P.connectedCallback = function(){
      var self = this;
      this._t0 = performance.now(); this._eng = new Engine(this.getAttribute('state')); this._vis = true;
      if(!this.hasAttribute('role')) this.setAttribute('role', 'img');
      this._label();
      this.style.display = this.style.display || 'inline-block'; this.style.lineHeight = '0';
      if('IntersectionObserver' in window){ this._io = new IntersectionObserver(function(es){ self._vis = es[0].isIntersecting; self._loop(); }); this._io.observe(this); }
      this._loop();
    };
    P.disconnectedCallback = function(){ if(this._io) this._io.disconnect(); cancelAnimationFrame(this._raf); this._raf = 0; };
    P.attributeChangedCallback = function(name, o, v){
      if(!this._eng) return;
      if(name === 'state'){ this._eng.set(v, this.now()); this._label(); }
      this._paint(); this._loop();
    };
    Object.defineProperty(P, 'state', {get:function(){ return this.getAttribute('state') || 'repos'; }, set:function(v){ this.setAttribute('state', v); }});
    P._label = function(){ var s = STATES[this.getAttribute('state')] || STATES.repos; this.setAttribute('aria-label', 'Nesa, la mascotte de Nesalio : ' + s.name.toLowerCase()); };
    P._paint = function(){ this.innerHTML = svg(this._eng.sample(this.now(), {still:reduce}), {size:+this.getAttribute('size') || 160}); };
    P._loop = function(){
      var self = this; if(this._raf) return;
      var step = function(){
        self._raf = 0; if(!self.isConnected) return;
        self._paint();
        if(self._vis && !document.hidden && (!reduce || self.now() - self._eng.at < MORPH + .1)) self._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) document.querySelectorAll('nesa-mascot').forEach(function(el){ if(el._loop) el._loop(); }); });
    customElements.define('nesa-mascot', El);
  }

  var api = {COLOR:COLOR, STATES:STATES, ORDER:ORDER, SEANCE:SEANCE, Engine:Engine, statePose:statePose, mix:mix, live:live,
             sampleSeq:sampleSeq, seqDuration:seqDuration, svg:svg, morph:MORPH};
  if(hasWin) window.Nesa = api;
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
