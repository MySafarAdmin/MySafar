// The sign-in page's opening, drawn live on a canvas (no video to download). On a deep night-blue stage a gold
// eight-point star is constructed at the centre, compass first, and the pattern blooms outward from it across the
// whole screen, star by star, as a band of light sweeps over the lines. Then the pattern lets go: its lines break
// into thousands of points of light that swirl inward like a galaxy and settle into the white of the logo, with a
// ring of light pulsing out as it lands. The logo (a real element from then on) moves aside for "MySafar", then,
// on a computer, the stage folds into the navy welcome panel as the logo lands on the panel's own; on a phone it
// lifts away. Skip, Escape, or a tap anywhere goes straight to the form.
//
// Sound is drawn too (Web Audio): off by default, as browsers expect, until the speaker button is pressed; the
// choice is remembered on this device. The form's fields stay disabled while the opening plays (a fieldset in
// login.html), so browsers, Safari included, can't offer saved passwords over it; when it ends they're enabled and
// the email field takes focus, which is when the saved-password suggestions appear. Under reduced motion there
// is no opening at all (auth.css hides it) and the form is ready at once.
(function () {
  "use strict";
  var hold = document.querySelector("fieldset.hold");
  var stage = document.querySelector(".intro");
  var body = document.body;

  function ready() {
    if (!hold) return;
    hold.disabled = false;
    var field = hold.querySelector("input[name=email]");
    if (field) field.focus({preventScroll: true});
    hold = null;
  }

  var still = false;
  try { still = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // Without a stage, under reduced motion, or if this script arrived so late that the stage's own fallback has
  // already dissolved it (auth.css), there is nothing to play.
  if (!stage || still || performance.now() > 2500) {
    if (stage) stage.remove();
    ready();
    return;
  }
  var canvas = stage.querySelector(".ifilm");
  var ctx = canvas.getContext("2d");
  if (!ctx) { stage.remove(); ready(); return; }
  stage.classList.add("live");
  body.classList.add("filming");

  // --- Timeline (seconds) ---------------------------------------------------------------------------------------
  var T = {bloom: .55, sweep: .9, swirl: 2.25, land: 3.55, domLogo: 3.75, lock: 4.2, out: 5.55, end: 6.7};

  // --- Small helpers --------------------------------------------------------------------------------------------
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix(a, b, p) { return a + (b - a) * p; }
  function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
  function inOut(x) { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function outCubic(x) { x = clamp(x); return 1 - Math.pow(1 - x, 3); }
  function outExpo(x) { x = clamp(x); return x === 1 ? 1 : 1 - Math.pow(2, -10 * x); }
  function seeded(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function radial(x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(r1, r0 + .01));
    for (var i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function offscreen(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // --- Canvas size ----------------------------------------------------------------------------------------------
  var W = 0, H = 0, S = 0, D = 0, cx = 0, cy = 0, dpr = 1;
  function resize() {
    W = innerWidth; H = innerHeight; S = Math.min(W, H); D = Math.sqrt(W * W + H * H); cx = W / 2; cy = H / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (W * H * dpr * dpr > 3200000) dpr = Math.max(1, Math.sqrt(3200000 / (W * H)));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  addEventListener("resize", resize);
  var rnd = seeded(7), i;

  // --- The pattern ----------------------------------------------------------------------------------------------
  // The eight-point star pattern (khatam): on a square grid, each point carries a star made of two squares, one
  // turned 45°; neighbouring stars touch at their tips, leaving the crosses between them. Each line remembers how
  // far it is from the centre, which decides when it draws in.
  var G = Math.max(64, Math.min(150, S / 5.2)), ro = G / 2, segs = [], maxd = 0;
  (function () {
    var n = Math.ceil(D / 2 / G / .9) + 1, k, q;
    for (var a = -n; a <= n; a++) for (var b = -n; b <= n; b++) {
      var x = a * G, y = b * G, dc = Math.sqrt(x * x + y * y);
      if (dc > D * .62) continue;
      for (q = 0; q < 2; q++) {
        var pts = [];
        for (k = 0; k < 4; k++) { var an = (k * 90 + q * 45) * Math.PI / 180; pts.push([x + Math.cos(an) * ro, y + Math.sin(an) * ro]); }
        for (k = 0; k < 4; k++) {
          var p0 = pts[k], p1 = pts[(k + 1) % 4], mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
          // draw each line outward from the end nearer the centre
          var d0 = Math.hypot(p0[0], p0[1]), d1 = Math.hypot(p1[0], p1[1]);
          if (d1 < d0) { var sw = p0; p0 = p1; p1 = sw; }
          segs.push({x0: p0[0], y0: p0[1], x1: p1[0], y1: p1[1], d: Math.min(d0, d1), mx: mx, my: my, centre: !a && !b});
        }
      }
      maxd = Math.max(maxd, dc);
    }
    segs.sort(function (s1, s2) { return s1.d - s2.d; });
  })();
  // Where a pattern point sits on screen at time t: the pattern slowly turns and drifts towards us.
  function rot(t) { return -.16 + t * .05; }
  function zoom(t) { return .92 + t * .045; }
  function toScreen(x, y, t) {
    var r = rot(t), z = zoom(t), c = Math.cos(r), s = Math.sin(r);
    return [cx + (x * c - y * s) * z, cy + (x * s + y * c) * z];
  }
  function reveal(s, t) {
    if (s.centre) return clamp((t - .18) / .5);
    return clamp((t - T.bloom - s.d / maxd * 1.15) / .42);
  }

  // --- The logo, and the points of light that become it ----------------------------------------------------------
  // The logo's white is where its picture is clear (the picture is the navy shape alone): that shape is what the
  // light gathers into.
  var logoImg = stage.querySelector(".ilogo img"), whiteSpr = null, R = 56, SPR = 256, motes = [];
  var MOTES = W < 700 ? 900 : 1500;
  function makeLogo() {
    if (whiteSpr || !logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
    whiteSpr = offscreen(SPR, SPR);
    var g = whiteSpr.getContext("2d"), c = SPR / 2, r = 97 / 112 * c;
    g.fillStyle = "#fff"; g.beginPath(); g.arc(c, c, c - 1, 0, 6.283); g.fill();
    g.globalCompositeOperation = "destination-out";
    g.save(); g.beginPath(); g.arc(c, c, r, 0, 6.283); g.clip(); g.drawImage(logoImg, c - r, c - r, r * 2, r * 2); g.restore();
    g.globalCompositeOperation = "source-over";
    var targets = [];
    try {
      var px = g.getImageData(0, 0, SPR, SPR).data, tries = 0, rr = seeded(5);
      while (targets.length < MOTES && tries++ < 80000) {
        var x = Math.floor(rr() * SPR), y = Math.floor(rr() * SPR);
        if (px[(y * SPR + x) * 4 + 3] > 200) targets.push([(x / SPR - .5) * 2 * R, (y / SPR - .5) * 2 * R]);
      }
    } catch (e) {}
    // Each mote starts somewhere on the pattern's lines, nearer the middle more often than not.
    var mr = seeded(19), near = segs.filter(function (s) { return s.d < maxd * .55; });
    for (var k = 0; k < targets.length; k++) {
      var s = near[Math.floor(Math.pow(mr(), 1.6) * near.length)], f = mr();
      motes.push({px: mix(s.x0, s.x1, f), py: mix(s.y0, s.y1, f), tx: targets[k][0], ty: targets[k][1],
                  del: mr() * .45, ph: mr() * 6.3, b: .45 + mr() * .55, turns: 1.1 + mr() * .9});
    }
  }
  // Dust in the air, catching the light.
  var dust = [];
  for (i = 0; i < 70; i++) dust.push({x: rnd(), y: rnd(), r: .5 + rnd() * 1.3, v: .004 + rnd() * .012, ph: rnd() * 6.3});
  // Film grain.
  var grain = offscreen(128, 128), gg = grain.getContext("2d"), gd = gg.createImageData(128, 128);
  for (i = 0; i < gd.data.length; i += 4) { var v = rnd() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
  gg.putImageData(gd, 0, 0);
  var grainFill = ctx.createPattern(grain, "repeat");

  // --- Drawing --------------------------------------------------------------------------------------------------
  function backdrop(t) {
    // deep night blue, warming to the welcome panel's navy once the logo has landed
    var toNavy = smooth((t - T.land - .1) / .9);
    ctx.fillStyle = radial(cx, cy, 0, D * .62, [0, "#0a2b57", .55, "#041631", 1, "#010813"]);
    ctx.fillRect(0, 0, W, H);
    if (toNavy > 0) { ctx.globalAlpha = toNavy; ctx.fillStyle = "#003b6b"; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = toNavy * (1 - smooth((t - T.out) / .5));
      ctx.fillStyle = radial(cx, cy, 0, D * .5, [0, "rgba(40,110,185,.45)", 1, "rgba(0,40,80,0)"]); ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#cfe0ff";
    for (var k = 0; k < dust.length; k++) {
      var d = dust[k], y = ((d.y - t * d.v) % 1 + 1) % 1;
      ctx.globalAlpha = .18 + .2 * Math.sin(t * 1.5 + d.ph);
      ctx.fillRect(d.x * W + Math.sin(t * .6 + d.ph) * 8, y * H, d.r, d.r);
    }
    ctx.globalAlpha = 1;
  }
  // The gold lines. A thin bright core over a wide soft glow, added as light. A band of light sweeps diagonally
  // across, whitening the lines it passes; the whole pattern lets go as its light leaves for the logo.
  function pattern(t) {
    var gone = smooth((t - T.swirl + .05) / .5), echo = .07 * (1 - smooth((t - T.out + .3) / .5));
    var pulse = t > T.land ? Math.exp(-Math.pow((t - T.land - .25) * 3.2, 2)) : 0;
    var r = rot(t), z = zoom(t), c = Math.cos(r) * z, s = Math.sin(r) * z;
    var sweep = mix(-1.25, 1.35, inOut((t - T.sweep) / 1.4)), ux = .7071, uy = .7071;
    ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * cx, dpr * cy);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? 1.15 / z : 4.5 / z;
      for (var k = 0; k < segs.length; k++) {
        var g = segs[k], p = reveal(g, t);
        if (p <= 0) continue;
        var fall = 1 - g.d / (maxd * 1.02);
        var base = (.35 + .65 * fall * fall);
        var a = base * mix(1, echo / .7 + pulse * .5 * fall, gone);
        if (a <= .01) continue;
        var proj = (g.mx * ux + g.my * uy) / (D * .5), band = Math.exp(-Math.pow((proj - sweep) / .2, 2));
        var head = p < 1 ? 1.6 : 1;   // the tip of a drawing line burns brighter
        ctx.globalAlpha = Math.min(1, a * (pass ? .9 : .2) * head * (1 + band * 2.6));
        ctx.strokeStyle = band > .45 ? (pass ? "#fff1cf" : "#ffd98a") : (pass ? "#e9b24a" : "#c7861c");
        ctx.beginPath(); ctx.moveTo(g.x0, g.y0); ctx.lineTo(mix(g.x0, g.x1, p), mix(g.y0, g.y1, p)); ctx.stroke();
      }
    }
    // the construction of the first star: its circle, drawn like a compass
    var cp = clamp(t / .5), cf = 1 - smooth((t - 1.4) / .6);
    if (cp > 0 && cf > 0) {
      ctx.globalAlpha = .6 * cf; ctx.strokeStyle = "#e9b24a"; ctx.lineWidth = 1 / z;
      ctx.beginPath(); ctx.arc(0, 0, ro, -Math.PI / 2, -Math.PI / 2 + cp * 6.283); ctx.stroke();
      ctx.globalAlpha = .3 * cf;
      ctx.beginPath(); ctx.arc(0, 0, ro * .54, Math.PI / 2, Math.PI / 2 + cp * 6.283); ctx.stroke();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  // The motes: each leaves its place on the pattern, spirals in round the centre, and settles on its place in the
  // logo's white, cooling from gold to white as it goes and leaving a short trail of light.
  function motesAt(m, t) {
    var e = inOut((t - T.swirl - m.del) / (T.land - T.swirl - .45));
    var st = toScreen(m.px, m.py, Math.min(t, T.swirl + m.del)), sx = st[0] - cx, sy = st[1] - cy;
    var r0 = Math.hypot(sx, sy), a0 = Math.atan2(sy, sx), r1 = Math.hypot(m.tx, m.ty), a1 = Math.atan2(m.ty, m.tx);
    var da = a1 - a0; while (da < 0) da += 6.283; da += 6.283 * Math.floor(m.turns);
    var ang = a0 + da * e, rad = mix(r0, r1, Math.pow(e, .8)) * (1 + .12 * Math.sin(e * Math.PI));
    return [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, e];
  }
  function drawMotes(t) {
    if (!motes.length || t < T.swirl) return;
    var settle = smooth((t - T.land + .12) / .35);
    ctx.globalCompositeOperation = "lighter";
    for (var k = 0; k < motes.length; k++) {
      var m = motes[k], p = motesAt(m, t), q = motesAt(m, t - .035), e = p[2];
      var a = m.b * (1 - settle * .9) * (.6 + .4 * Math.sin(t * 13 + m.ph * 2));
      if (a <= .01) continue;
      var warm = 1 - e;
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgb(255," + Math.round(232 - warm * 40) + "," + Math.round(255 - warm * 140) + ")";
      ctx.lineWidth = mix(1.6, 1.3, e);
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0] + .1, p[1]); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  // The logo landing: its navy disc and white fill in as the motes arrive, with a ring of light pulsing out.
  function landing(t) {
    var f = smooth((t - T.land + .25) / .4), gone = 1 - smooth((t - T.domLogo - .15) / .2);
    if (f <= 0 || gone <= 0 || !whiteSpr) return;
    ctx.globalAlpha = f * gone;
    ctx.fillStyle = radial(cx, cy, R * .9, R * 3, [0, "rgba(160,200,255,.35)", 1, "rgba(120,160,240,0)"]);
    ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
    ctx.fillStyle = "#003b6b"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.fill();
    ctx.drawImage(whiteSpr, cx - R, cy - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
    var w = t - T.land;
    if (w > 0 && w < 1.2) {
      var rr = R + outExpo(w / 1.2) * D * .55;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = .55 * (1 - w / 1.2);
      ctx.strokeStyle = "#cfe2ff"; ctx.lineWidth = 2 + 10 * (1 - w / 1.2);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      ctx.globalAlpha = .4 * Math.exp(-w * 6);
      ctx.fillStyle = radial(cx, cy, 0, D * .5, [0, "rgba(200,225,255,.8)", 1, "rgba(200,225,255,0)"]); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
  }

  // --- The film -------------------------------------------------------------------------------------------------
  var t = 0, last = 0, raf = 0, over = false;
  function frame(now) {
    raf = 0;
    if (over) return;
    var dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now; t += dt;
    try { makeLogo(); draw(t); cues(t); }
    catch (e) { finish(true); return; }
    if (t < T.end) raf = requestAnimationFrame(frame);
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    backdrop(t);
    pattern(t);
    drawMotes(t);
    landing(t);
    var vig = 1 - smooth((t - T.land) / .8);
    if (vig > 0) {
      ctx.globalAlpha = vig;
      ctx.fillStyle = radial(cx, cy, S * .3, D * .6, [0, "rgba(0,0,0,0)", 1, "rgba(0,3,12,.55)"]); ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = .045; ctx.fillStyle = grainFill;
    ctx.save(); ctx.translate((t * 977) % 128, (t * 613) % 128); ctx.fillRect(-128, -128, W + 256, H + 256); ctx.restore();
    ctx.globalAlpha = 1;
  }

  // --- The logo, the name, and the hand-over to the sign-in page --------------------------------------------------
  var lock = stage.querySelector(".ilock"), logoEl = stage.querySelector(".ilogo"), name = stage.querySelector(".iname");
  var chars = [];
  (function split(el) {
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.textContent.split("").forEach(function (ch) { var s = document.createElement("span"); s.className = "ch"; s.textContent = ch; frag.appendChild(s); chars.push(s); });
        n.parentNode.replaceChild(frag, n);
      } else split(n);
    });
  })(name);
  var lockScale = 1;
  function place(x, y, sc, el) { (el || lock).style.transform = "translate(" + x + "px," + y + "px) scale(" + sc + ")"; }
  function centredLogo() {
    lock.style.transformOrigin = "56px 56px";
    lockScale = Math.min(1, (W - 48) / lock.offsetWidth);
    return {x: cx - 56, y: cy - 56};
  }
  var said = {};
  function once(key, at, fn) { if (!said[key] && t >= at) { said[key] = true; fn(); } }
  function cues(t) {
    once("logo", T.domLogo, function () {
      var c = centredLogo();
      place(c.x, c.y, 1);
      lock.style.opacity = "1";
      if (lock.animate) logoEl.animate([{opacity: 0}, {opacity: 1}], {duration: 300, easing: "ease", fill: "both"});
    });
    once("lock", T.lock, function () {
      var c = centredLogo(), wl = lock.offsetWidth * lockScale, x = cx - wl / 2 - 56 + 56 * lockScale, from = "translate(" + c.x + "px," + c.y + "px) scale(1)";
      var to = "translate(" + x + "px," + c.y + "px) scale(" + lockScale + ")";
      if (lock.animate) lock.animate([{transform: from}, {transform: to}], {duration: 950, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards"});
      place(x, c.y, lockScale);
      chars.forEach(function (ch, j) {
        if (!ch.animate) { ch.style.opacity = "1"; return; }
        ch.animate([{opacity: 0, transform: "translateY(22px) scale(.55)", filter: "blur(8px)"},
                    {opacity: 1, transform: "translateY(-3px) scale(1.04)", filter: "blur(0)", offset: .65},
                    {opacity: 1, transform: "none", filter: "blur(0)"}],
                   {duration: 700, delay: 260 + j * 62, easing: "cubic-bezier(.2,.9,.3,1)", fill: "both"});
      });
    });
    once("out", T.out, function () { finish(false); });
  }

  var finished = false;
  function finish(skipped) {
    if (finished) return;
    finished = true;
    stage.classList.add("done");
    sound.leave(skipped);
    var wide = innerWidth >= 880, panel = document.querySelector(".welcome"), badge = panel && panel.querySelector(".wmark .badge");
    body.classList.add("reveal");
    if (skipped || !wide || !badge || !stage.animate) {
      // A quick lift away: straight to the form.
      var dur = skipped ? 380 : 750;
      if (stage.animate) {
        if (!skipped) lock.animate([{opacity: 1}, {opacity: 0, transform: lock.style.transform + " translateY(-30px)", filter: "blur(6px)"}], {duration: 600, easing: "ease-in", fill: "forwards"});
        stage.animate([{opacity: 1}, {opacity: 0}], {duration: dur, easing: "ease", fill: "forwards"}).onfinish = end;
      } else end();
      body.classList.remove("filming");
      ready();
      return;
    }
    // On a computer the stage folds into the welcome panel and the film's logo lands on the panel's own.
    over = true;  // stop drawing: the canvas holds the navy frame
    var pr = panel.getBoundingClientRect(), br = badge.getBoundingClientRect();
    var sc = br.width / 112;
    var from = lock.style.transform;
    var tx = br.left + br.width / 2 - 56, ty = br.top + br.height / 2 - 56;
    var to = "translate(" + tx + "px," + ty + "px) scale(" + sc + ")";
    var ease = "cubic-bezier(.7,0,.2,1)";
    lock.animate([{transform: from}, {transform: to}], {duration: 1050, easing: ease, fill: "forwards"});
    logoEl.animate([{boxShadow: "0 0 0 1px rgba(255,255,255,.4),0 0 60px 8px rgba(150,190,255,.28)"}, {boxShadow: "0 0 0 0 rgba(255,255,255,0),0 0 0 0 rgba(150,190,255,0)"}],
                   {duration: 900, easing: "ease", fill: "forwards"});
    var clipTo = "inset(" + Math.max(0, pr.top) + "px " + Math.max(0, innerWidth - pr.right) + "px " + Math.max(0, innerHeight - pr.bottom) + "px " + pr.left + "px)";
    stage.animate([{clipPath: "inset(0px 0px 0px 0px)"}, {clipPath: clipTo}], {duration: 1050, easing: ease, fill: "forwards"}).onfinish = function () {
      body.classList.remove("filming");
      stage.animate([{opacity: 1}, {opacity: 0}], {duration: 350, easing: "ease", fill: "forwards"}).onfinish = end;
      ready();
    };
  }
  function end() {
    over = true;
    if (raf) cancelAnimationFrame(raf);
    removeEventListener("resize", resize);
    removeEventListener("keydown", onKey);
    stage.remove();
  }

  // --- Sound ------------------------------------------------------------------------------------------------------
  // All synthesised: a low pad throughout, a rising harp as the pattern blooms, a rush of air and scattered high
  // notes as the light swirls in, a low bloom and a bell as the logo lands, soft ticks for the letters, and a last
  // breath of air with a chord as the page arrives.
  var sound = (function () {
    var KEY = "mysafar-film-sound", ac = null, master = null, verb = null, noise = null, on = false;
    var button = stage.querySelector(".isnd");
    function pref() { try { return localStorage.getItem(KEY) === "on"; } catch (e) { return false; } }
    function remember(v) { try { localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) {} }
    function setup() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      var comp = ac.createDynamicsCompressor();
      comp.connect(ac.destination);
      master = ac.createGain(); master.gain.value = 0; master.connect(comp);
      verb = ac.createConvolver();
      var len = ac.sampleRate * 2.8, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3.2); }
      verb.buffer = ir;
      var wet = ac.createGain(); wet.gain.value = .5; verb.connect(wet); wet.connect(master);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      var nd = noise.getChannelData(0); for (j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      return true;
    }
    function env(g, pts, base) {   // pts: [filmTime, value, ...], placed against the film clock
      var now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      for (var j = 0; j < pts.length; j += 2) {
        var at = base + pts[j];
        if (at > now) g.gain.linearRampToValueAtTime(pts[j + 1], at);
      }
    }
    function out(node, dry, wet) {
      var g = ac.createGain(); node.connect(g);
      var d = ac.createGain(); d.gain.value = dry; g.connect(d); d.connect(master);
      if (wet) { var w = ac.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
      return g;
    }
    function tone(type, f, base, pts, dry, wet, stopAt) {
      var o = ac.createOscillator(); o.type = type; o.frequency.value = f;
      var g = out(o, dry, wet); env(g, pts, base);
      o.start(); o.stop(base + stopAt);
      return o;
    }
    function hiss(base, filter, f0, f1, t0, t1, pts, dry, wet, q) {
      var s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      var f = ac.createBiquadFilter(); f.type = filter; f.Q.value = q || 1;
      var now = ac.currentTime, a0 = Math.max(now, base + t0);
      f.frequency.setValueAtTime(f0, a0); f.frequency.exponentialRampToValueAtTime(f1, Math.max(a0 + .05, base + t1));
      s.connect(f); var g = out(f, dry, wet); env(g, pts, base);
      s.start(); s.stop(base + t1 + .2);
    }
    function ping(at, f0, f1, len, level, wet, type) {
      if (at < ac.currentTime) return;
      var o = ac.createOscillator(); o.type = type || "sine";
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len * .7);
      var g = out(o, 1, wet);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(level, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + len);
      o.start(at); o.stop(at + len + .05);
    }
    function bell(at, f, level) {
      [[1, 1], [2, .35], [2.76, .3], [5.4, .12], [8.9, .05]].forEach(function (p) {
        ping(at, f * p[0], f * p[0] * .999, 3.2 / Math.sqrt(p[0]), level * p[1], .7);
      });
    }
    function score() {
      var base = ac.currentTime - t, E = T.end + 2;
      if (t < T.out) {
        tone("sine", 73.42, base, [Math.max(t, 0), 0, 1.2, .1, T.land, .14, T.land + .1, .2, T.out + .5, .12, E, 0], 1, .25, E);
        tone("sine", 110, base, [Math.max(t, 0), 0, 1.6, .07, T.land + .1, .13, T.out + .5, .08, E, 0], 1, .35, E);
        var o = tone("triangle", 220.5, base, [Math.max(t, 0), 0, 2, .025, T.land + .1, .04, E, 0], .6, .6, E); o.detune.value = 7;
      }
      // the star drawing itself and the pattern blooming: a rising harp of D major pentatonic notes
      var notes = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77, 1174.66];
      for (var k = 0; k < 22; k++) {
        var at = .2 + k * .075 + (k > 6 ? (k - 6) * .01 : 0), f = notes[Math.min(notes.length - 1, Math.floor(k / 2))];
        ping(base + at, f, f, 1.6, .05 * (1 - k / 30), .85, k % 3 ? "sine" : "triangle");
      }
      // the light letting go and swirling in
      if (t < T.land) hiss(base, "bandpass", 300, 4200, Math.max(t, T.swirl - .2), T.land, [Math.max(t, T.swirl - .2), 0, T.land - .15, .22, T.land, 0], 1, .45, 2.2);
      var gr = seeded(77);
      for (k = 0; k < 18; k++) { var at2 = T.swirl + gr() * (T.land - T.swirl), f2 = notes[5 + Math.floor(gr() * 6)]; ping(base + at2, f2 * 2, f2 * 2, .4, .012 + gr() * .012, .9); }
      // landing: a low bloom and a bell
      ping(base + T.land, 110, 46, 1.4, .3, .4);
      bell(base + T.land, 587.33, .17);
      chars.forEach(function (c, j) { ping(base + T.lock + .26 + j * .062 + .1, 1150 + j * 70, 1050 + j * 70, .09, .045, .5, "triangle"); });
      if (t < T.out + 1) {
        hiss(base, "lowpass", 2400, 260, Math.max(t, T.out - .1), T.out + 1.2, [Math.max(t, T.out - .1), 0, T.out + .3, .12, T.out + 1.2, 0], 1, .4, .7);
        [293.66, 369.99, 440, 587.33].forEach(function (f, j) { ping(base + T.out + .25 + j * .07, f, f, 2.8, .045, .8); });
      }
    }
    function start() {
      if (!ac && !setup()) return false;
      if (ac.state === "suspended" && ac.resume) ac.resume();
      if (!on) {
        on = true;
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setValueAtTime(master.gain.value, ac.currentTime);
        master.gain.linearRampToValueAtTime(.9, ac.currentTime + .4);
        score();
      }
      return true;
    }
    function stop() {
      if (!ac) return;
      on = false;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setValueAtTime(master.gain.value, ac.currentTime);
      master.gain.linearRampToValueAtTime(0, ac.currentTime + .25);
      var old = ac; ac = null; setTimeout(function () { old.close && old.close(); }, 400);
    }
    function show() { button.setAttribute("aria-pressed", on ? "true" : "false"); button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on"); }
    button.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (on) stop(); else start();
      remember(on); show();
    });
    show();
    // Remembered "on": try at once; a browser that still wants a tap keeps it quiet, and the button says so.
    if (pref()) {
      try {
        start();
        if (ac && ac.state !== "running") setTimeout(function () { if (ac && ac.state !== "running") { stop(); show(); } }, 300);
      } catch (e) { on = false; }
      show();
    }
    return {
      leave: function (skipped) {
        if (!ac) return;
        if (skipped) { stop(); return; }
        var old = ac; setTimeout(function () { try { old.close(); } catch (e) {} }, 4500);
      }
    };
  })();

  // --- Skipping ---------------------------------------------------------------------------------------------------
  stage.querySelector(".iskip").addEventListener("click", function (ev) { ev.stopPropagation(); finish(true); });
  stage.addEventListener("click", function () { finish(true); });
  function onKey(ev) { if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") { if (ev.target.closest && ev.target.closest(".ibtn")) return; ev.preventDefault(); finish(true); } }
  addEventListener("keydown", onKey);

  if (logoImg && !logoImg.complete) logoImg.addEventListener("load", makeLogo);
  makeLogo();
  raf = requestAnimationFrame(frame);
})();
