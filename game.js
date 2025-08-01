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
  const ammoValue = document.getElementById('ammo-value');
  const fireBtn = document.getElementById('fire-btn');

  // Resize canvas to fit the window
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // World configuration
  // The map is three times larger in both dimensions.  The area
  // increase is 9×, so the maximum number of fruit is scaled up
  // proportionally.  Fruit spawn rate is 1.5× faster than before.
  const WORLD_WIDTH = 60 * 3;
  const WORLD_HEIGHT = 60 * 3;
  const CELL_SIZE = 50;
  const FRUIT_SPAWN_INTERVAL = 3000 / 1.5; // ms
  const MAX_FRUIT_COUNT = 40 * 9;

  let gameRunning = false;
  let player = null;
  let fruits = [];
  let spawnIntervalId = null;

  // Obstacles and bullets
  let obstacles = [];
  let bullets = [];

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
      this.ammo = 0;
      this.color = this.randomColor();
      // Facing direction used for cannon orientation when not moving
      this.facingX = 1;
      this.facingY = 0;
    }
    randomColor() {
      const hue = Math.floor(Math.random() * 360);
      return `hsl(${hue},70%,60%)`;
    }
    update() {
      const len = Math.hypot(this.dirX, this.dirY);
      // Update facing direction if there is input
      if (len > 0.0001) {
        this.facingX = this.dirX;
        this.facingY = this.dirY;
      }
      // Move separately along x and y axes to handle obstacle collisions
      if (len > 0) {
        const dx = (this.dirX / len) * this.speed;
        const dy = (this.dirY / len) * this.speed;
        // Attempt to move along x
        const testX = this.x + dx;
        if (!collidesWithObstacles(testX, this.y, this.radius)) {
          this.x = testX;
        }
        // Attempt to move along y (use updated x)
        const testY = this.y + dy;
        if (!collidesWithObstacles(this.x, testY, this.radius)) {
          this.y = testY;
        }
        // Clamp to world boundaries
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

  // Generate a set of rectangular obstacles.  Obstacles are defined
  // in world coordinates and measured in grid units.  Players and
  // bullets cannot pass through these rectangles.
  function generateObstacles() {
    obstacles = [];
    const num = 12;
    for (let i = 0; i < num; i++) {
      const w = Math.random() * 8 + 4; // width between 4 and 12
      const h = Math.random() * 8 + 4; // height between 4 and 12
      const x = Math.random() * (WORLD_WIDTH - w);
      const y = Math.random() * (WORLD_HEIGHT - h);
      obstacles.push({ x, y, width: w, height: h });
    }
  }

  // Collision detection between a circle and all obstacles.  Returns
  // true if the circle at (cx, cy) with the given radius intersects
  // any obstacle rectangle.
  function collidesWithObstacles(cx, cy, radius) {
    for (const ob of obstacles) {
      // Distance from circle centre to the closest point on the rectangle
      const dx = Math.max(ob.x - cx, 0, cx - (ob.x + ob.width));
      const dy = Math.max(ob.y - cy, 0, cy - (ob.y + ob.height));
      if (dx * dx + dy * dy < radius * radius) {
        return true;
      }
    }
    return false;
  }

  // Bullet class representing a projectile fired by the player
  class Bullet {
    constructor(px, py, dirX, dirY) {
      // Normalise direction
      const len = Math.hypot(dirX, dirY);
      const nx = dirX / len;
      const ny = dirY / len;
      const startOffset = player.radius + 0.2;
      this.x = px + nx * startOffset;
      this.y = py + ny * startOffset;
      this.dx = nx * (12 / 60); // bullet speed per frame
      this.dy = ny * (12 / 60);
      this.radius = 0.15;
      this.life = 120; // frames until despawn
    }
    update() {
      this.x += this.dx;
      this.y += this.dy;
      this.life--;
    }
  }

  // Fire a bullet if the player has ammunition and a facing direction
  function shoot() {
    if (!gameRunning || !player) return;
    if (player.ammo <= 0) return;
    const dirLen = Math.hypot(player.facingX, player.facingY);
    if (dirLen < 0.001) return;
    bullets.push(new Bullet(player.x, player.y, player.facingX, player.facingY));
    player.ammo--;
    ammoValue.textContent = 'Ammo: ' + player.ammo;
  }

  // Start the game
  function startGame() {
    const name = nameInput.value.trim() || undefined;
    player = new Player(name);
    fruits = [];
    scoreValue.textContent = 'Score: 0';
    ammoValue.textContent = 'Ammo: 0';
    gameRunning = true;
    // Hide UI elements
    nameInput.style.display = 'none';
    startBtn.style.display = 'none';
    fireBtn.style.display = 'inline-block';
    statusText.textContent = '';
    // Spawn initial fruits
    for (let i = 0; i < 10; i++) spawnFruit();
    spawnIntervalId = setInterval(spawnFruit, FRUIT_SPAWN_INTERVAL);
    // Generate obstacles
    generateObstacles();
    // Ensure player does not start inside an obstacle
    while (collidesWithObstacles(player.x, player.y, player.radius)) {
      player.x = Math.random() * WORLD_WIDTH;
      player.y = Math.random() * WORLD_HEIGHT;
    }
  }

  startBtn.addEventListener('click', startGame);

  // Fire button and spacebar to shoot
  fireBtn.addEventListener('click', shoot);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      shoot();
      e.preventDefault();
    }
  });

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
      // Update player movement
      player.update();
      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update();
        // Remove bullet if expired or outside bounds or hitting obstacle
        if (
          b.life <= 0 ||
          b.x < 0 || b.x > WORLD_WIDTH ||
          b.y < 0 || b.y > WORLD_HEIGHT ||
          collidesWithObstacles(b.x, b.y, b.radius)
        ) {
          bullets.splice(i, 1);
        }
      }
      // Collision with fruit
      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i];
        const dist = Math.hypot(player.x - f.x, player.y - f.y);
        if (dist < player.radius + f.radius) {
          fruits.splice(i, 1);
          // Increase ammo instead of size
          player.ammo += f.level;
          player.score += f.level;
          scoreValue.textContent = 'Score: ' + Math.floor(player.score);
          ammoValue.textContent = 'Ammo: ' + player.ammo;
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
    // Draw obstacles behind everything else
    obstacles.forEach((ob) => {
      const ox = ob.x * CELL_SIZE * scale + offsetX;
      const oy = ob.y * CELL_SIZE * scale + offsetY;
      const ow = ob.width * CELL_SIZE * scale;
      const oh = ob.height * CELL_SIZE * scale;
      ctx.fillStyle = '#999';
      ctx.fillRect(ox, oy, ow, oh);
    });
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
    // Draw bullets above fruits and obstacles
    bullets.forEach((b) => {
      const bx = b.x * CELL_SIZE * scale + offsetX;
      const by = b.y * CELL_SIZE * scale + offsetY;
      const br = b.radius * CELL_SIZE * scale;
      ctx.beginPath();
      ctx.fillStyle = '#000';
      ctx.arc(bx, by, br, 0, Math.PI * 2);
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
    // Draw cannon as a small rectangle protruding from the front
    const facelen = Math.hypot(player.facingX, player.facingY);
    if (facelen > 0.001) {
      const nx = player.facingX / facelen;
      const ny = player.facingY / facelen;
      const cannonLength = pr * 1.3;
      const cannonWidth = pr * 0.3;
      const angle = Math.atan2(ny, nx);
      ctx.save();
      ctx.translate(px + nx * (pr + cannonLength / 2), py + ny * (pr + cannonLength / 2));
      ctx.rotate(angle);
      ctx.fillStyle = '#333';
      ctx.fillRect(-cannonLength / 2, -cannonWidth / 2, cannonLength, cannonWidth);
      ctx.restore();
    }
    // Draw player name and score above
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(12, pr / 2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${player.name} (${Math.floor(player.score)})`, px, py - pr - 2);
  }
  // Start the animation loop
  update();
})();