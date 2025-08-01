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
  const healthValue = document.getElementById('health-value');
  const upgradePtsValue = document.getElementById('upgrade-points');
  const upgradeList = document.getElementById('upgrade-list');
  const botsValue = document.getElementById('bots-value');
  const fireBtn = document.getElementById('fire-btn');

  // Resize canvas to fit the window
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // World configuration
  // The map is a large 200×200 block world.  Only a 100×100 block
  // window is visible at any time; the camera follows the player and
  // scales the scene accordingly.  Item counts and obstacle counts
  // scale relative to the original 60×60 world to maintain a similar
  // density.  Spawn rates are unchanged.
  const WORLD_WIDTH = 200;
  const WORLD_HEIGHT = 200;
  const VIEW_WIDTH_BLOCKS = 100;
  const VIEW_HEIGHT_BLOCKS = 100;
  const CELL_SIZE = 50;
  const ITEM_SPAWN_INTERVAL = 3000 / 1.5; // ms
  // Scale factor relative to a 60×60 world for computing item counts
  const SCALE_FACTOR = (WORLD_WIDTH / 60) * (WORLD_HEIGHT / 60);
  const MAX_FRUIT_COUNT = Math.floor(40 * SCALE_FACTOR);
  const MAX_AMMO_COUNT = Math.floor(40 * SCALE_FACTOR);
  // Default bullet parameters.  These values can be increased via
  // upgrades.  Bullets move a little faster than the player and have
  // a modest lifespan so they don’t traverse the entire map.  We
  // intentionally increased the base bullet life to extend its range
  // slightly while still preventing shots from travelling beyond the
  // world boundaries.
  const DEFAULT_BULLET_SPEED = 12 / 60;
  const DEFAULT_BULLET_LIFE = 180; // frames

  // When bots collide with an obstacle continuously, they will
  // redirect their attention to further‑away items.  This constant
  // defines how many update frames constitute approximately three
  // seconds (assuming ~60 FPS).  After contactFrames crosses this
  // threshold the bot will select the next farthest target.
  const OBSTACLE_CONTACT_THRESHOLD = 60 * 3;

  let gameRunning = false;
  let player = null;
  // Items array holds both fruit and ammo pickups.  Each item has a
  // `type` property set to either 'fruit' or 'ammo'.
  let items = [];
  let spawnIntervalId = null;

  // Obstacles and bullets
  let obstacles = [];
  let bullets = [];

  // Autonomous bots purchased by the player.  Bots will collect
  // resources on the player's behalf.  A maximum of 5 bots are
  // allowed.  Each bot costs 45 score points to purchase.
  let bots = [];
  const MAX_BOTS = 5;
  const BOT_COST = 45;

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
      // Base movement speed measured in world units per frame.  A
      // separate multiplier is applied to this base speed when the
      // player buys a speed upgrade.  The actual movement speed used
      // inside the update() method is stored in the `speed` property.
      this.baseSpeed = 6 / 60;
      this.speedMultiplier = 1;
      this.speed = this.baseSpeed * this.speedMultiplier;
      this.dirX = 0;
      this.dirY = 0;
      this.score = 0;
      this.ammo = 0;
      this.color = this.randomColor();
      // Facing direction used for cannon orientation when not moving
      this.facingX = 1;
      this.facingY = 0;
      // Health system.  maxHealth can be increased via upgrades.
      this.maxHealth = 100;
      this.health = this.maxHealth;
      // Upgrade multipliers for bullet properties.  Upgrades can
      // increase bullet speed and range.
      this.bulletSpeedMultiplier = 1;
      this.bulletRangeMultiplier = 1;
      // Upgrade tracking.  totalUpgradePointsEarned is derived from
      // score, upgradePointsSpent counts spent points.  The `upgrades`
      // object records how many times each upgrade has been purchased.
      this.totalUpgradePointsEarned = 0;
      this.upgradePointsSpent = 0;
      this.upgrades = {
        bulletSpeed: 0,
        bulletRange: 0,
        health: 0,
        speed: 0,
      };

      // Track the incremental benefit each upgrade will grant.  The
      // first time an upgrade is purchased the value here is added to
      // the corresponding stat.  Each subsequent purchase multiplies
      // this increment by 0.75 to ensure diminishing returns.  For
      // bullet and range upgrades the values represent additive
      // multipliers (e.g. 0.2 => +20%).  For speed the value is
      // additive to the speed multiplier.  For health it is the
      // additional health points granted.
      this.upgradeIncrement = {
        bulletSpeed: 0.2,
        bulletRange: 0.2,
        speed: 0.15,
        health: 20,
      };
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
        // Recompute current speed from baseSpeed and multiplier in case
        // upgrades have changed it.
        this.speed = this.baseSpeed * this.speedMultiplier;
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

  // Fruit class representing score‑granting items.  Fruit come in
  // levels 1–3; higher level fruit are larger and worth more points.
  class Fruit {
    constructor() {
      this.id = generateId();
      this.type = 'fruit';
      this.level = Math.floor(Math.random() * 3) + 1;
      // Larger radius differences so levels are visually distinct
      const radii = {1: 0.3, 2: 0.45, 3: 0.6};
      this.radius = radii[this.level] || 0.3;
      this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
      this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
      // Bright fruit colours for each level
      const colours = {1: '#7DBE31', 2: '#FDB827', 3: '#D72631'};
      this.color = colours[this.level] || '#888888';
    }
  }

  // Ammo pickup class.  Ammo pickups grant the player additional
  // ammunition but no score.  There are four sizes (1, 3, 5 and 10
  // ammo) and rarer, larger pickups are less common.  Each size has
  // its own colour and radius so players can easily tell them apart.
  class AmmoPickup {
    constructor() {
      this.id = generateId();
      this.type = 'ammo';
      // Weighted random selection of ammo amount; larger amounts are
      // rarer.  We choose from an array with duplicate entries to
      // influence the probability distribution.  For example, 1 is
      // common, 3 less common, etc.
      const choices = [1, 1, 1, 1, 1, 1, 3, 3, 3, 5, 5, 10];
      this.amount = choices[Math.floor(Math.random() * choices.length)];
      // Radii scaled more dramatically with the ammo amount so sizes
      // are clearly distinct from both fruit and one another.
      const radii = {1: 0.25, 3: 0.4, 5: 0.55, 10: 0.7};
      this.radius = radii[this.amount] || 0.3;
      // Position within world boundaries
      this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
      this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
      // Colours chosen to differentiate ammo pickups.  Vibrant blues and
      // purples contrast strongly with fruit colours.
      const colours = {1: '#268BDC', 3: '#925AA3', 5: '#3AAFA9', 10: '#F5C32C'};
      this.color = colours[this.amount] || '#268BDC';
    }
  }

  // Spawn a new item (fruit or ammo).  We ensure that the number of
  // items of each type does not exceed its maximum.  The type is
  // chosen randomly but biased toward fruit so that players always
  // have opportunities to earn points.
  function spawnItem() {
    const fruitCount = items.filter(i => i.type === 'fruit').length;
    const ammoCount = items.filter(i => i.type === 'ammo').length;
    if (fruitCount >= MAX_FRUIT_COUNT && ammoCount >= MAX_AMMO_COUNT) return;
    // Determine which type to spawn.  60% chance fruit, 40% ammo.
    let spawnType;
    if (fruitCount >= MAX_FRUIT_COUNT) spawnType = 'ammo';
    else if (ammoCount >= MAX_AMMO_COUNT) spawnType = 'fruit';
    else spawnType = Math.random() < 0.6 ? 'fruit' : 'ammo';
    let item;
    let attempts = 0;
    do {
      // Create a new item of the chosen type
      item = spawnType === 'fruit' ? new Fruit() : new AmmoPickup();
      attempts++;
      // Try up to 10 times to find a spot outside obstacles
    } while (collidesWithObstacles(item.x, item.y, item.radius) && attempts < 10);
    // Only add the item if it's not colliding with an obstacle
    if (!collidesWithObstacles(item.x, item.y, item.radius)) {
      items.push(item);
    }
  }

  // Generate a set of obstacles of varying shapes.  Obstacles are
  // defined in world coordinates.  Some are rectangles and others are
  // circles.  Players and bullets cannot pass through these shapes.
  function generateObstacles() {
    obstacles = [];
    // Number of obstacles scales with the size of the world.  A
    // baseline of ~16 obstacles in the 60×60 world yields dozens of
    // obstacles here.  Limiting to 50 prevents overcrowding.
    const num = Math.min(50, Math.floor(16 * SCALE_FACTOR));
    for (let i = 0; i < num; i++) {
      // Randomly choose obstacle type: 60% rectangles, 40% circles
      const type = Math.random() < 0.6 ? 'rect' : 'circle';
      if (type === 'rect') {
        const w = Math.random() * 8 + 4; // width between 4 and 12
        const h = Math.random() * 8 + 4; // height between 4 and 12
        const x = Math.random() * (WORLD_WIDTH - w);
        const y = Math.random() * (WORLD_HEIGHT - h);
        obstacles.push({ type, x, y, width: w, height: h });
      } else {
        // Circle obstacle
        const r = Math.random() * 4 + 2; // radius between 2 and 6
        const cx = Math.random() * (WORLD_WIDTH - 2 * r) + r;
        const cy = Math.random() * (WORLD_HEIGHT - 2 * r) + r;
        obstacles.push({ type, cx, cy, radius: r });
      }
    }
  }

  // Collision detection between a circle at (cx, cy) and obstacles.  Returns
  // true if the circle intersects any obstacle shape.
  function collidesWithObstacles(cx, cy, radius) {
    for (const ob of obstacles) {
      if (ob.type === 'rect') {
        // Distance from circle centre to the closest point on the rectangle
        const dx = Math.max(ob.x - cx, 0, cx - (ob.x + ob.width));
        const dy = Math.max(ob.y - cy, 0, cy - (ob.y + ob.height));
        if (dx * dx + dy * dy < radius * radius) {
          return true;
        }
      } else if (ob.type === 'circle') {
        const dx = ob.cx - cx;
        const dy = ob.cy - cy;
        const radSum = ob.radius + radius;
        if (dx * dx + dy * dy < radSum * radSum) {
          return true;
        }
      }
    }
    return false;
  }

  // Bullet class representing a projectile fired by the player.  A
  // bullet’s speed and lifespan are influenced by the player's current
  // upgrade multipliers.  When created, these multipliers are copied
  // onto the bullet so it continues travelling with the same speed and
  // range even if the player upgrades mid‑flight.
  class Bullet {
    constructor(px, py, dirX, dirY, speedMult, rangeMult) {
      // Normalise direction
      const len = Math.hypot(dirX, dirY);
      const nx = dirX / len;
      const ny = dirY / len;
      const startOffset = player.radius + 0.2;
      this.x = px + nx * startOffset;
      this.y = py + ny * startOffset;
      this.dx = nx * (DEFAULT_BULLET_SPEED * speedMult);
      this.dy = ny * (DEFAULT_BULLET_SPEED * speedMult);
      this.radius = 0.15;
      this.life = DEFAULT_BULLET_LIFE * rangeMult;
    }
    update() {
      this.x += this.dx;
      this.y += this.dy;
      this.life--;
    }
  }

  // Bot class representing an autonomous helper that collects
  // resources on behalf of the player.  Bots can be of two types:
  // 'point' bots seek out fruit to add to the player's score and
  // 'ammo' bots seek out ammo pickups to add to the player's ammo.
  // Bots move at half the player's base speed and use very simple
  // pathfinding: they repeatedly move toward their current target item.
  class Bot {
    constructor(type) {
      this.type = type; // 'point' or 'ammo'
      // Start near the player so bots don’t spawn inside obstacles
      this.x = player ? player.x : Math.random() * WORLD_WIDTH;
      this.y = player ? player.y : Math.random() * WORLD_HEIGHT;
      this.radius = 0.5;
      // Move at half of the player's base speed; upgrades to player speed
      // do not affect bots.  Use a fixed speed to keep behaviour simple.
      this.speed = (6 / 60) * 0.5;
      // Colour indicates bot role: green for point gatherers, blue for ammo
      this.color = type === 'point' ? '#4CAF50' : '#2196F3';
      // Current target item that the bot is chasing
      this.target = null;
      // Track continuous contact with obstacles.  contactFrames
      // increments every frame while the bot overlaps any obstacle;
      // redirectAttempts records how many times we’ve redirected to
      // farther targets during the current contact streak.
      this.contactFrames = 0;
      this.redirectAttempts = 0;
    }
    // Find the nearest item of the bot's desired type
    findTarget() {
      let minDist = Infinity;
      let closest = null;
      for (const it of items) {
        if ((this.type === 'point' && it.type === 'fruit') ||
            (this.type === 'ammo' && it.type === 'ammo')) {
          const dist = Math.hypot(this.x - it.x, this.y - it.y);
          if (dist < minDist) {
            minDist = dist;
            closest = it;
          }
        }
      }
      this.target = closest;
    }
    // Move toward the current target.  Simple axis‑aligned movement with
    // obstacle avoidance similar to the player’s update() method.
    moveTowardsTarget() {
      if (!this.target) return;
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) return;
      const nx = dx / len;
      const ny = dy / len;
      const vx = nx * this.speed;
      const vy = ny * this.speed;
      // Determine whether moving along each axis would cause a collision
      const testX = this.x + vx;
      const blockedX = collidesWithObstacles(testX, this.y, this.radius);
      const testY = this.y + vy;
      const blockedY = collidesWithObstacles(this.x, testY, this.radius);
      // Apply movement if not blocked
      if (!blockedX) {
        this.x = testX;
      }
      if (!blockedY) {
        this.y = testY;
      }
      // If both axes are blocked, try moving perpendicular to avoid getting stuck
      if (blockedX && blockedY) {
        // A perpendicular direction vector to (nx, ny) is (-ny, nx)
        const perpX = -ny;
        const perpY = nx;
        // First try the positive perpendicular direction
        let altX = this.x + perpX * this.speed;
        let altY = this.y + perpY * this.speed;
        let moved = false;
        if (!collidesWithObstacles(altX, this.y, this.radius)) {
          this.x = altX;
          moved = true;
        }
        if (!collidesWithObstacles(this.x, altY, this.radius)) {
          this.y = altY;
          moved = true;
        }
        // If still stuck, try the opposite perpendicular direction
        if (!moved) {
          altX = this.x - perpX * this.speed;
          altY = this.y - perpY * this.speed;
          if (!collidesWithObstacles(altX, this.y, this.radius)) {
            this.x = altX;
            moved = true;
          }
          if (!collidesWithObstacles(this.x, altY, this.radius)) {
            this.y = altY;
            moved = true;
          }
        }
      }
      // Clamp to world boundaries
      this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));
    }
    update() {
      // Acquire a new target if none or if the current one has been collected
      if (!this.target || !items.includes(this.target)) {
        this.findTarget();
      }
      // Move toward target
      if (this.target) this.moveTowardsTarget();
      // Handle obstacle contact: if the bot touches an obstacle for
      // longer than OBSTACLE_CONTACT_THRESHOLD frames, redirect to a
      // farther item.  Each subsequent multiple of the threshold
      // redirects to the next farthest.
      const touching = collidesWithObstacles(this.x, this.y, this.radius);
      if (touching) {
        this.contactFrames++;
        const threshold = OBSTACLE_CONTACT_THRESHOLD;
        if (this.contactFrames >= (this.redirectAttempts + 1) * threshold) {
          this.redirectAttempts++;
          // Choose the (redirectAttempts + 1)th farthest target (1 => farthest)
          const rank = this.redirectAttempts + 1;
          const newTarget = this.findFarthestTarget(rank);
          if (newTarget) {
            this.target = newTarget;
          }
        }
      } else {
        // Reset contact tracking when not touching obstacles
        this.contactFrames = 0;
        this.redirectAttempts = 0;
      }
      // Check if bot collides with its target; if so, collect it for the
      // player and reset target so another can be found next frame
      if (this.target) {
        const dist = Math.hypot(this.x - this.target.x, this.y - this.target.y);
        if (dist < this.radius + this.target.radius) {
          // Remove the item from the items array
          const index = items.indexOf(this.target);
          if (index !== -1) items.splice(index, 1);
          // Apply the effect: if fruit, add to score; if ammo, add ammo
          if (this.target.type === 'fruit') {
            player.score += this.target.level;
            const newEarned = Math.floor(player.score / 20);
            if (newEarned > player.totalUpgradePointsEarned) {
              player.totalUpgradePointsEarned = newEarned;
            }
            scoreValue.textContent = 'Score: ' + Math.floor(player.score);
          } else if (this.target.type === 'ammo') {
            player.ammo += this.target.amount;
            ammoValue.textContent = 'Ammo: ' + player.ammo;
          }
          // Clear target and reset contact tracking
          this.target = null;
          this.contactFrames = 0;
          this.redirectAttempts = 0;
        }
      }
    }

    // Find the n-th farthest item of the desired type (fruit or ammo).
    // The farthest item has rank 1, second farthest rank 2, etc.  If
    // there are fewer than n items, returns the farthest available.
    findFarthestTarget(rank) {
      const candidates = [];
      for (const it of items) {
        if ((this.type === 'point' && it.type === 'fruit') ||
            (this.type === 'ammo' && it.type === 'ammo')) {
          const dist = Math.hypot(this.x - it.x, this.y - it.y);
          candidates.push({ item: it, dist });
        }
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.dist - a.dist);
      const idx = Math.min(rank - 1, candidates.length - 1);
      return candidates[idx].item;
    }
  }

  // Purchase a new bot of the specified type if the player has enough
  // score and we haven't exceeded the maximum number of bots.  Deducts
  // BOT_COST from the player's score and recalculates upgrade points.
  function buyBot(botType) {
    if (!player) return;
    if (bots.length >= MAX_BOTS) return;
    if (player.score < BOT_COST) return;
    // Deduct score and update total upgrade points earned based on new score
    player.score -= BOT_COST;
    scoreValue.textContent = 'Score: ' + Math.floor(player.score);
    // Recalculate upgrade points and available upgrades
    player.totalUpgradePointsEarned = Math.floor(player.score / 20);
    // Create and add bot
    const b = new Bot(botType);
    // Make sure the bot doesn’t spawn inside an obstacle
    let tries = 0;
    while (collidesWithObstacles(b.x, b.y, b.radius) && tries < 20) {
      b.x = player.x;
      b.y = player.y;
      tries++;
    }
    bots.push(b);
    // Update bots UI line
    updateBotsDisplay();
  }

  // Update the bots line in the scoreboard.  Shows total number of bots
  // and a breakdown by type.
  function updateBotsDisplay() {
    const pointCount = bots.filter(b => b.type === 'point').length;
    const ammoCount = bots.filter(b => b.type === 'ammo').length;
    botsValue.textContent = 'Bots: ' + bots.length + ' (P:' + pointCount + ', A:' + ammoCount + ')';
  }

  // Fire a bullet if the player has ammunition and a facing direction
  function shoot() {
    if (!gameRunning || !player) return;
    if (player.ammo <= 0) return;
    const dirLen = Math.hypot(player.facingX, player.facingY);
    if (dirLen < 0.001) return;
    bullets.push(new Bullet(
      player.x,
      player.y,
      player.facingX,
      player.facingY,
      player.bulletSpeedMultiplier,
      player.bulletRangeMultiplier
    ));
    player.ammo--;
    ammoValue.textContent = 'Ammo: ' + player.ammo;
  }

  // Start the game
  function startGame() {
    const name = nameInput.value.trim() || undefined;
    player = new Player(name);
    // Reset item list and scores
    items = [];
    bots = [];
    scoreValue.textContent = 'Score: 0';
    ammoValue.textContent = 'Ammo: 0';
    healthValue.textContent = 'Health: ' + Math.floor(player.health) + '/' + Math.floor(player.maxHealth);
    upgradePtsValue.textContent = 'Upgrade Pts: 0';
    upgradeList.innerHTML = '';
    botsValue.textContent = 'Bots: 0 (P:0, A:0)';
    gameRunning = true;
    // Hide UI elements
    nameInput.style.display = 'none';
    startBtn.style.display = 'none';
    fireBtn.style.display = 'inline-block';
    statusText.textContent = '';
    // Spawn initial fruits
    for (let i = 0; i < 10; i++) spawnItem();
    spawnIntervalId = setInterval(spawnItem, ITEM_SPAWN_INTERVAL);
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

  // Upgrade handling.  Apply an upgrade if the player has spare upgrade
  // points.  Each upgrade increases a corresponding multiplier or
  // statistic.  Upgrades cost one point each.  We use multiplicative
  // increases so successive upgrades have a diminishing return.
  function applyUpgrade(type) {
    if (!player) return;
    const available = player.totalUpgradePointsEarned - player.upgradePointsSpent;
    if (available <= 0) return;
    switch (type) {
      case 'bulletSpeed': {
        // Increase bullet speed by the current increment
        const inc = player.upgradeIncrement.bulletSpeed;
        player.bulletSpeedMultiplier += inc;
        player.upgrades.bulletSpeed++;
        // Prepare next increment (diminishing returns)
        player.upgradeIncrement.bulletSpeed *= 0.75;
        break;
      }
      case 'bulletRange': {
        const inc = player.upgradeIncrement.bulletRange;
        player.bulletRangeMultiplier += inc;
        player.upgrades.bulletRange++;
        player.upgradeIncrement.bulletRange *= 0.75;
        break;
      }
      case 'health': {
        const inc = player.upgradeIncrement.health;
        player.maxHealth += inc;
        player.health = player.maxHealth;
        player.upgrades.health++;
        player.upgradeIncrement.health *= 0.75;
        // Update health display immediately
        healthValue.textContent = 'Health: ' + Math.floor(player.health) + '/' + Math.floor(player.maxHealth);
        break;
      }
      case 'speed': {
        const inc = player.upgradeIncrement.speed;
        player.speedMultiplier += inc;
        player.upgrades.speed++;
        player.upgradeIncrement.speed *= 0.75;
        break;
      }
      default:
        return;
    }
    // Consume one upgrade point
    player.upgradePointsSpent++;
    upgradePtsValue.textContent = 'Upgrade Pts: ' + (player.totalUpgradePointsEarned - player.upgradePointsSpent);
  }

  // Key bindings for upgrades.  Press 1–4 to spend an upgrade point on a
  // specific upgrade.  Prevent default so the page doesn’t scroll on
  // mobile when pressing keys.
  window.addEventListener('keydown', (e) => {
    if (!gameRunning || !player) return;
    if (e.key === '1') {
      applyUpgrade('bulletSpeed');
      e.preventDefault();
    } else if (e.key === '2') {
      applyUpgrade('bulletRange');
      e.preventDefault();
    } else if (e.key === '3') {
      applyUpgrade('health');
      e.preventDefault();
    } else if (e.key === '4') {
      applyUpgrade('speed');
      e.preventDefault();
    } else if (e.key === '5') {
      // Purchase a point‑gathering bot if possible
      buyBot('point');
      e.preventDefault();
    } else if (e.key === '6') {
      // Purchase an ammo‑gathering bot if possible
      buyBot('ammo');
      e.preventDefault();
    }
  }, true);

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
    // Convert to world coords relative to camera.  Use the view window
    // dimensions to compute scale so only a 100×100 block window is
    // visible regardless of screen size.
    const scaleX = canvas.width / (VIEW_WIDTH_BLOCKS * CELL_SIZE);
    const scaleY = canvas.height / (VIEW_HEIGHT_BLOCKS * CELL_SIZE);
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
        // Remove bullet if expired, outside bounds or hitting obstacle
        if (
          b.life <= 0 ||
          b.x < 0 || b.x > WORLD_WIDTH ||
          b.y < 0 || b.y > WORLD_HEIGHT ||
          collidesWithObstacles(b.x, b.y, b.radius)
        ) {
          bullets.splice(i, 1);
        }
      }
      // Collision with items (fruit or ammo)
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const dist = Math.hypot(player.x - it.x, player.y - it.y);
        if (dist < player.radius + it.radius) {
          items.splice(i, 1);
          if (it.type === 'fruit') {
            // Fruits award points equal to their level
            player.score += it.level;
            // Update total upgrade points earned based on score
            const newEarned = Math.floor(player.score / 20);
            if (newEarned > player.totalUpgradePointsEarned) {
              player.totalUpgradePointsEarned = newEarned;
            }
            scoreValue.textContent = 'Score: ' + Math.floor(player.score);
          } else if (it.type === 'ammo') {
            // Ammo pickups grant extra ammunition
            player.ammo += it.amount;
            ammoValue.textContent = 'Ammo: ' + player.ammo;
          }
        }
      }

      // Update bots: each bot moves toward its target and collects items
      for (const bot of bots) {
        bot.update();
      }
      // Update available upgrade points display.  The number of
      // available points is totalEarned minus points spent.  If
      // available > 0 we update the UI list to remind players of the
      // upgrade keys; otherwise clear the list.
      const availablePts = player.totalUpgradePointsEarned - player.upgradePointsSpent;
      upgradePtsValue.textContent = 'Upgrade Pts: ' + availablePts;
      healthValue.textContent = 'Health: ' + Math.floor(player.health) + '/' + Math.floor(player.maxHealth);
      // Build a list of instructions for upgrades if there are points
      let instructions = '';
      if (availablePts > 0) {
        instructions += '<p><strong>Upgrade Options</strong> (press key to apply):</p>';
        instructions += '<p>1: Bullet Speed (lvl ' + player.upgrades.bulletSpeed + ')</p>';
        instructions += '<p>2: Bullet Range (lvl ' + player.upgrades.bulletRange + ')</p>';
        instructions += '<p>3: Health (lvl ' + player.upgrades.health + ')</p>';
        instructions += '<p>4: Speed (lvl ' + player.upgrades.speed + ')</p>';
      }
      // Bot purchase instructions if the player can afford one and bot limit not reached
      const botCanBuy = player.score >= BOT_COST && bots.length < MAX_BOTS;
      if (botCanBuy) {
        instructions += '<p><strong>Bot Options</strong> (cost ' + BOT_COST + ' points each):</p>';
        instructions += '<p>5: Point Bot (' + bots.filter(b => b.type === 'point').length + ' owned)</p>';
        instructions += '<p>6: Ammo Bot (' + bots.filter(b => b.type === 'ammo').length + ' owned)</p>';
      }
      upgradeList.innerHTML = instructions;
      // Always update bots line each frame
      updateBotsDisplay();
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
    const scaleX = canvas.width / (VIEW_WIDTH_BLOCKS * CELL_SIZE);
    const scaleY = canvas.height / (VIEW_HEIGHT_BLOCKS * CELL_SIZE);
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
    // Draw obstacles behind everything else.  Rectangular obstacles are
    // drawn as rectangles; circular ones are drawn as discs.
    obstacles.forEach((ob) => {
      ctx.fillStyle = '#999';
      if (ob.type === 'rect') {
        const ox = ob.x * CELL_SIZE * scale + offsetX;
        const oy = ob.y * CELL_SIZE * scale + offsetY;
        const ow = ob.width * CELL_SIZE * scale;
        const oh = ob.height * CELL_SIZE * scale;
        ctx.fillRect(ox, oy, ow, oh);
      } else if (ob.type === 'circle') {
        const ox = ob.cx * CELL_SIZE * scale + offsetX;
        const oy = ob.cy * CELL_SIZE * scale + offsetY;
        const rad = ob.radius * CELL_SIZE * scale;
        ctx.beginPath();
        ctx.arc(ox, oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Draw items (fruit and ammo).  Fruit are circles; ammo pickups
    // are drawn as diamond shapes so they stand out from fruit.
    items.forEach((it) => {
      const sx = it.x * CELL_SIZE * scale + offsetX;
      const sy = it.y * CELL_SIZE * scale + offsetY;
      const radius = it.radius * CELL_SIZE * scale;
      ctx.fillStyle = it.color;
      if (it.type === 'fruit') {
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.type === 'ammo') {
        // Draw diamond (rotated square)
        ctx.beginPath();
        ctx.moveTo(sx, sy - radius);
        ctx.lineTo(sx + radius, sy);
        ctx.lineTo(sx, sy + radius);
        ctx.lineTo(sx - radius, sy);
        ctx.closePath();
        ctx.fill();
      }
    });
    // Draw bots as coloured circles.  Size is based on their radius.
    bots.forEach((bot) => {
      const bx = bot.x * CELL_SIZE * scale + offsetX;
      const by = bot.y * CELL_SIZE * scale + offsetY;
      const br = bot.radius * CELL_SIZE * scale;
      ctx.beginPath();
      ctx.fillStyle = bot.color;
      ctx.arc(bx, by, br, 0, Math.PI * 2);
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