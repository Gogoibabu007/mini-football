// Physics & Game Constants
const VIRTUAL_WIDTH = 800;
const VIRTUAL_HEIGHT = 500;
const PITCH_MARGIN = 25;

const FRICTION = 0.982;
const RESTITUTION = 0.78; // bounciness for wall and cap collisions
const MASS_CAP = 5.5;
const MASS_BALL = 1.0;

const RADIUS_CAP = 22;
const RADIUS_BALL = 11;
const MAX_DRAG_DIST = 140;
const FORCE_MULTIPLIER = 0.16;

// Game State
let gameMode = "ai"; // "ai" or "pvp"
let goalLimit = 3;
let teamAName = "Gonaldo FC";
let teamBName = "Robo Madrid";
let teamAColor = "hsl(350, 85%, 55%)";
let teamBColor = "hsl(200, 85%, 55%)";
let pitchTheme = "neon-green";
let isSoundEnabled = true;

let scores = { A: 0, B: 0 };
let currentPlayer = "A"; // "A" or "B"
let gameState = "setup"; // "setup", "playing", "goal", "ended"

let selectedCap = null;
let dragStart = null;
let dragCurrent = null;
let goalScorer = "";
let countdownSeconds = 3;

// Confetti Particles
let confetti = [];

// Audio Context
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Synth Sound Effects
function playSynthBeep(freqStart, freqEnd, duration, type = "sine", gainVal = 0.12) {
  if (!isSoundEnabled) return;
  try {
    initAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();
    
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, time);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, time + duration);
    }
    
    gainNode.gain.setValueAtTime(gainVal, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(time + duration);
  } catch (e) {}
}

function playFlickSound() {
  playSynthBeep(450, 150, 0.08, "triangle", 0.08);
}

function playWallCollisionSound(speed) {
  const pitch = Math.max(120, Math.min(220, 200 - speed * 5));
  playSynthBeep(pitch, pitch * 0.8, 0.1, "sine", Math.min(0.12, speed * 0.02));
}

function playObjectCollisionSound(speed) {
  const pitch = Math.max(250, Math.min(600, 300 + speed * 15));
  playSynthBeep(pitch, pitch * 0.7, 0.08, "triangle", Math.min(0.15, speed * 0.03));
}

function playGoalSound() {
  // Goal fanfare arpeggio
  if (!isSoundEnabled) return;
  try {
    initAudio();
    const time = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major
    notes.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time + idx * 0.08);
      gain.gain.setValueAtTime(0.08, time + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, time + idx * 0.08 + 0.35);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time + idx * 0.08);
      osc.stop(time + idx * 0.08 + 0.35);
    });
  } catch (e) {}
}

// 2D Entity Class
class Entity {
  constructor(x, y, radius, mass, color, team = null, id = null) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.mass = mass;
    this.color = color;
    this.team = team; // "A" or "B"
    this.id = id;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    // Friction
    this.vx *= FRICTION;
    this.vy *= FRICTION;
    
    // Stop drift
    if (Math.hypot(this.vx, this.vy) < 0.06) {
      this.vx = 0;
      this.vy = 0;
    }
  }

  draw(ctx2d) {
    ctx2d.save();
    
    // Shadow
    ctx2d.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx2d.shadowBlur = 8;
    ctx2d.shadowOffsetY = 4;
    
    // Outer cap ring
    ctx2d.beginPath();
    ctx2d.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    
    // Gradient fill
    let grad = ctx2d.createRadialGradient(this.x - 4, this.y - 4, 2, this.x, this.y, this.radius);
    if (this.team) {
      grad.addColorStop(0, "white");
      grad.addColorStop(0.3, this.color);
      grad.addColorStop(1, "black");
    } else {
      // Ball styling
      grad.addColorStop(0, "white");
      grad.addColorStop(0.85, "#ddd");
      grad.addColorStop(1, "#333");
    }
    
    ctx2d.fillStyle = grad;
    ctx2d.fill();
    
    // Border
    ctx2d.lineWidth = 1.5;
    ctx2d.strokeStyle = this.team ? "hsla(0, 0%, 100%, 0.4)" : "#222";
    ctx2d.stroke();
    
    ctx2d.restore();
    
    // Inner badge
    if (this.team) {
      ctx2d.beginPath();
      ctx2d.arc(this.x, this.y, this.radius * 0.45, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx2d.fill();
      
      ctx2d.font = "bold 13px Outfit, sans-serif";
      ctx2d.fillStyle = "white";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText(this.id, this.x, this.y);
    } else {
      // Draw soccer panels on ball
      ctx2d.save();
      ctx2d.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx2d.lineWidth = 1;
      // center panel
      ctx2d.beginPath();
      ctx2d.arc(this.x, this.y, this.radius * 0.35, 0, Math.PI * 2);
      ctx2d.stroke();
      // lines outward
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 2.5) {
        ctx2d.beginPath();
        ctx2d.moveTo(this.x + Math.cos(a) * (this.radius * 0.35), this.y + Math.sin(a) * (this.radius * 0.35));
        ctx2d.lineTo(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
        ctx2d.stroke();
      }
      ctx2d.restore();
    }
  }
}

// Game Entities Arrays
let caps = [];
let ball = null;

// DOM Elements
const soundToggle = document.getElementById("sound-toggle");
const themeToggle = document.getElementById("theme-toggle");
const startBtn = document.getElementById("start-match-btn");
const setupScreen = document.getElementById("setup-screen");
const gameScreen = document.getElementById("game-screen");

// Configuration triggers
const modeAiBtn = document.getElementById("mode-ai");
const modePvpBtn = document.getElementById("mode-pvp");
const teamANameInput = document.getElementById("team-a-name");
const teamBNameInput = document.getElementById("team-b-name");
const teamBLabel = document.getElementById("team-b-label");
const teamAColors = document.querySelectorAll("#team-a-setup .btn-color");
const teamBColors = document.querySelectorAll("#team-b-setup .btn-color");
const pitchOptions = document.querySelectorAll(".pitch-option");

// Game scoreboard
const scoreTeamABlock = document.getElementById("score-team-a-block");
const scoreTeamBBlock = document.getElementById("score-team-b-block");
const dispTeamAName = document.getElementById("disp-team-a-name");
const dispTeamBName = document.getElementById("disp-team-b-name");
const dispTeamAScore = document.getElementById("disp-team-a-score");
const dispTeamBScore = document.getElementById("disp-team-b-score");
const badgeTeamA = document.getElementById("badge-team-a");
const badgeTeamB = document.getElementById("badge-team-b");
const turnBubble = document.getElementById("turn-bubble");

// Goal Celebration & Overlays
const goalOverlay = document.getElementById("goal-overlay");
const goalScorerDisp = document.getElementById("goal-scorer-disp");
const endOverlay = document.getElementById("end-overlay");
const winnerNameDisp = document.getElementById("winner-name-disp");
const rematchBtn = document.getElementById("rematch-btn");

const backBtn = document.getElementById("back-btn");
const resetMatchBtn = document.getElementById("reset-match-btn");

// Canvas Context
const canvas = document.getElementById("pitch-canvas");
const ctx = canvas.getContext("2d");

// Kickoff placements (virtual coordinate limits)
const INITIAL_POSITIONS = {
  A: [
    { x: 120, y: 250, id: 1 }, // Goalkeeper
    { x: 300, y: 160, id: 2 }, // Defender
    { x: 300, y: 340, id: 3 }  // Attacker
  ],
  B: [
    { x: 680, y: 250, id: 1 },
    { x: 500, y: 160, id: 2 },
    { x: 500, y: 340, id: 3 }
  ],
  ball: { x: 400, y: 250 }
};

// WMO Goal Posts heights dimensions (virtual pixels)
const GOAL_MIN_Y = 175;
const GOAL_MAX_Y = 325;

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupSettingsUI();
  loop();
});

// Setup settings selectors
function setupSettingsUI() {
  // Mode selectors
  modeAiBtn.addEventListener("click", () => {
    gameMode = "ai";
    modeAiBtn.classList.add("active");
    modePvpBtn.classList.remove("active");
    teamBLabel.textContent = "Team B (Computer)";
    teamBNameInput.value = "Robo Madrid";
    teamBNameInput.disabled = true;
  });

  modePvpBtn.addEventListener("click", () => {
    gameMode = "pvp";
    modePvpBtn.classList.add("active");
    modeAiBtn.classList.remove("active");
    teamBLabel.textContent = "Team B (Away)";
    teamBNameInput.value = "Away Team";
    teamBNameInput.disabled = false;
  });

  // Goal Limit
  const limitButtons = document.querySelectorAll("[data-limit]");
  limitButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      limitButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      goalLimit = parseInt(btn.dataset.limit);
    });
  });

  // Team Colors
  teamAColors.forEach(btn => {
    btn.addEventListener("click", () => {
      teamAColors.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      teamAColor = btn.dataset.color;
      document.getElementById("team-a-color-preview").style.backgroundColor = teamAColor;
    });
  });

  teamBColors.forEach(btn => {
    btn.addEventListener("click", () => {
      teamBColors.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      teamBColor = btn.dataset.color;
      document.getElementById("team-b-color-preview").style.backgroundColor = teamBColor;
    });
  });

  // Pitch theme
  pitchOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      pitchOptions.forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      pitchTheme = opt.dataset.pitch;
    });
  });

  // Start game action
  startBtn.addEventListener("click", () => {
    teamAName = teamANameInput.value.trim() || "Home Team";
    teamBName = teamBNameInput.value.trim() || (gameMode === "ai" ? "Computer" : "Away Team");
    
    gameState = "playing";
    scores = { A: 0, B: 0 };
    currentPlayer = "A";
    
    // Switch Screen cards
    setupScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    
    resetBoardPositions();
    updateScoreboardDisplay();
    playSynthBeep(260, 520, 0.25, "sine");
  });

  // Game UI controls
  backBtn.addEventListener("click", () => {
    gameState = "setup";
    setupScreen.classList.remove("hidden");
    gameScreen.classList.add("hidden");
    playSynthBeep(400, 200, 0.2, "sine");
  });

  resetMatchBtn.addEventListener("click", () => {
    scores = { A: 0, B: 0 };
    currentPlayer = "A";
    resetBoardPositions();
    updateScoreboardDisplay();
    playSynthBeep(300, 600, 0.15, "sine");
  });

  rematchBtn.addEventListener("click", () => {
    endOverlay.classList.add("hidden");
    scores = { A: 0, B: 0 };
    currentPlayer = "A";
    gameState = "playing";
    resetBoardPositions();
    updateScoreboardDisplay();
    playSynthBeep(260, 520, 0.25, "sine");
  });

  setupMouseEvents();
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });

  soundToggle.addEventListener("click", () => {
    isSoundEnabled = !isSoundEnabled;
    soundToggle.querySelector(".volume-on-icon").style.display = isSoundEnabled ? "block" : "none";
    soundToggle.querySelector(".volume-x-icon" || ".volume-off-icon").style.display = isSoundEnabled ? "none" : "block";
  });
}

// Scoreboard displays
function updateScoreboardDisplay() {
  dispTeamAName.textContent = teamAName;
  dispTeamBName.textContent = teamBName;
  dispTeamAScore.textContent = scores.A;
  dispTeamBScore.textContent = scores.B;
  
  badgeTeamA.style.setProperty("--t-color", teamAColor);
  badgeTeamB.style.setProperty("--t-color", teamBColor);
  
  updateTurnBubble();
}

function updateTurnBubble() {
  if (currentPlayer === "A") {
    turnBubble.textContent = "YOUR TURN";
    turnBubble.style.backgroundColor = teamAColor;
    scoreTeamABlock.classList.add("active");
    scoreTeamBBlock.classList.remove("active");
  } else {
    turnBubble.textContent = gameMode === "ai" ? "COMP THINKING" : "PLAYER 2 TURN";
    turnBubble.style.backgroundColor = teamBColor;
    scoreTeamBBlock.classList.add("active");
    scoreTeamABlock.classList.remove("active");
  }
}

// Setup kickoff placements
function resetBoardPositions() {
  caps = [];
  
  // Player A Caps
  INITIAL_POSITIONS.A.forEach(p => {
    caps.push(new Entity(p.x, p.y, RADIUS_CAP, MASS_CAP, teamAColor, "A", p.id));
  });
  
  // Player B Caps
  INITIAL_POSITIONS.B.forEach(p => {
    caps.push(new Entity(p.x, p.y, RADIUS_CAP, MASS_CAP, teamBColor, "B", p.id));
  });

  // Ball
  ball = new Entity(INITIAL_POSITIONS.ball.x, INITIAL_POSITIONS.ball.y, RADIUS_BALL, MASS_BALL, "white");
}

// Game Canvas Interactivity Swipes Aiming
function setupMouseEvents() {
  // Helper to map screen coordinates to virtual aspect coordinates
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = VIRTUAL_WIDTH / rect.width;
    const scaleY = VIRTUAL_HEIGHT / rect.height;
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function onPointerDown(e) {
    if (gameState !== "playing" || isPitchMoving()) return;
    if (gameMode === "ai" && currentPlayer === "B") return; // computer's turn
    
    const coords = getCanvasCoords(e);
    
    // Find if coordinates lie inside active team's caps
    const foundCap = caps.find(c => c.team === currentPlayer && Math.hypot(c.x - coords.x, c.y - coords.y) < RADIUS_CAP + 10);
    
    if (foundCap) {
      selectedCap = foundCap;
      dragStart = { x: foundCap.x, y: foundCap.y };
      dragCurrent = { x: coords.x, y: coords.y };
      
      initAudio(); // Initialize audio context on first user click
    }
  }

  function onPointerMove(e) {
    if (!selectedCap) return;
    
    const coords = getCanvasCoords(e);
    // drag vector is opposite of shot vector
    dragCurrent = { x: coords.x, y: coords.y };
  }

  function onPointerUp() {
    if (!selectedCap) return;
    
    const dx = dragStart.x - dragCurrent.x;
    const dy = dragStart.y - dragCurrent.y;
    const dist = Math.hypot(dx, dy);
    
    // Only fire if drag distance is greater than 8px
    if (dist > 8) {
      const angle = Math.atan2(dy, dx);
      // cap force vector limits
      const force = Math.min(MAX_DRAG_DIST, dist) * FORCE_MULTIPLIER;
      
      selectedCap.vx = Math.cos(angle) * force;
      selectedCap.vy = Math.sin(angle) * force;
      
      playFlickSound();
      
      // End turn
      switchTurn();
    }
    
    selectedCap = null;
    dragStart = null;
    dragCurrent = null;
  }

  canvas.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); onPointerDown(e); });
  window.addEventListener("touchmove", onPointerMove);
  window.addEventListener("touchend", onPointerUp);
}

function switchTurn() {
  currentPlayer = currentPlayer === "A" ? "B" : "A";
  updateTurnBubble();
  
  // Trigger AI Turn
  if (gameMode === "ai" && currentPlayer === "B" && gameState === "playing") {
    // Wait until pitch finishes moving before triggering AI
    triggerAiWhenStill();
  }
}

function triggerAiWhenStill() {
  const checkInterval = setInterval(() => {
    if (gameState !== "playing") {
      clearInterval(checkInterval);
      return;
    }
    
    if (!isPitchMoving()) {
      clearInterval(checkInterval);
      setTimeout(handleAiLogic, 600); // realistic time lag for computer
    }
  }, 100);
}

// Evaluate AI swiping trajectory
function handleAiLogic() {
  if (gameState !== "playing" || currentPlayer !== "B") return;
  
  // Find AI caps
  const aiCaps = caps.filter(c => c.team === "B");
  
  // Find closest cap to the ball
  let bestCap = null;
  let minDist = Infinity;
  aiCaps.forEach(cap => {
    const d = Math.hypot(ball.x - cap.x, ball.y - cap.y);
    if (d < minDist) {
      minDist = d;
      bestCap = cap;
    }
  });

  if (!bestCap) return;

  // AI strategy: Flick closest cap directly at the ball aiming towards left goal (Goal A: x=0, y=250)
  // Shot Vector: target - position
  // We want cap to hit the ball in a way that pushes the ball towards left goal.
  // Ideal hit position: ball center offset opposite of goal center.
  const targetGoalX = PITCH_MARGIN;
  const targetGoalY = VIRTUAL_HEIGHT / 2;
  
  // Direction vector from ball to goal
  const bgDx = targetGoalX - ball.x;
  const bgDy = targetGoalY - ball.y;
  const bgLen = Math.hypot(bgDx, bgDy);
  
  // Push point: a circle radius offset behind the ball relative to goal direction
  const pushX = ball.x - (bgDx / bgLen) * (RADIUS_CAP + RADIUS_BALL + 5);
  const pushY = ball.y - (bgDy / bgLen) * (RADIUS_CAP + RADIUS_BALL + 5);
  
  // Flick from best cap to this push point
  const angle = Math.atan2(pushY - bestCap.y, pushX - bestCap.x);
  
  // Speed based on distance, capped for control
  const dist = Math.hypot(pushX - bestCap.x, pushY - bestCap.y);
  const force = Math.max(4.0, Math.min(18.0, dist * 0.05));
  
  bestCap.vx = Math.cos(angle) * force;
  bestCap.vy = Math.sin(angle) * force;
  
  playFlickSound();
  switchTurn();
}

// Verify if elements are in motion
function isPitchMoving() {
  if (!ball) return false;
  if (Math.hypot(ball.vx, ball.vy) > 0.05) return true;
  return caps.some(c => Math.hypot(c.vx, c.vy) > 0.05);
}

// 2D Vector physics engine collision loops
function handlePhysics() {
  if (gameState !== "playing" && gameState !== "goal") return;
  
  // Update entities positions
  caps.forEach(c => c.update());
  if (ball) ball.update();
  
  // Check Wall Boundary Collisions
  const topWall = PITCH_MARGIN;
  const bottomWall = VIRTUAL_HEIGHT - PITCH_MARGIN;
  const leftWall = PITCH_MARGIN;
  const rightWall = VIRTUAL_WIDTH - PITCH_MARGIN;
  
  // Ball Wall check
  if (ball) {
    // Top & Bottom limits
    if (ball.y - ball.radius < topWall) {
      ball.y = topWall + ball.radius;
      ball.vy = -ball.vy * RESTITUTION;
      playWallCollisionSound(Math.abs(ball.vy));
    } else if (ball.y + ball.radius > bottomWall) {
      ball.y = bottomWall - ball.radius;
      ball.vy = -ball.vy * RESTITUTION;
      playWallCollisionSound(Math.abs(ball.vy));
    }
    
    // Left & Right limits (Excluding Goals area)
    const inGoalVerticalRange = ball.y >= GOAL_MIN_Y && ball.y <= GOAL_MAX_Y;
    
    if (ball.x - ball.radius < leftWall) {
      if (inGoalVerticalRange) {
        // Goal scored for Team B (Away)!
        if (gameState === "playing") triggerGoal("B");
      } else {
        ball.x = leftWall + ball.radius;
        ball.vx = -ball.vx * RESTITUTION;
        playWallCollisionSound(Math.abs(ball.vx));
      }
    } else if (ball.x + ball.radius > rightWall) {
      if (inGoalVerticalRange) {
        // Goal scored for Team A (Home)!
        if (gameState === "playing") triggerGoal("A");
      } else {
        ball.x = rightWall - ball.radius;
        ball.vx = -ball.vx * RESTITUTION;
        playWallCollisionSound(Math.abs(ball.vx));
      }
    }
  }

  // Caps Wall Check
  caps.forEach(cap => {
    if (cap.y - cap.radius < topWall) {
      cap.y = topWall + cap.radius;
      cap.vy = -cap.vy * RESTITUTION;
      playWallCollisionSound(Math.abs(cap.vy));
    } else if (cap.y + cap.radius > bottomWall) {
      cap.y = bottomWall - cap.radius;
      cap.vy = -cap.vy * RESTITUTION;
      playWallCollisionSound(Math.abs(cap.vy));
    }

    if (cap.x - cap.radius < leftWall) {
      cap.x = leftWall + cap.radius;
      cap.vx = -cap.vx * RESTITUTION;
      playWallCollisionSound(Math.abs(cap.vx));
    } else if (cap.x + cap.radius > rightWall) {
      cap.x = rightWall - cap.radius;
      cap.vx = -cap.vx * RESTITUTION;
      playWallCollisionSound(Math.abs(cap.vx));
    }
  });

  // Resolve Circle-Circle Collisions (Caps vs Cap, Caps vs Ball)
  const allObjects = [...caps];
  if (ball) allObjects.push(ball);
  
  for (let i = 0; i < allObjects.length; i++) {
    for (let j = i + 1; j < allObjects.length; j++) {
      const o1 = allObjects[i];
      const o2 = allObjects[j];
      
      const dx = o2.x - o1.x;
      const dy = o2.y - o1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = o1.radius + o2.radius;
      
      if (dist < minDist) {
        // Resolve Overlap (push apart)
        const overlap = minDist - dist;
        const normX = dx / dist;
        const normY = dy / dist;
        
        // Push based on relative masses
        const totalMass = o1.mass + o2.mass;
        const ratio1 = o2.mass / totalMass; // heavier object pushes lighter object more
        const ratio2 = o1.mass / totalMass;
        
        o1.x -= normX * overlap * ratio1;
        o1.y -= normY * overlap * ratio1;
        
        o2.x += normX * overlap * ratio2;
        o2.y += normY * overlap * ratio2;
        
        // Resolve Velocities (elastic collision formulas)
        const rvx = o2.vx - o1.vx;
        const rvy = o2.vy - o1.vy;
        
        // Velocity along collision normal
        const normalVel = rvx * normX + rvy * normY;
        
        // Only resolve if they are moving towards each other
        if (normalVel < 0) {
          const impulseVal = -(1 + RESTITUTION) * normalVel / (1/o1.mass + 1/o2.mass);
          
          o1.vx -= (impulseVal / o1.mass) * normX;
          o1.vy -= (impulseVal / o1.mass) * normY;
          
          o2.vx += (impulseVal / o2.mass) * normX;
          o2.vy += (impulseVal / o2.mass) * normY;
          
          // Play sound
          const speed = Math.hypot(o1.vx - o2.vx, o1.vy - o2.vy);
          playObjectCollisionSound(speed);
        }
      }
    }
  }
}

// Goal celebration cycles
function triggerGoal(scorerTeam) {
  gameState = "goal";
  goalScorer = scorerTeam === "A" ? teamAName : teamBName;
  scores[scorerTeam]++;
  
  playGoalSound();
  updateScoreboardDisplay();
  
  // Show announcement overlay
  goalOverlay.classList.remove("hidden");
  goalScorerDisp.textContent = `${goalScorer} scored!`;
  
  // Spawn Goal Celebration Confetti
  initConfetti();
  
  // Auto Reset kickoff positions after 3.5 seconds
  setTimeout(() => {
    goalOverlay.classList.add("hidden");
    confetti = [];
    
    if (scores[scorerTeam] >= goalLimit) {
      triggerWinner(scorerTeam === "A" ? teamAName : teamBName);
    } else {
      gameState = "playing";
      resetBoardPositions();
    }
  }, 3500);
}

// Declare match winner
function triggerWinner(winnerName) {
  gameState = "ended";
  endOverlay.classList.remove("hidden");
  winnerNameDisp.textContent = `${winnerName} Wins!`;
  
  // Continuously spawn celebration particles
  initConfetti(150);
}

// Pitch background drawings
function drawPitch() {
  ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  
  // Pitch themes configs
  let fieldColor = "hsl(145, 60%, 15%)";
  let stripeColor = "hsl(145, 65%, 22%)";
  let lineColor = "hsla(0, 0%, 100%, 0.4)";
  let gridStyle = false;

  if (pitchTheme === "midnight-blue") {
    fieldColor = "hsl(215, 60%, 12%)";
    stripeColor = "hsl(220, 65%, 18%)";
    lineColor = "hsla(200, 100%, 80%, 0.35)";
  } else if (pitchTheme === "cyber-grid") {
    fieldColor = "hsl(320, 50%, 8%)";
    lineColor = "hsla(320, 95%, 60%, 0.45)";
    gridStyle = true;
  }
  
  // Pitch Base Grass / Plate
  ctx.fillStyle = fieldColor;
  ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
  
  // Render striping patterns or grids
  if (gridStyle) {
    // Cyberpunk grids
    ctx.strokeStyle = "hsla(320, 95%, 60%, 0.08)";
    ctx.lineWidth = 1;
    const gridSz = 40;
    for (let x = 0; x < VIRTUAL_WIDTH; x += gridSz) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIRTUAL_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < VIRTUAL_HEIGHT; y += gridSz) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIRTUAL_WIDTH, y);
      ctx.stroke();
    }
  } else {
    // Stripes
    ctx.fillStyle = stripeColor;
    const stripeW = VIRTUAL_WIDTH / 10;
    for (let i = 0; i < 10; i += 2) {
      ctx.fillRect(i * stripeW, 0, stripeW, VIRTUAL_HEIGHT);
    }
  }

  // Field Outlines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(PITCH_MARGIN, PITCH_MARGIN, VIRTUAL_WIDTH - PITCH_MARGIN * 2, VIRTUAL_HEIGHT - PITCH_MARGIN * 2);
  
  // Halfway Line
  ctx.beginPath();
  ctx.moveTo(VIRTUAL_WIDTH / 2, PITCH_MARGIN);
  ctx.lineTo(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - PITCH_MARGIN);
  ctx.stroke();
  
  // Center Circle
  ctx.beginPath();
  ctx.arc(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, 70, 0, Math.PI * 2);
  ctx.stroke();
  
  // Center spot
  ctx.beginPath();
  ctx.arc(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();

  // Penalty Areas (Left & Right)
  const penW = 120;
  const penH = 220;
  const penY = (VIRTUAL_HEIGHT - penH) / 2;
  
  // Left Box
  ctx.strokeRect(PITCH_MARGIN, penY, penW, penH);
  // Left Box spot
  ctx.beginPath();
  ctx.arc(PITCH_MARGIN + 90, VIRTUAL_HEIGHT / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  
  // Right Box
  ctx.strokeRect(VIRTUAL_WIDTH - PITCH_MARGIN - penW, penY, penW, penH);
  // Right Box spot
  ctx.beginPath();
  ctx.arc(VIRTUAL_WIDTH - PITCH_MARGIN - 90, VIRTUAL_HEIGHT / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();

  // Goal Nets Drawings
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  
  // Left Goal
  ctx.beginPath();
  ctx.moveTo(PITCH_MARGIN, GOAL_MIN_Y);
  ctx.lineTo(PITCH_MARGIN - 20, GOAL_MIN_Y);
  ctx.lineTo(PITCH_MARGIN - 20, GOAL_MAX_Y);
  ctx.lineTo(PITCH_MARGIN, GOAL_MAX_Y);
  ctx.stroke();
  
  // Right Goal
  ctx.beginPath();
  ctx.moveTo(VIRTUAL_WIDTH - PITCH_MARGIN, GOAL_MIN_Y);
  ctx.lineTo(VIRTUAL_WIDTH - PITCH_MARGIN + 20, GOAL_MIN_Y);
  ctx.lineTo(VIRTUAL_WIDTH - PITCH_MARGIN + 20, GOAL_MAX_Y);
  ctx.lineTo(VIRTUAL_WIDTH - PITCH_MARGIN, GOAL_MAX_Y);
  ctx.stroke();
  
  ctx.restore();
}

// Confetti Particle Engine
function initConfetti(count = 80) {
  for (let i = 0; i < count; i++) {
    confetti.push({
      x: VIRTUAL_WIDTH / 2 + (Math.random() - 0.5) * 150,
      y: VIRTUAL_HEIGHT / 2 + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 8,
      vy: -5 - Math.random() * 8,
      color: `hsl(${Math.random() * 360}, 85%, 60%)`,
      size: 4 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      rotSpeed: -0.1 + Math.random() * 0.2
    });
  }
}

function updateAndDrawConfetti() {
  if (confetti.length === 0) return;
  
  confetti.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    c.vy += 0.25; // gravity
    c.vx *= 0.98;
    c.rotation += c.rotSpeed;
    
    // Draw
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rotation);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
    ctx.restore();
  });
  
  // Keep spawning continuous streams if ended match celebration
  if (gameState === "ended" && confetti.length < 180 && Math.random() > 0.75) {
    confetti.push({
      x: Math.random() * VIRTUAL_WIDTH,
      y: -10,
      vx: (Math.random() - 0.5) * 3,
      vy: 1 + Math.random() * 4,
      color: `hsl(${Math.random() * 360}, 85%, 60%)`,
      size: 4 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      rotSpeed: -0.05 + Math.random() * 0.1
    });
  }
}

// Main Game Rendering Loop
function loop() {
  if (gameState === "playing" || gameState === "goal" || gameState === "ended") {
    // 1. Calculations
    handlePhysics();
    
    // 2. Rendering Base Pitch
    drawPitch();
    
    // 3. Aim Vector Line representation
    if (selectedCap && dragStart && dragCurrent) {
      const dx = dragStart.x - dragCurrent.x;
      const dy = dragStart.y - dragCurrent.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 8) {
        const angle = Math.atan2(dy, dx);
        const cappedDist = Math.min(MAX_DRAG_DIST, dist);
        
        // Aim arrow pointing forward
        const arrowX = selectedCap.x + Math.cos(angle) * cappedDist * 0.75;
        const arrowY = selectedCap.y + Math.sin(angle) * cappedDist * 0.75;
        
        // Aiming line
        ctx.save();
        ctx.strokeStyle = selectedCap.color;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([5, 5]);
        
        ctx.beginPath();
        ctx.moveTo(selectedCap.x, selectedCap.y);
        ctx.lineTo(arrowX, arrowY);
        ctx.stroke();
        
        // Arrow head
        ctx.beginPath();
        ctx.arc(arrowX, arrowY, 6, 0, Math.PI * 2);
        ctx.fillStyle = selectedCap.color;
        ctx.fill();
        ctx.restore();
      }
    }
    
    // 4. Draw player pieces selection rings (when pitch is stationary and player can turn)
    const isStill = !isPitchMoving();
    if (isStill && gameState === "playing") {
      caps.forEach(cap => {
        if (cap.team === currentPlayer && (gameMode !== "ai" || currentPlayer === "A")) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(cap.x, cap.y, cap.radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = cap.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.restore();
        }
      });
    }
    
    // 5. Draw Caps & Soccer Ball
    caps.forEach(c => c.draw(ctx));
    if (ball) ball.draw(ctx);
    
    // 6. Draw Confetti particles
    updateAndDrawConfetti();
  }
  
  requestAnimationFrame(loop);
}
