/*
 * Single‑player fruit growing game.
 *
 * This script implements the entire game in the browser so it can be
 * hosted on GitHub Pages or any static hosting service without a
 * backend.  Players move around a grid, eat fruit to grow, and earn
 * points.  The map is rendered on an HTML5 canvas.  Touch and keyboard
 * controls are supported.
 */

(function() {
  // HTML elements
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('start-btn');
  const nameInput = document.getElementById('name-input');
  const statusText = document.getElementById('status');
  const scoreValue = document.getElementById('score-value');

  // Resize canvas to fit the window
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // World configuration
  const WORLD_WIDTH = 60;
  const WORLD_HEIGHT = 60;
  const CELL_SIZE = 50;
  const FRUIT_SPAWN_INTERVAL = 300; // ms
  const MAX_FRUIT_COUNT = 40;

  let gameRunning = false;
  let player = null;
  let fruits = [];
  let spawnIntervalId = null;

  // Random ID generator for fruit
  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  // Player class
  class Player {
    constructor(name) {
      this.name = name || 'Player';
      this.x = Math.random() * WORLD_WIDTH;
      this.y = Math.random() * WORLD_HEIGHT;
      this.radius = 0.8;
      this.speed = 6 / 60; // units per frame (approx)
      this.dirX = 0;
      this.dirY = 0;
      this.score = 0;
      this.color = this.randomColor();
    }
    randomColor() {
      const hue = Math.floor(Math.random() * 360);
      return `hsl(${hue},70%,60%)`;
    }
    update() {
      const len = Math.hypot(this.dirX, this.dirY);
      if (len > 0) {
        const dx = (this.dirX / len) * this.speed;
        const dy = (this.dirY / len) * this.speed;
        this.x += dx;
        this.y += dy;
        // Clamp to boundaries considering radius
        this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
        this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));
      }
    }
  }

  // Fruit class
  class Fruit {
    constructor() {
      this.id = generateId();
      this.level = Math.floor(Math.random() * 3) + 1;
      this.radius = this.level * 0.2;
      this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
      this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
      const colours = {1: '#6FCF97', 2: '#F2C94C', 3: '#EB5757'};
      this.color = colours[this.level] || '#888888';
    }
  }

  // Spawn a new fruit
  function spawnFruit() {
    if (fruits.length >= MAX_FRUIT_COUNT) return;
    fruits.push(new Fruit());
  }

  // Start the game
  function startGame() {
    const name = nameInput.value.trim() || undefined;
    player = new Player(name);
    fruits = [];
    scoreValue.textContent = '0';
    gameRunning = true;
    // Hide UI elements
    nameInput.style.display = 'none';
    startBtn.style.display = 'none';
    statusText.textContent = '';
    // Spawn initial fruits
    for (let i = 0; i < 10; i++) spawnFruit();
    spawnIntervalId = setInterval(spawnFruit, FRUIT_SPAWN_INTERVAL);
  }

  startBtn.addEventListener('click', startGame);

  // Keyboard controls
  const keys = {};
  function updateDirFromKeys() {
    let x = 0, y = 0;
    if (keys['arrowup'] || keys['w']) y -= 1;
    if (keys['arrowdown'] || keys['s']) y += 1;
    if (keys['arrowleft'] || keys['a']) x -= 1;
    if (keys['arrowright'] || keys['d']) x += 1;
    player.dirX = x;
    player.dirY = y;
  }
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (player) updateDirFromKeys();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (player) updateDirFromKeys();
  });

  // Touch controls
  function handleTouch(e) {
    if (!gameRunning || !player) return;
    const touch = e.touches[0];
    if (!touch) return;
    // Determine touch direction relative to player
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) / rect.width * canvas.width;
    const ty = (touch.clientY - rect.top) / rect.height * canvas.height;
    // Convert to world coords relative to camera
    const scaleX = canvas.width / (WORLD_WIDTH * CELL_SIZE);
    const scaleY = canvas.height / (WORLD_HEIGHT * CELL_SIZE);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = canvas.width / 2 - player.x * CELL_SIZE * scale;
    const offsetY = canvas.height / 2 - player.y * CELL_SIZE * scale;
    const worldX = (tx - offsetX) / (CELL_SIZE * scale);
    const worldY = (ty - offsetY) / (CELL_SIZE * scale);
    const dirX = worldX - player.x;
    const dirY = worldY - player.y;
    player.dirX = dirX;
    player.dirY = dirY;
    e.preventDefault();
  }
  canvas.addEventListener('touchstart', handleTouch);
  canvas.addEventListener('touchmove', handleTouch);

  // Game loop
  function update() {
    if (gameRunning && player) {
      player.update();
      // Collision with fruit
      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i];
        const dist = Math.hypot(player.x - f.x, player.y - f.y);
        if (dist < player.radius + f.radius) {
          fruits.splice(i, 1);
          player.radius += f.level * 0.1;
          player.score += f.level;
          scoreValue.textContent = Math.floor(player.score);
        }
      }
    }
    requestAnimationFrame(update);
    draw();
  }

  // Draw world
  function draw() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!player) return;
    // Determine scale and offsets similar to multiplayer version
    const scaleX = canvas.width / (WORLD_WIDTH * CELL_SIZE);
    const scaleY = canvas.height / (WORLD_HEIGHT * CELL_SIZE);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = canvas.width / 2 - player.x * CELL_SIZE * scale;
    const offsetY = canvas.height / 2 - player.y * CELL_SIZE * scale;
    const gridSize = CELL_SIZE * scale;
    // Draw grid lines
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= WORLD_WIDTH; i++) {
      const x = i * gridSize + offsetX;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, WORLD_HEIGHT * gridSize + offsetY);
      ctx.stroke();
    }
    for (let j = 0; j <= WORLD_HEIGHT; j++) {
      const y = j * gridSize + offsetY;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(WORLD_WIDTH * gridSize + offsetX, y);
      ctx.stroke();
    }
    // Draw fruits
    fruits.forEach((f) => {
      const sx = f.x * CELL_SIZE * scale + offsetX;
      const sy = f.y * CELL_SIZE * scale + offsetY;
      const radius = f.radius * CELL_SIZE * scale;
      ctx.beginPath();
      ctx.fillStyle = f.color;
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    // Draw player
    const px = player.x * CELL_SIZE * scale + offsetX;
    const py = player.y * CELL_SIZE * scale + offsetY;
    const pr = player.radius * CELL_SIZE * scale;
    ctx.beginPath();
    ctx.fillStyle = player.color;
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    // Draw player name above
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(12, pr / 2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(player.name, px, py - pr - 2);
  }
  // Start the animation loop
  update();
})();
