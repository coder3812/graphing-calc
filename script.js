const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");

// UI Elements
const calcHeader = document.getElementById("calc-header");
const gameHud = document.getElementById("game-hud");
const calcSidebar = document.getElementById("calc-sidebar");
const eq1Input = document.getElementById("eq1");
const eq2Input = document.getElementById("eq2");

// HUD Elements
const hudScore = document.getElementById("hud-score");
const hudDown = document.getElementById("hud-down");
const hudYard = document.getElementById("hud-yard");
const hudMsg = document.getElementById("hud-msg");

// Mode Flag
let isGameMode = false;

// Calculator State
let scale = 40; // pixels per math unit

// Resize Canvas Properly
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  if (!isGameMode) drawCalculator();
}
window.addEventListener("resize", resizeCanvas);

// ==========================================
// 1. GRAPHING CALCULATOR LOGIC
// ==========================================
function parseMathExpression(expr, xVal) {
  try {
    let cleaned = expr
      .toLowerCase()
      .replace(/\^/g, "**")
      .replace(/\bsin\b/g, "Math.sin")
      .replace(/\bcos\b/g, "Math.cos")
      .replace(/\btan\b/g, "Math.tan")
      .replace(/\bsqrt\b/g, "Math.sqrt")
      .replace(/\babs\b/g, "Math.abs")
      .replace(/\bpi\b/g, "Math.PI")
      .replace(/\be\b/g, "Math.E");

    const fn = new Function("x", `return ${cleaned};`);
    const result = fn(xVal);
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function drawCalculator() {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // Grid Lines
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;

  for (let x = cx % scale; x < w; x += scale) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = cy % scale; y < h; y += scale) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Main Axes
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();

  // Plot Functions
  plotFunction(eq1Input.value, "#2563eb");
  plotFunction(eq2Input.value, "#dc2626");
}

function plotFunction(expr, color) {
  if (!expr.trim()) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  let drawing = false;
  for (let px = 0; px < w; px += 2) {
    const mathX = (px - cx) / scale;
    const mathY = parseMathExpression(expr, mathX);

    if (mathY !== null && Math.abs(mathY) < 1000) {
      const py = cy - mathY * scale;
      if (!drawing) {
        ctx.moveTo(px, py);
        drawing = true;
      } else {
        ctx.lineTo(px, py);
      }
    } else {
      drawing = false;
    }
  }
  ctx.stroke();
}

// Calculator Event Listeners
document.getElementById("plot-btn").addEventListener("click", drawCalculator);
eq1Input.addEventListener("input", drawCalculator);
eq2Input.addEventListener("input", drawCalculator);
document.getElementById("zoom-in").addEventListener("click", () => {
  scale = Math.min(scale * 1.25, 150);
  drawCalculator();
});
document.getElementById("zoom-out").addEventListener("click", () => {
  scale = Math.max(scale * 0.8, 10);
  drawCalculator();
});
document.getElementById("reset-view").addEventListener("click", () => {
  scale = 40;
  drawCalculator();
});

// ==========================================
// 2. SECRET TOGGLE (CTRL + SHIFT + G)
// ==========================================
window.addEventListener("keydown", (e) => {
  // Check Ctrl + Shift + G
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
    e.preventDefault();
    toggleMode();
  }
  // Panic key: Escape returns immediately to calculator
  if (e.key === "Escape" && isGameMode) {
    toggleMode();
  }
});

function toggleMode() {
  isGameMode = !isGameMode;

  if (isGameMode) {
    calcHeader.classList.add("hidden");
    calcSidebar.classList.add("hidden");
    gameHud.classList.remove("hidden");
    resizeCanvas();
    if (!game.initialized) initGame();
    requestAnimationFrame(gameLoop);
  } else {
    gameHud.classList.add("hidden");
    calcHeader.classList.remove("hidden");
    calcSidebar.classList.remove("hidden");
    game.isDragging = false;
    resizeCanvas();
    drawCalculator();
  }
}

// ==========================================
// 3. MINI RETRO BOWL ENGINE
// ==========================================
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

const game = {
  initialized: false,
  score: 0,
  down: 1,
  lineOfScrimmage: 20, // Yards (0 to 100)
  firstDownYard: 30,
  phase: "PASSING", // PASSING, IN_AIR, RUNNING, PLAY_OVER
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  dragCurrent: { x: 0, y: 0 },
  qb: { x: 0, y: 0 },
  ball: { x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, active: false },
  carrier: null,
  receivers: [],
  defenders: [],
  playTimer: 0
};

// Pixels per yard dynamically scaled to screen
function pxPerYard() {
  return canvas.width / 65; // Show ~65 yards horizontally at once
}

function initGame() {
  game.initialized = true;
  game.score = 0;
  game.down = 1;
  game.lineOfScrimmage = 20;
  game.firstDownYard = 30;
  setupPlay();
}

function setupPlay() {
  game.phase = "PASSING";
  game.isDragging = false;
  game.carrier = null;
  game.ball.active = false;

  const ppy = pxPerYard();
  const h = canvas.height;

  // QB lines up 4 yards behind LOS
  game.qb = {
    x: (game.lineOfScrimmage - 4) * ppy,
    y: h * 0.5
  };

  // Spawn 3 Receivers
  game.receivers = [
    { x: game.lineOfScrimmage * ppy, y: h * 0.2, speed: 2.6, route: "GO", hasBall: false },
    { x: game.lineOfScrimmage * ppy, y: h * 0.5, speed: 2.5, route: "SLANT", hasBall: false },
    { x: game.lineOfScrimmage * ppy, y: h * 0.8, speed: 2.7, route: "OUT", hasBall: false }
  ];

  // Spawn 5 Defenders
  game.defenders = [
    { x: (game.lineOfScrimmage + 6) * ppy, y: h * 0.2, speed: 2.15 },
    { x: (game.lineOfScrimmage + 7) * ppy, y: h * 0.5, speed: 2.1 },
    { x: (game.lineOfScrimmage + 6) * ppy, y: h * 0.8, speed: 2.15 },
    { x: (game.lineOfScrimmage + 14) * ppy, y: h * 0.35, speed: 2.25 },
    { x: (game.lineOfScrimmage + 14) * ppy, y: h * 0.65, speed: 2.25 }
  ];

  updateHUD("DRAG BACKWARD TO AIM & THROW");
}

function updateHUD(msg) {
  hudScore.textContent = game.score;
  const suffix = ["st", "nd", "rd", "th"][game.down - 1] || "th";
  const toGo = Math.max(1, Math.round(game.firstDownYard - game.lineOfScrimmage));
  const goalText = game.firstDownYard >= 100 ? "GOAL" : toGo;
  hudDown.textContent = `${game.down}${suffix} & ${goalText}`;

  const yardDisplay = game.lineOfScrimmage <= 50
    ? `OWN ${Math.round(game.lineOfScrimmage)}`
    : `OPP ${Math.round(100 - game.lineOfScrimmage)}`;
  hudYard.textContent = yardDisplay;

  if (msg) hudMsg.textContent = msg;
}

// Mouse Aiming Controls
canvas.addEventListener("mousedown", (e) => {
  if (!isGameMode || game.phase !== "PASSING") return;
  const rect = canvas.getBoundingClientRect();
  game.isDragging = true;
  game.dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  game.dragCurrent = { ...game.dragStart };
});

window.addEventListener("mousemove", (e) => {
  if (!isGameMode || !game.isDragging) return;
  const rect = canvas.getBoundingClientRect();
  game.dragCurrent = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});

window.addEventListener("mouseup", () => {
  if (!isGameMode || !game.isDragging) return;
  game.isDragging = false;

  // Calculate slingshot pull vector
  const dx = game.dragStart.x - game.dragCurrent.x;
  const dy = game.dragStart.y - game.dragCurrent.y;
  const power = Math.hypot(dx, dy);

  if (power > 15) {
    const cappedPower = Math.min(power, 180);
    const angle = Math.atan2(dy, dx);
    const speed = cappedPower * 0.065;

    game.ball = {
      x: game.qb.x,
      y: game.qb.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      z: 10,
      vz: cappedPower * 0.032,
      active: true
    };
    game.phase = "IN_AIR";
    updateHUD("BALL IN THE AIR!");
  }
});

// Game Physics & Update Loop
function updateGame() {
  const ppy = pxPerYard();
  const h = canvas.height;
  const endZoneX = 100 * ppy;

  if (game.phase === "PLAY_OVER") {
    game.playTimer--;
    if (game.playTimer <= 0) setupPlay();
    return;
  }

  // 1. Move Receivers
  game.receivers.forEach((rec) => {
    if (rec === game.carrier) return;
    rec.x += rec.speed;
    if (rec.route === "SLANT" && rec.x > (game.lineOfScrimmage + 5) * ppy) {
      rec.y += 1.1;
    } else if (rec.route === "OUT" && rec.x > (game.lineOfScrimmage + 8) * ppy) {
      rec.y += 1.4;
    }
    rec.y = Math.max(30, Math.min(h - 30, rec.y));
  });

  // 2. Ball Flight & Catching
  if (game.phase === "IN_AIR" && game.ball.active) {
    game.ball.x += game.ball.vx;
    game.ball.y += game.ball.vy;
    game.ball.z += game.ball.vz;
    game.ball.vz -= 0.16; // Gravity

    // Check Catch
    if (game.ball.z <= 18) {
      for (let rec of game.receivers) {
        if (Math.hypot(rec.x - game.ball.x, rec.y - game.ball.y) < 24) {
          game.carrier = rec;
          game.ball.active = false;
          game.phase = "RUNNING";
          updateHUD("CAUGHT! USE UP/DOWN OR W/S TO JUKE!");
          break;
        }
      }
    }

    // Incomplete Pass (Hits Ground)
    if (game.ball.z <= 0) {
      game.ball.active = false;
      endPlay(game.lineOfScrimmage, "INCOMPLETE PASS!");
      return;
    }
}
// 3. Ball Carrier Running (Player Controls Up/Down)
if (game.phase === "RUNNING" && game.carrier) {
game.carrier.x += 3.1; // Auto sprint toward endzone
if (keys["w"] || keys["arrowup"]) game.carrier.y -= 3.2;
if (keys["s"] || keys["arrowdown"]) game.carrier.y += 3.2;
game.carrier.y = Math.max(25, Math.min(h - 25, game.carrier.y));
// Check Touchdown
if (game.carrier.x >= endZoneX) {
game.score += 7;
game.lineOfScrimmage = 20;
game.firstDownYard = 30;
game.down = 1;
game.phase = "PLAY_OVER";
game.playTimer = 95;
updateHUD("TOUCHDOWN! +7 POINTS!");
return;
}
}
// 4. Defenders AI
const target = game.carrier || game.qb;
game.defenders.forEach((def, idx) => {
if (game.phase === "RUNNING") {
// Chase ball carrier
const angle = Math.atan2(target.y - def.y, target.x - def.x);
def.x += Math.cos(angle) * def.speed;
def.y += Math.sin(angle) * def.speed;
// Tackle check
if (Math.hypot(def.x - target.x, def.y - target.y) < 18) {
const newYard = Math.max(1, Math.round(target.x / ppy));
endPlay(newYard, "TACKLED!");
}
} else {
// Rush QB slowly or cover zones
if (idx < 2) {
const angle = Math.atan2(game.qb.y - def.y, game.qb.x - def.x);
def.x += Math.cos(angle) * 0.95; // Pass rush
def.y += Math.sin(angle) * 0.95;
if (Math.hypot(def.x - game.qb.x, def.y - game.qb.y) < 18) {
endPlay(Math.max(1, game.lineOfScrimmage - 5), "SACKED!");
}
} else {
def.x += 0.9; // Drop into coverage
}
}
});
}
function endPlay(endedYard, reason) {
game.phase = "PLAY_OVER";
game.playTimer = 75;
game.lineOfScrimmage = endedYard;
if (game.lineOfScrimmage >= game.firstDownYard) {
game.down = 1;
game.firstDownYard = Math.min(100, game.lineOfScrimmage + 10);
updateHUD(${reason} FIRST DOWN!);
} else {
game.down++;
if (game.down > 4) {
game.down = 1;
game.lineOfScrimmage = 20;
game.firstDownYard = 30;
updateHUD("TURNOVER ON DOWNS! RESET TO OWN 20");
} else {
updateHUD(reason);
}
}
}
// ==========================================
// 4. RETRO PIXEL FIELD RENDERING
// ==========================================
function drawGame() {
const w = canvas.width;
const h = canvas.height;
const ppy = pxPerYard();
// Camera scrolls smoothly with QB or Ball Carrier
const focusX = game.carrier ? game.carrier.x : game.qb.x;
const camX = Math.max(0, focusX - w * 0.25);
ctx.save();
ctx.translate(-camX, 0);
// Turf Stripes (Alternating Retro Greens)
for (let yard = 0; yard < 110; yard += 5) {
ctx.fillStyle = (yard / 5) % 2 === 0 ? "#2e7d32" : "#388e3c";
ctx.fillRect(yard * ppy, 0, 5 * ppy, h);
}
// Opponent End Zone (100 to 110 yards)
ctx.fillStyle = "#b91c1c";
ctx.fillRect(100 * ppy, 0, 15 * ppy, h);
ctx.fillStyle = "rgba(255,255,255,0.25)";
ctx.font = "bold 36px Courier New";
ctx.fillText("TOUCHDOWN", 102 * ppy, h / 2);
// Yard Lines & Numbers
ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
ctx.lineWidth = 2;
ctx.font = "bold 16px Courier New";
ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
for (let yard = 10; yard <= 100; yard += 10) {
const x = yard * ppy;
ctx.beginPath();
ctx.moveTo(x, 0);
ctx.lineTo(x, h);
ctx.stroke();
const label = yard <= 50 ? yard : 100 - yard;
if (label > 0) {
ctx.fillText(label, x - 10, 30);
ctx.fillText(label, x - 10, h - 18);
}
}
// Line of Scrimmage (Blue Line)
ctx.strokeStyle = "#38bdf8";
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(game.lineOfScrimmage * ppy, 0);
ctx.lineTo(game.lineOfScrimmage * ppy, h);
ctx.stroke();
// First Down Line (Yellow Line)
if (game.firstDownYard < 100) {
ctx.strokeStyle = "#facc15";
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(game.firstDownYard * ppy, 0);
ctx.lineTo(game.firstDownYard * ppy, h);
ctx.stroke();
}
// Aiming Dots (Slingshot Preview)
if (game.isDragging && game.phase === "PASSING") {
const dx = game.dragStart.x - game.dragCurrent.x;
const dy = game.dragStart.y - game.dragCurrent.y;
const power = Math.min(Math.hypot(dx, dy), 180);
const angle = Math.atan2(dy, dx);
ctx.fillStyle = "#facc15";
for (let i = 1; i <= 8; i++) {
const dist = (power * 1.6) * (i / 8);
const dotX = game.qb.x + Math.cos(angle) * dist;
const dotY = game.qb.y + Math.sin(angle) * dist;
ctx.beginPath();
ctx.arc(dotX, dotY, 4 - i * 0.3, 0, Math.PI * 2);
ctx.fill();
}
}
// Draw Players (Retro Blocky Sprites)
drawPlayer(game.qb.x, game.qb.y, "#2563eb", "#ffffff"); // QB
game.receivers.forEach((r) => drawPlayer(r.x, r.y, "#2563eb", "#facc15")); // WRs
game.defenders.forEach((d) => drawPlayer(d.x, d.y, "#dc2626", "#1e293b")); // Defenders
// Draw Football
if (game.ball.active) {
// Shadow
ctx.fillStyle = "rgba(0,0,0,0.4)";
ctx.beginPath();
ctx.ellipse(game.ball.x, game.ball.y + 8, 7, 4, 0, 0, Math.PI * 2);
ctx.fill();
// Ball elevated by Z height
ctx.fillStyle = "#78350f";
ctx.strokeStyle = "#ffffff";
ctx.lineWidth = 1.5;
ctx.beginPath();
ctx.ellipse(game.ball.x, game.ball.y - game.ball.z, 8, 5, 0, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();
}
ctx.restore();
}
function drawPlayer(x, y, jerseyColor, helmetColor) {
// Shadow
ctx.fillStyle = "rgba(0,0,0,0.35)";
ctx.fillRect(x - 9, y + 8, 18, 5);
// Jersey Body
ctx.fillStyle = jerseyColor;
ctx.fillRect(x - 9, y - 6, 18, 15);
// Helmet
ctx.fillStyle = helmetColor;
ctx.fillRect(x - 6, y - 13, 12, 8);
}
function gameLoop() {
if (!isGameMode) return;
updateGame();
drawGame();
requestAnimationFrame(gameLoop);
}
// Initial Render
resizeCanvas();
drawCalculator();
