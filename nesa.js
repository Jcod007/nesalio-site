/* =====================================================================
   nesa.js — Nesa, la mascotte officielle de Nesalio.
   Une seule mascotte, une seule identité : le cube aux couleurs du logo,
   visage sur la face de droite. Ce fichier contient :
   - le moteur (expressions, transitions, vie : clignement, regard, respiration) ;
   - le composant <nesa-mascot state="ecoute"> à poser dans le site ou l'outil.
   Usage : <script src="/nesa.js" defer></script>
           <nesa-mascot state="repos" size="120"></nesa-mascot>
           document.querySelector('nesa-mascot').state = 'reflechit';
   ===================================================================== */
(function(){
  'use strict';

  /* ---------- Identité (fixe) ---------- */
  var PALETTES = {
    marque:  {name:'Officielle',  top:'#5A45D6', left:'#2E6BE6', right:'#23936A', feat:'#FFFFFF', accent:'#F2A65A', ink:'#18223A'},
    encre:   {name:'Une couleur', top:'#18223A', left:'#3A4766', right:'#56617A', feat:'#FFFFFF', accent:'#18223A', ink:'#18223A'}
  };
  var BGS = {
    transparent:{name:'Transparent', fill:null},
    papier:{name:'Papier', fill:'#F6F8FC', grid:true},
    blanc:{name:'Blanc', fill:'#FFFFFF'},
    violet:{name:'Violet doux', fill:'#EEEAFF'},
    nuit:{name:'Nuit', fill:'#18223A'}
  };

  /* ---------- Expressions ---------- */
  var BASE = {eyeW:1, eyeH:1, eyeL:1, eyeR:1, gx:0, gy:0, arc:0, curve:9, open:0, sx:1, sy:1, bob:0, tilt:0, q:0, spark:0, wave:0};
  function S(o){ var r = {}; for(var k in BASE) r[k] = BASE[k]; for(var j in o) r[j] = o[j]; return r; }
  var STATES = {
    repos:     {name:'Repos',      p:S({})},
    ecoute:    {name:'Écoute',     p:S({eyeH:1.12, gy:-1, curve:6, tilt:-3, sx:.98, sy:1.02})},
    reflechit: {name:'Réfléchit',  p:S({gx:4, gy:-8, eyeH:.85, curve:0, tilt:4, q:1})},
    explique:  {name:'Explique',   p:S({open:.9, curve:4, wave:1, bob:-6})},
    concentre: {name:'Concentré',  p:S({eyeH:.55, gy:2, curve:2, sx:1.02, sy:.98})},
    content:   {name:'Content',    p:S({arc:1, curve:12})},
    bravo:     {name:'Bravo !',    p:S({arc:1, open:.7, curve:14, spark:1, bob:-16, sx:.97, sy:1.05})},
    surpris:   {name:'Surpris',    p:S({eyeH:1.3, eyeW:1.1, open:.6, curve:0, sx:.96, sy:1.06, bob:-6})},
    clin:      {name:"Clin d'œil", p:S({eyeR:.12, curve:12, tilt:-4})}
  };
  var ORDER = ['repos','ecoute','reflechit','explique','concentre','content','bravo','surpris','clin'];

  /* ---------- Moteur (fonctions pures) ---------- */
  function lerp(a, b, k){ var r = {}; for(var key in a) r[key] = a[key] + (b[key] - a[key]) * k; return r; }
  function ease(dt, tau){ return dt <= 0 ? 0 : 1 - Math.exp(-dt / tau); }
  function tlDuration(tl){ return tl.reduce(function(s, x){ return s + x[1]; }, 0); }
  // Paramètres de la ligne de temps à l'instant t (en boucle)
  function sampleTimeline(tl, t, tau){
    var total = tlDuration(tl), tt = ((t % total) + total) % total, acc = 0;
    for(var i = 0; i < tl.length; i++){
      if(tt < acc + tl[i][1] || i === tl.length - 1){
        var prev = STATES[tl[(i - 1 + tl.length) % tl.length][0]].p, cur = STATES[tl[i][0]].p;
        return {p:lerp(prev, cur, ease(tt - acc, tau)), index:i};
      }
      acc += tl[i][1];
    }
  }
  // Vie : clignement, regard, respiration — tous déterministes en t
  function life(p, t, opt){
    var q = {}; for(var k in p) q[k] = p[k];
    if(opt.blink){
      var period = 3.6, ph = (t + 1.3) % period, d = .16, b = 0;
      if(ph < d) b = 1 - Math.abs(ph / d * 2 - 1);
      if(((t + 1.3) / period | 0) % 4 === 2){ var ph2 = ph - .32; if(ph2 > 0 && ph2 < d) b = Math.max(b, 1 - Math.abs(ph2 / d * 2 - 1)); }
      var m = 1 - .9 * b; q.eyeL *= m; q.eyeR *= m;
    }
    if(opt.gaze){ q.gx += 1.6 * Math.sin(t * .83) + .7 * Math.sin(t * 2.1 + 1); q.gy += 1.1 * Math.sin(t * .61 + 2); }
    if(opt.breath){ var br = Math.sin(t * 2.2); q.sy *= 1 + .012 * br; q.sx *= 1 - .006 * br; }
    return q;
  }

  /* ---------- Rendu SVG ---------- */
  function f(n){ return (Math.round(n * 100) / 100).toString(); }
  function render(p, o){
    o = o || {}; var pal = PALETTES[o.palette] || PALETTES.marque, bg = BGS[o.bg] || BGS.transparent, right = o.side !== 'gauche', props = o.props !== false;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="' + (o.size || 400) + '" height="' + (o.size || 400) + '">';
    if(bg.fill){
      s += '<rect width="400" height="400" fill="' + bg.fill + '"/>';
      if(bg.grid){ s += '<g stroke="#DFE6F3" stroke-width="1">'; for(var g = 20; g < 400; g += 20){ s += '<path d="M' + g + ' 0V400M0 ' + g + 'H400"/>'; } s += '</g>'; }
    }
    // ombre
    var sh = 1 + p.bob / 60;
    s += '<ellipse cx="200" cy="364" rx="' + f(96 * sh) + '" ry="' + f(10 * sh) + '" fill="' + (o.bg === 'nuit' ? '#000' : '#18223A') + '" opacity="' + f(.1 * sh) + '"/>';
    // corps : pivot en bas du cube
    s += '<g transform="translate(200 ' + f(346 + p.bob) + ') rotate(' + f(p.tilt) + ') scale(' + f(p.sx) + ' ' + f(p.sy) + ') translate(-200 -346)">';
    s += '<path d="M200 70 L320 139 L200 208 L80 139 Z" fill="' + pal.top + '" stroke="' + pal.top + '" stroke-width="26" stroke-linejoin="round"/>';
    s += '<path d="M80 139 L200 208 L200 346 L80 277 Z" fill="' + pal.left + '" stroke="' + pal.left + '" stroke-width="26" stroke-linejoin="round"/>';
    s += '<path d="M200 208 L320 139 L320 277 L200 346 Z" fill="' + pal.right + '" stroke="' + pal.right + '" stroke-width="26" stroke-linejoin="round"/>';
    s += '<path d="M146 112 L200 82 L254 112" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity=".3"/>';
    // visage sur une face
    var dir = right ? 1 : -1;
    s += '<g transform="' + (right ? 'translate(260 246) skewY(-30)' : 'translate(140 246) skewY(30)') + '">';
    var gx = p.gx * dir, w = 17 * p.eyeW;
    [[-22.5, p.eyeL], [22.5, p.eyeR]].forEach(function(e){
      var cx = e[0] + gx, h = Math.max(2.5, 27 * p.eyeH * e[1]), cy = -.5 + p.gy;
      var ro = 1 - Math.min(1, Math.max(0, p.arc));
      if(ro > .02) s += '<rect x="' + f(cx - w / 2) + '" y="' + f(cy - h / 2) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(Math.min(w, h) / 2) + '" fill="' + pal.feat + '" opacity="' + f(ro) + '"/>';
      if(p.arc > .02) s += '<path d="M' + f(cx - 10) + ' ' + f(cy + 4) + ' Q ' + f(cx) + ' ' + f(cy - 12) + ' ' + f(cx + 10) + ' ' + f(cy + 4) + '" fill="none" stroke="' + pal.feat + '" stroke-width="6" stroke-linecap="round" opacity="' + f(Math.min(1, p.arc)) + '"/>';
    });
    // bouche
    var mx = 2 + gx * .4, my = 32 + p.gy * .3;
    if(p.open > .05){
      s += '<ellipse cx="' + f(mx) + '" cy="' + f(my + 4 * p.open) + '" rx="' + f(8 + 5 * p.open) + '" ry="' + f(2 + 9 * p.open) + '" fill="' + pal.feat + '" opacity="' + f(Math.min(1, p.open * 1.4)) + '"/>';
    }
    if(p.open < .95){
      s += '<path d="M' + f(mx - 14) + ' ' + f(my) + ' Q ' + f(mx) + ' ' + f(my + p.curve) + ' ' + f(mx + 14) + ' ' + f(my) + '" fill="none" stroke="' + pal.feat + '" stroke-width="5.5" stroke-linecap="round" opacity="' + f(1 - p.open) + '"/>';
    }
    s += '</g></g>';
    // accessoires
    if(props){
      var ax = right ? 0 : 1;
      if(p.q > .02) s += '<text x="' + (ax ? 52 : 318) + '" y="' + f(108 + p.bob) + '" font-family="Bricolage Grotesque, Arial, sans-serif" font-size="78" font-weight="800" fill="' + pal.accent + '" opacity="' + f(p.q) + '">?</text>';
      if(p.spark > .02){
        var star = function(cx, cy, r){ return '<path d="M' + cx + ' ' + (cy - r) + ' L' + f(cx + r * .28) + ' ' + f(cy - r * .28) + ' L' + (cx + r) + ' ' + cy + ' L' + f(cx + r * .28) + ' ' + f(cy + r * .28) + ' L' + cx + ' ' + (cy + r) + ' L' + f(cx - r * .28) + ' ' + f(cy + r * .28) + ' L' + (cx - r) + ' ' + cy + ' L' + f(cx - r * .28) + ' ' + f(cy - r * .28) + ' Z" fill="' + pal.accent + '"/>'; };
        s += '<g opacity="' + f(p.spark) + '">' + star(340, 74 + p.bob, 22) + star(66, 96 + p.bob, 14) + star(352, 182 + p.bob, 10) + '</g>';
      }
      if(p.wave > .02){
        var wx = right ? 346 : 54, sg = right ? 1 : -1;
        s += '<g fill="none" stroke="' + pal.ink + '" stroke-width="7" stroke-linecap="round" opacity="' + f(p.wave) + '"><path d="M' + wx + ' ' + f(196 + p.bob) + ' q ' + 14 * sg + ' 18 0 36"/><path d="M' + (wx + 18 * sg) + ' ' + f(180 + p.bob) + ' q ' + 24 * sg + ' 34 0 68"/></g>';
      }
    }
    return s + '</svg>';
  }

  /* ---------- Composant <nesa-mascot> ---------- */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(window.customElements && !customElements.get('nesa-mascot')){
    var NesaMascot = function(){ return Reflect.construct(HTMLElement, [], NesaMascot); };
    NesaMascot.prototype = Object.create(HTMLElement.prototype);
    NesaMascot.prototype.constructor = NesaMascot;
    Object.setPrototypeOf(NesaMascot, HTMLElement);
    NesaMascot.observedAttributes = ['state', 'size', 'variant'];
    var P = NesaMascot.prototype;
    P.connectedCallback = function(){
      var self = this, key = STATES[this.getAttribute('state')] ? this.getAttribute('state') : 'repos';
      this._from = this._to = this._cur = STATES[key].p; this._at = 0; this._t0 = performance.now(); this._visible = true;
      if(!this.hasAttribute('role')) this.setAttribute('role', 'img');
      this.setAttribute('aria-label', 'Nesa, la mascotte de Nesalio : ' + STATES[key].name.toLowerCase());
      this.style.display = this.style.display || 'inline-block';
      this.style.lineHeight = '0';
      if('IntersectionObserver' in window){
        this._io = new IntersectionObserver(function(es){ self._visible = es[0].isIntersecting; if(self._visible) self._loop(); });
        this._io.observe(this);
      }
      this._loop();
    };
    P.disconnectedCallback = function(){ if(this._io) this._io.disconnect(); cancelAnimationFrame(this._raf); this._raf = 0; };
    P.attributeChangedCallback = function(name, oldV, v){
      if(name === 'state' && this._to && STATES[v] && oldV !== v){
        var t = (performance.now() - this._t0) / 1000;
        this._from = this._cur; this._to = STATES[v].p; this._at = t;
        this.setAttribute('aria-label', 'Nesa, la mascotte de Nesalio : ' + STATES[v].name.toLowerCase());
      }
      if(this._to) this._paint((performance.now() - this._t0) / 1000);
    };
    Object.defineProperty(P, 'state', {get:function(){ return this.getAttribute('state') || 'repos'; }, set:function(v){ this.setAttribute('state', v); }});
    P._paint = function(t){
      var k = reduce ? 1 : ease(t - this._at, .12);
      this._cur = lerp(this._from, this._to, k);
      var p = reduce ? this._cur : life(this._cur, t, {blink:true, gaze:true, breath:true});
      var size = +this.getAttribute('size') || 160;
      this.innerHTML = render(p, {palette:this.getAttribute('variant') === 'une-couleur' ? 'encre' : 'marque', bg:'transparent', size:size});
    };
    P._loop = function(){
      var self = this; if(this._raf) return;
      var step = function(){
        self._raf = 0;
        if(!self.isConnected) return;
        self._paint((performance.now() - self._t0) / 1000);
        if(!reduce && self._visible && !document.hidden) self._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) document.querySelectorAll('nesa-mascot').forEach(function(el){ el._loop && el._loop(); }); });
    customElements.define('nesa-mascot', NesaMascot);
  }

  window.Nesa = {PALETTES:PALETTES, BGS:BGS, BASE:BASE, STATES:STATES, ORDER:ORDER, lerp:lerp, ease:ease, tlDuration:tlDuration, sampleTimeline:sampleTimeline, life:life, render:render};
})();
