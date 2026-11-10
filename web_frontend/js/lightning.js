/* Animated lightning for the login page background.
   Draws random forked bolts on a canvas with a soft screen flash.
   Pauses when the tab is hidden and is static if the user prefers reduced motion. */
(function () {
  var canvas = document.getElementById('lightningCanvas');
  if (!canvas) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var ctx = canvas.getContext('2d');
  var w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  var bolts = [];
  var flash = 0;
  var nextStrike = 0;

  function resize() {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Jagged line from (x1,y1) to (x2,y2) using midpoint displacement.
  function jag(x1, y1, x2, y2, disp, out) {
    if (disp < 3) { out.push([x2, y2]); return; }
    var mx = (x1 + x2) / 2 + rand(-disp, disp);
    var my = (y1 + y2) / 2 + rand(-disp * 0.3, disp * 0.3);
    jag(x1, y1, mx, my, disp / 2, out);
    jag(mx, my, x2, y2, disp / 2, out);
  }

  function makeBolt() {
    var x = rand(w * 0.1, w * 0.9);
    var pts = [[x, -10]];
    var endX = x + rand(-w * 0.15, w * 0.15);
    var endY = rand(h * 0.45, h * 0.95);
    jag(x, -10, endX, endY, h * 0.12, pts);

    // Side branches off random points of the main bolt
    var branches = [];
    var count = Math.floor(rand(2, 5));
    for (var i = 0; i < count; i++) {
      var p = pts[Math.floor(rand(pts.length * 0.2, pts.length * 0.85))];
      var bp = [[p[0], p[1]]];
      var bx = p[0] + rand(-w * 0.18, w * 0.18);
      var by = p[1] + rand(h * 0.12, h * 0.3);
      jag(p[0], p[1], bx, by, h * 0.06, bp);
      branches.push(bp);
    }
    return { main: pts, branches: branches, life: 1, decay: rand(0.035, 0.06), flicker: 0 };
  }

  function strike() {
    var n = Math.random() < 0.3 ? 2 : 1;
    for (var i = 0; i < n; i++) bolts.push(makeBolt());
    flash = rand(0.10, 0.2);
  }

  function stroke(pts, width, alpha) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.stroke();
  }

  function drawBolt(b) {
    // flicker: bolt briefly dips and returns for a realistic double-flash
    var a = b.life * (Math.random() < 0.15 ? 0.5 : 1);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(120, 180, 255, 0.9)';
    ctx.shadowBlur = 25;

    ctx.strokeStyle = 'rgba(110, 170, 255, 1)';           // outer glow
    stroke(b.main, 6, a * 0.35);
    b.branches.forEach(function (br) { stroke(br, 3, a * 0.3); });

    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(230, 240, 255, 1)';           // bright core
    stroke(b.main, 2, a);
    b.branches.forEach(function (br) { stroke(br, 1, a * 0.8); });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  var last = 0, running = true;
  function frame(t) {
    if (!running) return;
    var dt = t - last; last = t;
    ctx.clearRect(0, 0, w, h);

    if (t >= nextStrike) {
      strike();
      nextStrike = t + rand(2200, 6500);
      // occasional quick follow-up strike
      if (Math.random() < 0.3) nextStrike = t + rand(150, 400);
    }

    if (flash > 0.005) {
      var g = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, Math.max(w, h));
      g.addColorStop(0, 'rgba(160, 200, 255,' + flash + ')');
      g.addColorStop(1, 'rgba(160, 200, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      flash *= 0.9;
    }

    for (var i = bolts.length - 1; i >= 0; i--) {
      drawBolt(bolts[i]);
      bolts[i].life -= bolts[i].decay * Math.min(dt / 16, 3);
      if (bolts[i].life <= 0) bolts.splice(i, 1);
    }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { running = false; }
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  });
  window.addEventListener('resize', resize);

  resize();
  nextStrike = performance.now() + 800;
  requestAnimationFrame(frame);
})();
