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

  // Progress bar DOM element.  We update its width as the timer
  // advances toward spawning an additional enemy bot.
  const progressBarEl = document.getElementById('progress-bar');

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
  // Keep a base interval for item spawns so we can adjust the rate
  // between rounds.  Each new round decreases the interval by 10%
  // (increasing spawn rate).  We copy this value into
  // currentItemSpawnInterval when the game starts and update it
  // whenever the round level increases.
  const BASE_ITEM_SPAWN_INTERVAL = ITEM_SPAWN_INTERVAL;
  let currentItemSpawnInterval = BASE_ITEM_SPAWN_INTERVAL;
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
  // Base bullet speed is doubled for faster projectiles
  // Base bullet speed.  Doubling this value makes projectiles
  // noticeably faster than in the previous version.  Shots still
  // respect range multipliers and will despawn at the map edge.
  const DEFAULT_BULLET_SPEED = 48 / 60;
  const DEFAULT_BULLET_LIFE = 180; // frames

  // Damage dealt to the target bot when hit by a bullet.  Health
  // decreases by this amount per hit.  Adjust this value for
  // balancing; currently each hit removes 10 health from the
  // target practice bot.
  // Base damage dealt by the player's bullets.  Each hit removes this
  // many health points when the bullet damage multiplier is 1.  This
  // value can be increased via the bullet damage upgrade.  Bullets
  // multiply this by the player's bulletDamageMultiplier to compute
  // their damage when they are created.
  const BASE_BULLET_DAMAGE = 20;

  // When bots collide with an obstacle continuously, they will
  // redirect their attention to further‑away items.  This constant
  // defines how many update frames constitute approximately three
  // seconds (assuming ~60 FPS).  After contactFrames crosses this
  // threshold the bot will select the next farthest target.
  const OBSTACLE_CONTACT_THRESHOLD = 60 * 3;

  // If a bot remains stationary (no movement) for longer than this
  // many frames (~10 seconds at 60 FPS) it will be respawned at a
  // random location on the map.  This prevents bots from remaining
  // permanently stuck.
  const BOT_STALL_FRAMES = 60 * 10;

  // If a bot does not collect any points for this many frames (~15 seconds
  // at 60 FPS) it will be respawned near the player.  This ensures
  // bots that wander off or become ineffective are recycled closer
  // to the action.  Points are only awarded when a bot collects a
  // fruit, not when collecting ammo.
  const BOT_POINTS_TIMEOUT_FRAMES = 60 * 25;

  // Points (fruit) or ammo pickups that persist longer than this will be
  // removed from the world to prevent clutter.  120 seconds at 60 FPS.
  const DESPAWN_FRAMES = 60 * 120;

  // Track global frame count so we can time despawns and other
  // long‑running behaviours.  This increments once per update.
  let frameCount = 0;

  // Speed boost configuration.  Only one speed boost can exist at a
  // time.  When collected, it doubles the player's speed for 3
  // seconds.  After collection there is a 5‑second delay before
  // another boost spawns.
  // Duration of the speed boost effect in frames.  Increase from
  // 3 seconds to 5 seconds (5*60 frames) so that the boost lasts
  // longer and provides a more pronounced speed advantage.
  const SPEED_BOOST_DURATION_FRAMES = 60 * 5;
  const SPEED_BOOST_RESPAWN_FRAMES = 60 * 5;
  let speedBoost = null;
  let nextSpeedBoostFrame = 0;

  // Health boost configuration.  Only one health boost can exist at a
  // time.  When collected, it increases the player's health by
  // HEALTH_BOOST_AMOUNT up to their maximum.  After collection there
  // is a 5‑second delay before another boost spawns.
  const HEALTH_BOOST_AMOUNT = 15;
  const HEALTH_BOOST_RESPAWN_FRAMES = 60 * 5;
  let healthBoost = null;
  let nextHealthBoostFrame = 0;

  // Progress bar tracking.  The bar fills over three minutes (180
  // seconds) and spawns an additional enemy bot when full.  We
  // track how many frames have elapsed and whether the additional
  // bot has been spawned in this round.  The duration is reduced
  // to 1.5 minutes (90 seconds) as rounds get shorter.
  const PROGRESS_BAR_FRAMES = 60 * 90;
  let progressFrame = 0;
  let progressBotSpawned = false;

  // The current round of the game.  Rounds begin at 1 and
  // increment each time the progress bar fills.  Each round
  // increases the number of chasing bots and their health as well
  // as increasing the spawn rate of fruit and ammo pickups.  The
  // round is displayed in the scoreboard so players can track
  // their progress.
  let roundLevel = 1;

  // End the game when the player runs out of health.  This stops the
  // update loop from processing gameplay, cancels item spawning and
  // shows a game over message with instructions to restart.  The
  // player's stats remain visible until the page is refreshed or the
  // game is restarted.
  function gameOver() {
    gameRunning = false;
    // Cancel item spawning
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    // Stop progress bar updates
    progressFrame = 0;
    if (progressBarEl) progressBarEl.style.width = '0%';
    // Show UI controls again
    startBtn.style.display = 'inline-block';
    nameInput.style.display = 'inline-block';
    fireBtn.style.display = 'none';
    // Display game over status with round reached
    statusText.textContent = 'Game Over! You reached Round ' + roundLevel + '. Click Start to play again.';
  }

  // Start a new round.  Each round adds an additional chasing
  // enemy bot, increases the health of all existing enemies, and
  // speeds up item spawning.  The progress bar resets and the
  // round counter increments.  This function is called when the
  // progress bar fills.  It also updates the UI to reflect the
  // current round and refreshes the item spawn interval.
  function startNewRound() {
    roundLevel++;
    progressFrame = 0;
    if (progressBarEl) progressBarEl.style.width = '0%';
    // Increase the health of existing enemies by 20 per round
    for (const enemy of targetBots) {
      enemy.maxHealth += 20;
      enemy.health += 20;
    }
    // Spawn one new enemy with health equal to the player's max
    // health plus 20 for each completed round (roundLevel-1).  This
    // ensures new enemies scale with the player's capabilities while
    // growing stronger over time.  Place the enemy at a random safe
    // location on the map.
    const newEnemy = new TargetBot();
    // Set the enemy's max health based on player's health and round
    newEnemy.maxHealth = player ? player.maxHealth + 20 * (roundLevel - 1) : 100;
    newEnemy.health = newEnemy.maxHealth;
    targetBots.push(newEnemy);
    // Adjust item spawn interval: reduce by 10% for higher rounds
    currentItemSpawnInterval *= 0.9;
    // Clear previous interval and schedule new spawns
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    spawnIntervalId = setInterval(spawnItem, currentItemSpawnInterval);
    // Update round display in UI
    const roundEl = document.getElementById('round-value');
    if (roundEl) roundEl.textContent = 'Round: ' + roundLevel;
    // Reset the flag so additional bots can be spawned next time
    progressBotSpawned = false;
  }

  // Compute the score threshold needed to reach the next level.  The
  // first level requires 20 points.  Each subsequent level requires
  // an additional 22 points beyond the previous threshold.  This
  // yields thresholds of 20, 42, 64, 86, etc.
  function nextLevelThreshold(currentLevel) {
    return 20 + currentLevel * 22;
  }

  let gameRunning = false;
  let player = null;
  // Items array holds both fruit and ammo pickups.  Each item has a
  // `type` property set to either 'fruit' or 'ammo'.
  let items = [];
  let spawnIntervalId = null;

  // Obstacles and bullets
  let obstacles = [];
  let bullets = [];

  // A single AI bot used for target practice.  This enemy runs
  // away from the player and nearby obstacles, has its own health
  // bar, and can be shot by the player.  It is spawned at the start
  // of each game and exists until its health drops to zero.
  let targetBots = [];

  // Autonomous bots purchased by the player.  Bots will collect
  // resources on the player's behalf.  A maximum of 5 bots are
  // allowed.  Each bot costs 45 score points to purchase.
  let bots = [];
  const MAX_BOTS = 5;
  // Bots now cost upgrade points instead of score.  Each bot costs
  // two upgrade points to purchase.
  const BOT_COST = 2;

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
      // Double the player's size again for improved visibility.  The
      // player originally had a radius of ~0.8.  One doubling was
      // applied in a previous iteration (1.6).  We apply another
      // doubling here to 3.2 units to satisfy the requirement.
      this.radius = 3.2;
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
      // Multiplier applied to the base bullet damage.  Starts at 1
      // (no increase).  Each bullet damage upgrade increases this
      // multiplier by the current increment value in
      // upgradeIncrement.bulletDamage.  Bullets copy this multiplier
      // when created to determine their damage.
      this.bulletDamageMultiplier = 1;
      // Leveling system.  The player gains one level (and an upgrade
      // point) for every 20 points earned.  upgradePointsEarned counts
      // total points gained from leveling; upgradePointsSpent counts
      // how many points have been spent on upgrades or bots.
      this.level = 0;
      this.upgradePointsEarned = 0;
      this.upgradePointsSpent = 0;
      this.upgrades = {
        bulletSpeed: 0,
        bulletRange: 0,
        health: 0,
        speed: 0,
        bulletDamage: 0,
      };
      // Frames remaining for an active speed boost.  When >0 the
      // player's speed is doubled.  Decremented each update.
      this.speedBoostFrames = 0;

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
        bulletDamage: 0.2,
      };
    }
    randomColor() {
      const hue = Math.floor(Math.random() * 360);
      return `hsl(${hue},70%,60%)`;
    }
    update() {
      const len = Math.hypot(this.dirX, this.dirY);
      // The player's facing direction is controlled via mouse
      // movements (see the mousemove handler).  We no longer
      // automatically update facing based on movement keys so that
      // shooting direction can be independent of movement.
      // Move separately along x and y axes to handle obstacle collisions
      if (len > 0) {
        // Recompute current speed from baseSpeed and multiplier in case
        // upgrades have changed it.
        // Apply speed boost if active.  When speedBoostFrames > 0 the
        // player moves twice as fast.
        const boostFactor = this.speedBoostFrames > 0 ? 2 : 1;
        this.speed = this.baseSpeed * this.speedMultiplier * boostFactor;
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
      // Decrement speed boost timer
      if (this.speedBoostFrames > 0) this.speedBoostFrames--;
    }
  }

  // Fruit class representing score‑granting items.  Fruit come in
  // levels 1–3; higher level fruit are larger and worth more points.
  class Fruit {
    constructor(level) {
      this.id = generateId();
      this.type = 'fruit';
      // Level of the fruit (1–3).  Points awarded are based on level:
      // level 1 = 1 point, level 2 = 3 points, level 3 = 6 points.
      this.level = level;
      this.points = {1: 1, 2: 3, 3: 6}[level] || 1;
      // Double the size of fruit for better visibility.  Levels scale
      // proportionally.
      // Double the radii relative to the previous iteration.  Levels
      // scale proportionally, making fruit easier to see on the
      // larger map.  The original radii were 0.8, 1.2 and 1.6; we
      // double those values here.
      const radii = {1: 1.6, 2: 2.4, 3: 3.2};
      this.radius = radii[level] || 1.6;
      // Position will be assigned by the spawn function to avoid obstacles.
      this.x = 0;
      this.y = 0;
      // Colours for each level.  Level one is green, two is yellow, three red.
      const colours = {1: '#7DBE31', 2: '#FDB827', 3: '#D72631'};
      this.color = colours[level] || '#888888';
      // Record the frame this fruit was spawned for despawning.
      this.spawnFrame = frameCount;
    }
  }

  // Ammo pickup class.  Ammo pickups grant the player additional
  // ammunition but no score.  There are four sizes (1, 3, 5 and 10
  // ammo) and rarer, larger pickups are less common.  Each size has
  // its own colour and radius so players can easily tell them apart.
  class AmmoPickup {
    constructor(level) {
      this.id = generateId();
      this.type = 'ammo';
      // Level of ammo (1–3).  Amount of ammo awarded equals level.
      this.level = level;
      this.amount = level;
      // Double sizes for visibility and differentiate by level.  We use
      // slightly smaller radii than fruit so they still look distinct.
      // Double the radii relative to the previous iteration.  The
      // original values were 0.7, 1.0 and 1.4; these are doubled to
      // increase visibility and maintain distinction from fruit.
      const radii = {1: 1.4, 2: 2.0, 3: 2.8};
      this.radius = radii[level] || 1.4;
      // Position will be assigned by the spawn function.
      this.x = 0;
      this.y = 0;
      // Colours for ammo levels: blue, purple, teal.
      const colours = {1: '#268BDC', 2: '#925AA3', 3: '#3AAFA9'};
      this.color = colours[level] || '#268BDC';
      // Spawn frame for despawn timing.
      this.spawnFrame = frameCount;
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
    // Decide whether to spawn fruit or ammo.  60% fruit, 40% ammo unless
    // one type has reached its limit.
    let spawnType;
    if (fruitCount >= MAX_FRUIT_COUNT) spawnType = 'ammo';
    else if (ammoCount >= MAX_AMMO_COUNT) spawnType = 'fruit';
    else spawnType = Math.random() < 0.6 ? 'fruit' : 'ammo';
    let level;
    // Choose level based on rarity: level1 common, level2 less common,
    // level3 rare.  We use a random number to decide.
    const r = Math.random();
    if (r < 0.6) level = 1;
    else if (r < 0.9) level = 2;
    else level = 3;
    let item;
    let attempts = 0;
    while (attempts < 100) {
      item = spawnType === 'fruit' ? new Fruit(level) : new AmmoPickup(level);
      // Assign random position within world boundaries
      item.x = Math.random() * (WORLD_WIDTH - 2 * item.radius) + item.radius;
      item.y = Math.random() * (WORLD_HEIGHT - 2 * item.radius) + item.radius;
      // Check collision with obstacles
      if (!collidesWithObstacles(item.x, item.y, item.radius)) {
        items.push(item);
        break;
      }
      attempts++;
    }
  }

  // Spawn a speed boost item at a random safe location.  Only one
  // speed boost can exist at a time.  The item has a fixed size and
  // uses a lightning bolt shape when drawn.  We attempt to find a
  // location outside obstacles; if unsuccessful after many tries we
  // simply skip spawning.
  function spawnSpeedBoost() {
    // Increase the radius for the lightning bolt power‑up so it is
    // easier to see on the large map.
    const radius = 2.4; // doubled from 1.2
    let attempts = 0;
    let bx, by;
    while (attempts < 100) {
      bx = Math.random() * (WORLD_WIDTH - 2 * radius) + radius;
      by = Math.random() * (WORLD_HEIGHT - 2 * radius) + radius;
      if (!collidesWithObstacles(bx, by, radius)) {
        speedBoost = { x: bx, y: by, radius: radius, spawnFrame: frameCount };
        return;
      }
      attempts++;
    }
    // If we failed to find a spot, leave speedBoost null and try later
  }

  // Spawn a health boost item at a random safe location.  Only one
  // health boost can exist at a time.  The boost has a fixed size
  // and is represented as a red plus sign when drawn.  We attempt
  // to find a location outside obstacles; if unsuccessful after
  // several tries we skip spawning until the next frame.
  function spawnHealthBoost() {
    const radius = 2.4;
    let attempts = 0;
    let hx, hy;
    while (attempts < 100) {
      hx = Math.random() * (WORLD_WIDTH - 2 * radius) + radius;
      hy = Math.random() * (WORLD_HEIGHT - 2 * radius) + radius;
      if (!collidesWithObstacles(hx, hy, radius)) {
        healthBoost = { x: hx, y: hy, radius: radius, spawnFrame: frameCount };
        return;
      }
      attempts++;
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
      // Randomly choose obstacle type: 40% rectangles, 30% circles, 30% ellipses
      const r = Math.random();
      if (r < 0.4) {
        // Rectangle obstacle
        const w = Math.random() * 8 + 4; // width between 4 and 12
        const h = Math.random() * 8 + 4; // height between 4 and 12
        const x = Math.random() * (WORLD_WIDTH - w);
        const y = Math.random() * (WORLD_HEIGHT - h);
        obstacles.push({ type: 'rect', x, y, width: w, height: h });
      } else if (r < 0.7) {
        // Circle obstacle
        const rad = Math.random() * 4 + 2;
        const cx = Math.random() * (WORLD_WIDTH - 2 * rad) + rad;
        const cy = Math.random() * (WORLD_HEIGHT - 2 * rad) + rad;
        obstacles.push({ type: 'circle', cx, cy, radius: rad });
      } else {
        // Ellipse obstacle with different radii in x and y
        const rx = Math.random() * 5 + 3; // between 3 and 8
        const ry = Math.random() * 5 + 3;
        const cx = Math.random() * (WORLD_WIDTH - 2 * rx) + rx;
        const cy = Math.random() * (WORLD_HEIGHT - 2 * ry) + ry;
        obstacles.push({ type: 'ellipse', cx, cy, rx, ry });
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
      } else if (ob.type === 'ellipse') {
        const dx = cx - ob.cx;
        const dy = cy - ob.cy;
        // Use the sum of radii in each axis to approximate collision
        const rxSum = ob.rx + radius;
        const rySum = ob.ry + radius;
        if ((dx * dx) / (rxSum * rxSum) + (dy * dy) / (rySum * rySum) < 1) {
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
    constructor(px, py, dirX, dirY, speedMult, rangeMult, damageMult) {
      // Normalise direction
      const len = Math.hypot(dirX, dirY);
      const nx = dirX / len;
      const ny = dirY / len;
      const startOffset = player.radius + 0.2;
      this.x = px + nx * startOffset;
      this.y = py + ny * startOffset;
      this.dx = nx * (DEFAULT_BULLET_SPEED * speedMult);
      this.dy = ny * (DEFAULT_BULLET_SPEED * speedMult);
      // Bullets are larger for better visibility.  We double the
      // previous radius so shots are easier to see and to reflect
      // the increased lethality implied by faster projectiles.
      this.radius = 0.6;
      this.life = DEFAULT_BULLET_LIFE * rangeMult;
      // Damage is based on the base bullet damage and the damage
      // multiplier at the time of firing.  Store this so the damage
      // remains consistent even if the player upgrades mid‑flight.
      this.damage = BASE_BULLET_DAMAGE * damageMult;
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
      // When a bot becomes stuck (no movement after an update), it will
      // reroute to increasingly farther items.  rerouteRank starts at 2
      // so the first reroute selects the 2nd farthest item.  Each
      // subsequent reroute increments this rank.  Once the bot moves
      // again, the rank resets to 2.
      this.rerouteRank = 2;
      // Count how many consecutive frames the bot has not moved.
      // If this reaches BOT_STALL_FRAMES the bot will be respawned
      // somewhere else on the map.  This prevents bots from
      // remaining stuck indefinitely.  See update() for logic.
      this.stalledFrames = 0;

      // Total points (fruit levels) collected by this bot.  Used
      // primarily to track activity and could be displayed in the
      // future.  Each time the bot collects a fruit this counter
      // increments by the fruit’s level.
      this.pointsCollected = 0;
      // Frames since the bot last collected a fruit.  If this counter
      // exceeds BOT_POINTS_TIMEOUT_FRAMES the bot is considered idle
      // and will be respawned near the player.
      this.framesSinceLastCollection = 0;
    }
    // Find the nearest item of the bot's desired type
    findTarget() {
      let minDist = Infinity;
      let closest = null;
      for (const it of items) {
        if ((this.type === 'point' && it.type === 'fruit') ||
            (this.type === 'ammo' && it.type === 'ammo')) {
          // Skip items currently targeted by other bots to prevent
          // multiple bots from chasing the same pickup
          let reserved = false;
          for (const other of bots) {
            if (other !== this && other.target === it) {
              reserved = true;
              break;
            }
          }
          if (reserved) continue;
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
    // Move in a specified direction (dx, dy) by this.speed while
    // avoiding obstacles.  The vector does not need to point to a
    // particular target; it merely guides movement.
    moveInDirection(dirX, dirY) {
      const len = Math.hypot(dirX, dirY);
      if (len < 0.001) return;
      const nx = dirX / len;
      const ny = dirY / len;
      const vx = nx * this.speed;
      const vy = ny * this.speed;
      const testX = this.x + vx;
      const blockedX = collidesWithObstacles(testX, this.y, this.radius);
      const testY = this.y + vy;
      const blockedY = collidesWithObstacles(this.x, testY, this.radius);
      if (!blockedX) {
        this.x = testX;
      }
      if (!blockedY) {
        this.y = testY;
      }
      // If both axes are blocked, try moving perpendicular
      if (blockedX && blockedY) {
        const perpX = -ny;
        const perpY = nx;
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
      // Acquire a new target if none exists or if the current one was removed
      if (!this.target || !items.includes(this.target)) {
        this.findTarget();
      }
      // Increase the idle frame counter every update.  This will be
      // reset to zero whenever the bot collects a fruit.
      this.framesSinceLastCollection++;
      // If the bot hasn’t collected any points for too long, respawn
      // it near the player to keep it useful.  After respawn, reset
      // reroute and stall counters and clear its current target.  We
      // also reset framesSinceLastCollection.  Position the bot at
      // the player’s current location and, if necessary, adjust to
      // avoid spawning inside an obstacle.
      if (this.framesSinceLastCollection >= BOT_POINTS_TIMEOUT_FRAMES) {
        if (player) {
          this.x = player.x;
          this.y = player.y;
          // Ensure not inside an obstacle by nudging randomly
          let attempts = 0;
          while (collidesWithObstacles(this.x, this.y, this.radius) && attempts < 20) {
            this.x = player.x + (Math.random() - 0.5) * 2;
            this.y = player.y + (Math.random() - 0.5) * 2;
            attempts++;
          }
        }
        this.framesSinceLastCollection = 0;
        this.stalledFrames = 0;
        this.rerouteRank = 2;
        this.target = null;
      }
      // If there is a target, attempt to move toward it
      if (this.target) {
        // Record previous position to detect movement
        const prevX = this.x;
        const prevY = this.y;
        // Move toward the current target
        this.moveTowardsTarget();
        // Determine how far we moved this frame
        const delta = Math.hypot(this.x - prevX, this.y - prevY);
        // If movement is effectively zero, we’re stuck; pick a farther target
        if (delta < this.speed * 0.01) {
          // Bot did not move this frame; increment stalled frames
          this.stalledFrames++;
          const newTarget = this.findFarthestTarget(this.rerouteRank);
          if (newTarget && newTarget !== this.target) {
            this.target = newTarget;
          }
          // Increase the rank so next time we go even further if still stuck
          this.rerouteRank++;
        } else {
          // We moved successfully; reset stalled frames and reroute rank
          this.stalledFrames = 0;
          this.rerouteRank = 2;
        }
        // If the bot has been stuck (no effective movement) for too long,
        // respawn it at a random safe location.  Reset its reroute rank
        // and clear its target so it will search anew.  We try up to
        // 50 random positions to avoid landing inside obstacles.  After
        // respawning, stalledFrames is reset.
        if (this.stalledFrames >= BOT_STALL_FRAMES) {
          let attempts = 0;
          do {
            this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
            this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
            attempts++;
          } while (collidesWithObstacles(this.x, this.y, this.radius) && attempts < 50);
          this.stalledFrames = 0;
          this.rerouteRank = 2;
          this.target = null;
        }
        // After movement (and possible rerouting), check if we reached the target
        const dist = Math.hypot(this.x - this.target.x, this.y - this.target.y);
        if (dist < this.radius + this.target.radius) {
          // Collect the item for the player
          const index = items.indexOf(this.target);
          if (index !== -1) items.splice(index, 1);
          if (this.target.type === 'fruit') {
            // Award points to the player equal to the fruit's value
            player.score += this.target.points;
            // Level up when the player's score crosses the next threshold.
            // Use the nextLevelThreshold function so that each
            // subsequent level requires an additional 22 points beyond
            // the previous threshold (e.g. 20, 42, 64, 86, ...).
            while (player.score >= nextLevelThreshold(player.level)) {
              player.level++;
              player.upgradePointsEarned++;
            }
            scoreValue.textContent = 'Score: ' + Math.floor(player.score);
            document.getElementById('level-value').textContent = 'Level: ' + player.level;
            // Track points collected by this bot and reset its idle counter
            this.pointsCollected += this.target.points;
            this.framesSinceLastCollection = 0;
          } else if (this.target.type === 'ammo') {
            player.ammo += this.target.amount;
            ammoValue.textContent = 'Ammo: ' + player.ammo;
            // Reset idle counter since ammo counts as activity
            this.framesSinceLastCollection = 0;
          }
          // Reset target and reroute rank after collecting
          this.target = null;
          this.rerouteRank = 2;
          this.stalledFrames = 0;
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
          // Skip items currently targeted by other bots
          let reserved = false;
          for (const other of bots) {
            if (other !== this && other.target === it) {
              reserved = true;
              break;
            }
          }
          if (reserved) continue;
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

  // Enemy bot used for target practice.  This bot runs away from
  // the player and from the nearest obstacle.  It spawns once at
  // game start and has its own health bar.  Bullets can damage this
  // bot.  The movement logic attempts to flee both the player and
  // nearby obstacles while avoiding collisions.
  class TargetBot {
    constructor() {
      // Spawn at a random safe location.  We'll retry until we
      // find a location that doesn't collide with an obstacle.
      this.radius = player ? player.radius : 3.2;
      let attempts = 0;
      do {
        this.x = Math.random() * (WORLD_WIDTH - 2 * this.radius) + this.radius;
        this.y = Math.random() * (WORLD_HEIGHT - 2 * this.radius) + this.radius;
        attempts++;
      } while (collidesWithObstacles(this.x, this.y, this.radius) && attempts < 50);
      // Colour and health bar
      this.color = '#ff9800';
      this.maxHealth = 100;
      this.health = this.maxHealth;
      // Use a speed equal to the player's base speed.  We'll update
      // this each frame to match the player's current speed
      this.speed = 6 / 60;

      // Cooldown timer for attacking the player.  When greater than 0,
      // the bot will not inflict damage on the player even if
      // touching.  This prevents health from draining continuously.
      this.attackCooldown = 0;

      // Track how many consecutive frames the bot has not moved.  If
      // this exceeds a threshold (15 seconds) the bot will be
      // repositioned to the opposite side of the map relative to
      // the player to prevent it from getting permanently stuck.
      this.stalledFrames = 0;

      // Reference position for stuck detection.  Each frame the
      // distance moved from this position is measured.  If the
      // distance remains below a threshold for many frames the bot
      // is considered stuck.  When significant movement occurs, the
      // reference is updated and the counter resets.
      this.stuckRefX = undefined;
      this.stuckRefY = undefined;
      this.stuckFrames = 0;
    }
    // Move in a specified direction while avoiding obstacles.  This
    // function is similar to the Bot's moveInDirection method.
    moveInDirection(dirX, dirY) {
      const len = Math.hypot(dirX, dirY);
      if (len < 0.001) return;
      const nx = dirX / len;
      const ny = dirY / len;
      const vx = nx * this.speed;
      const vy = ny * this.speed;
      // Try moving along x and y separately to handle collisions
      const testX = this.x + vx;
      const blockedX = collidesWithObstacles(testX, this.y, this.radius);
      const testY = this.y + vy;
      const blockedY = collidesWithObstacles(this.x, testY, this.radius);
      if (!blockedX) {
        this.x = testX;
      }
      if (!blockedY) {
        this.y = testY;
      }
      // If both directions are blocked, try perpendicular directions
      if (blockedX && blockedY) {
        const perpX = -ny;
        const perpY = nx;
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
      // Skip updates if there's no player or this bot is dead
      if (!player || this.health <= 0) return;
      // Update speed to match player's current speed (base * multiplier).
      this.speed = (6 / 60) * player.speedMultiplier;

      // Store previous position before movement to detect stalling
      const prevX = this.x;
      const prevY = this.y;

      // Compute a vector toward the player.  This bot always
      // attempts to chase the player.  We optionally apply a small
      // repulsive force away from the nearest obstacle so the bot
      // avoids hugging walls, but the repulsion weight and range are
      // tuned to ensure the bot will still collide with the player.
      let vx = player.x - this.x;
      let vy = player.y - this.y;
      const playerDist = Math.hypot(vx, vy);
      // Identify the nearest obstacle centre for repulsion
      let nearest = null;
      let minDist = Infinity;
      for (const ob of obstacles) {
        let cx, cy;
        if (ob.type === 'rect') {
          cx = ob.x + ob.width / 2;
          cy = ob.y + ob.height / 2;
        } else if (ob.type === 'circle') {
          cx = ob.cx;
          cy = ob.cy;
        } else if (ob.type === 'ellipse') {
          cx = ob.cx;
          cy = ob.cy;
        }
        const d = Math.hypot(this.x - cx, this.y - cy);
        if (d < minDist) {
          minDist = d;
          nearest = { cx, cy };
        }
      }
      if (nearest) {
        // Apply a very small repulsion only when far from the player.
        // The weight is low (0.15) and the condition is stricter than
        // before (6 radii) so that bots close in when near the player.
        if (playerDist > this.radius * 6) {
          vx += (this.x - nearest.cx) * 0.15;
          vy += (this.y - nearest.cy) * 0.15;
        }
      }
      // If the chase vector is nearly zero (bot on top of player),
      // choose a random direction to keep moving.  This helps break
      // out of exact overlaps.
      if (Math.hypot(vx, vy) < 0.001) {
        const angle = Math.random() * Math.PI * 2;
        vx = Math.cos(angle);
        vy = Math.sin(angle);
      }
      this.moveInDirection(vx, vy);

      // Stuck detection based on actual movement.  If the bot's
      // movement in this frame is extremely small relative to its
      // speed, count it as a stalled frame.  When the count exceeds
      // 15 seconds worth of frames, respawn the bot on the opposite
      // side of the map relative to the player.  This avoids
      // situations where the bot oscillates without making progress.
      const delta = Math.hypot(this.x - prevX, this.y - prevY);
      // Consider the bot stalled if it moved less than 10% of its
      // intended speed.  The factor 0.1 is chosen heuristically.
      if (delta < this.speed * 0.1) {
        this.stuckFrames++;
      } else {
        this.stuckFrames = 0;
      }
      const STUCK_FRAMES = 60 * 15;
      if (this.stuckFrames >= STUCK_FRAMES) {
        // Respawn on the opposite side of the map relative to the player
        let newX, newY;
        let attempts = 0;
        while (attempts < 50) {
          const xSide = player.x < WORLD_WIDTH / 2 ? [0.75, 0.95] : [0.05, 0.25];
          const ySide = player.y < WORLD_HEIGHT / 2 ? [0.75, 0.95] : [0.05, 0.25];
          newX = (Math.random() * (xSide[1] - xSide[0]) + xSide[0]) * WORLD_WIDTH;
          newY = (Math.random() * (ySide[1] - ySide[0]) + ySide[0]) * WORLD_HEIGHT;
          if (!collidesWithObstacles(newX, newY, this.radius)) {
            break;
          }
          attempts++;
        }
        if (newX !== undefined && newY !== undefined) {
          this.x = newX;
          this.y = newY;
        }
        this.stuckFrames = 0;
      }
    }
  }

  // Purchase a new bot of the specified type if the player has enough
  // score and we haven't exceeded the maximum number of bots.  Deducts
  // BOT_COST from the player's score and recalculates upgrade points.
  function buyBot(botType) {
    if (!player) return;
    if (bots.length >= MAX_BOTS) return;
    // Check upgrade point availability.  Bots cost 2 upgrade points.
    const available = player.upgradePointsEarned - player.upgradePointsSpent;
    if (available < BOT_COST) return;
    // Spend upgrade points instead of score
    player.upgradePointsSpent += BOT_COST;
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
      player.bulletRangeMultiplier,
      player.bulletDamageMultiplier
    ));
    player.ammo--;
    ammoValue.textContent = 'Ammo: ' + player.ammo;
  }

  // Start the game
  function startGame() {
    const name = nameInput.value.trim() || undefined;
    player = new Player(name);
    // Reset player stats (score, level and upgrade points are initialised in the Player constructor)
    // Reset item list and scores
    items = [];
    bots = [];
    roundLevel = 1;
    // Reset item spawn interval to base value and schedule spawns
    currentItemSpawnInterval = BASE_ITEM_SPAWN_INTERVAL;
    scoreValue.textContent = 'Score: 0';
    // Reset level display
    document.getElementById('level-value').textContent = 'Level: 0';
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
    // Clear any existing spawn interval and schedule new spawns at
    // the current interval.  We use currentItemSpawnInterval so that
    // subsequent rounds can adjust spawn frequency.
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    spawnIntervalId = setInterval(spawnItem, currentItemSpawnInterval);
    // Generate obstacles
    generateObstacles();
    // Ensure player does not start inside an obstacle
    while (collidesWithObstacles(player.x, player.y, player.radius)) {
      player.x = Math.random() * WORLD_WIDTH;
      player.y = Math.random() * WORLD_HEIGHT;
    }
    // Spawn the initial target practice bot at the beginning of the game
    targetBots = [];
    // Initialise the first enemy bot's health to match the player's
    // current max health
    const firstEnemy = new TargetBot();
    firstEnemy.maxHealth = player.maxHealth;
    firstEnemy.health = firstEnemy.maxHealth;
    targetBots.push(firstEnemy);

    // Reset progress bar state
    progressFrame = 0;
    progressBotSpawned = false;
    if (progressBarEl) progressBarEl.style.width = '0%';
    // Reset round display
    const roundEl = document.getElementById('round-value');
    if (roundEl) roundEl.textContent = 'Round: ' + roundLevel;
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
    const available = player.upgradePointsEarned - player.upgradePointsSpent;
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
      case 'bulletDamage': {
        const inc = player.upgradeIncrement.bulletDamage;
        player.bulletDamageMultiplier += inc;
        player.upgrades.bulletDamage++;
        player.upgradeIncrement.bulletDamage *= 0.75;
        break;
      }
      default:
        return;
    }
    // Consume one upgrade point
    player.upgradePointsSpent++;
    upgradePtsValue.textContent = 'Upgrade Pts: ' + (player.upgradePointsEarned - player.upgradePointsSpent);
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
    } else if (e.key === '7') {
      // Upgrade bullet damage
      applyUpgrade('bulletDamage');
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

  // Mouse aiming.  The player can aim the cannon independently of
  // movement by pointing the mouse cursor.  We convert the mouse
  // position to world coordinates relative to the camera and update
  // the player's facing direction accordingly.  This does not
  // change movement direction, which remains controlled by WASD.
  canvas.addEventListener('mousemove', (e) => {
    if (!gameRunning || !player) return;
    const rect = canvas.getBoundingClientRect();
    // Convert mouse position from client coordinates to canvas pixels
    const mx = (e.clientX - rect.left) / rect.width * canvas.width;
    const my = (e.clientY - rect.top) / rect.height * canvas.height;
    // Compute camera scale and offset matching the draw logic
    const scaleX = canvas.width / (VIEW_WIDTH_BLOCKS * CELL_SIZE);
    const scaleY = canvas.height / (VIEW_HEIGHT_BLOCKS * CELL_SIZE);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = canvas.width / 2 - player.x * CELL_SIZE * scale;
    const offsetY = canvas.height / 2 - player.y * CELL_SIZE * scale;
    // Convert to world coordinates
    const worldX = (mx - offsetX) / (CELL_SIZE * scale);
    const worldY = (my - offsetY) / (CELL_SIZE * scale);
    const dx = worldX - player.x;
    const dy = worldY - player.y;
    // Update facing direction; if player is stationary we still allow aiming
    player.facingX = dx;
    player.facingY = dy;
  });

  // Allow firing with left mouse click on the canvas.  When the user
  // presses the left mouse button, shoot a bullet if the player has
  // ammunition.  This provides an alternative to pressing the Fire
  // button or the space bar.
  canvas.addEventListener('mousedown', (e) => {
    if (!gameRunning || !player) return;
    // Only respond to left button clicks
    if (e.button === 0) {
      shoot();
      e.preventDefault();
    }
  });

  // Game loop
  function update() {
    if (gameRunning && player) {
      // Increment global frame counter
      frameCount++;

      // Remove items that have existed longer than the despawn threshold
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (frameCount - it.spawnFrame >= DESPAWN_FRAMES) {
          items.splice(i, 1);
        }
      }
      // Update player movement
      player.update();
      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.update();
        // Check collision with any target practice bot.  If a bullet
        // hits a bot, reduce its health and remove the bullet.  We
        // break the loop early because the bullet has been removed.
        let hitEnemy = false;
        for (const enemy of targetBots) {
          if (enemy.health > 0) {
            const distBot = Math.hypot(b.x - enemy.x, b.y - enemy.y);
            if (distBot < b.radius + enemy.radius) {
              enemy.health -= b.damage;
              if (enemy.health < 0) enemy.health = 0;
              bullets.splice(i, 1);
              hitEnemy = true;
              break;
            }
          }
        }
        if (hitEnemy) continue;
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
          // Remove the item from the world
          items.splice(i, 1);
          if (it.type === 'fruit') {
            // Fruits award points equal to their defined value
            player.score += it.points;
            // Check for level ups using the dynamic threshold.  When
            // the player's score exceeds the next level threshold
            // (20, 42, 64, 86, ...), increase level and grant an
            // upgrade point.  We loop in case the player gains more
            // than one level at once.
            while (player.score >= nextLevelThreshold(player.level)) {
              player.level++;
              player.upgradePointsEarned++;
            }
            scoreValue.textContent = 'Score: ' + Math.floor(player.score);
            document.getElementById('level-value').textContent = 'Level: ' + player.level;
          } else if (it.type === 'ammo') {
            // Ammo pickups grant extra ammunition equal to their amount
            player.ammo += it.amount;
            ammoValue.textContent = 'Ammo: ' + player.ammo;
          }
        }
      }
      // Handle speed boost spawning and collection
      // Spawn a speed boost if none exists and the respawn timer has elapsed
      if (!speedBoost && frameCount >= nextSpeedBoostFrame) {
        spawnSpeedBoost();
      }
      // If a speed boost exists, check if the player collects it.  When
      // collected, activate the speed boost effect and schedule the
      // next boost to spawn after a delay.  Remove the boost from
      // the world by setting speedBoost to null.
      if (speedBoost) {
        const distBoost = Math.hypot(player.x - speedBoost.x, player.y - speedBoost.y);
        if (distBoost < player.radius + speedBoost.radius) {
          // Activate speed boost on the player
          player.speedBoostFrames = SPEED_BOOST_DURATION_FRAMES;
          // Schedule next spawn after the respawn delay
          nextSpeedBoostFrame = frameCount + SPEED_BOOST_RESPAWN_FRAMES;
          // Remove boost from world
          speedBoost = null;
        }
      }

      // Handle health boost spawning and collection.  Spawn a health
      // boost only when none exists and the respawn timer has
      // elapsed.  When collected, increase the player's health by
      // HEALTH_BOOST_AMOUNT up to the maximum.  Schedule the next
      // spawn after a delay and remove the boost from the world.
      if (!healthBoost && frameCount >= nextHealthBoostFrame) {
        spawnHealthBoost();
      }
      if (healthBoost) {
        const distHB = Math.hypot(player.x - healthBoost.x, player.y - healthBoost.y);
        if (distHB < player.radius + healthBoost.radius) {
          // Increase player's health but do not exceed maxHealth
          player.health = Math.min(player.maxHealth, player.health + HEALTH_BOOST_AMOUNT);
          // Schedule next spawn
          nextHealthBoostFrame = frameCount + HEALTH_BOOST_RESPAWN_FRAMES;
          // Remove the boost from the world
          healthBoost = null;
        }
      }

      // Update bots: each bot moves toward its target and collects items
      for (const bot of bots) {
        bot.update();
      }

      // Update all target practice bots
      for (const enemy of targetBots) {
        enemy.update();
        // Check for collision with the player.  When an enemy touches
        // the player and its attack cooldown has expired, the player
        // loses 20 health.  After dealing damage, we reset the
        // enemy's attack cooldown to prevent continuous damage each
        // frame.
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < enemy.radius + player.radius) {
          if (!enemy.attackCooldown || enemy.attackCooldown <= 0) {
            player.health -= 20;
            if (player.health < 0) player.health = 0;
            // Start cooldown (1 second at 60 FPS)
            enemy.attackCooldown = 60;
            // If the player's health drops to zero, end the game
            if (player.health <= 0) {
              gameOver();
              // Exit early to avoid further updates this frame
              break;
            }
          }
        }
        // Decrement attack cooldown if present
        if (enemy.attackCooldown && enemy.attackCooldown > 0) {
          enemy.attackCooldown--;
        }
      }
      // Update available upgrade points display.  The number of
      // available points is totalEarned minus points spent.  If
      // available > 0 we update the UI list to remind players of the
      // upgrade keys; otherwise clear the list.
      const availablePts = player.upgradePointsEarned - player.upgradePointsSpent;
      upgradePtsValue.textContent = 'Upgrade Pts: ' + availablePts;
      healthValue.textContent = 'Health: ' + Math.floor(player.health) + '/' + Math.floor(player.maxHealth);
      // Update level display each frame
      document.getElementById('level-value').textContent = 'Level: ' + player.level;
      // Update round display every frame so the UI shows the current round
      const roundEl = document.getElementById('round-value');
      if (roundEl) roundEl.textContent = 'Round: ' + roundLevel;
      // Build a list of instructions for upgrades if there are points
      let instructions = '';
      if (availablePts > 0) {
        instructions += '<p><strong>Upgrade Options</strong> (press key to apply):</p>';
        instructions += '<p>1: Bullet Speed (lvl ' + player.upgrades.bulletSpeed + ')</p>';
        instructions += '<p>2: Bullet Range (lvl ' + player.upgrades.bulletRange + ')</p>';
        instructions += '<p>3: Health (lvl ' + player.upgrades.health + ')</p>';
        instructions += '<p>4: Speed (lvl ' + player.upgrades.speed + ')</p>';
        instructions += '<p>7: Bullet Damage (lvl ' + player.upgrades.bulletDamage + ')</p>';
      }
      // Bot purchase instructions if the player has enough upgrade points and bot limit not reached
      const botCanBuy = (player.upgradePointsEarned - player.upgradePointsSpent) >= BOT_COST && bots.length < MAX_BOTS;
      if (botCanBuy) {
        instructions += '<p><strong>Bot Options</strong> (cost ' + BOT_COST + ' upgrade pts each):</p>';
        instructions += '<p>5: Point Bot (' + bots.filter(b => b.type === 'point').length + ' owned)</p>';
        instructions += '<p>6: Ammo Bot (' + bots.filter(b => b.type === 'ammo').length + ' owned)</p>';
      }
      upgradeList.innerHTML = instructions;
      // Always update bots line each frame
      updateBotsDisplay();

      // Update the progress bar for the current round.  When the bar
      // fills, start a new round which resets the timer, spawns a
      // stronger enemy and speeds up item spawning.  The bar’s
      // width is updated proportionally each frame.  A round lasts
      // PROGRESS_BAR_FRAMES update frames (1.5 minutes at ~60 FPS).
      if (progressFrame < PROGRESS_BAR_FRAMES) {
        progressFrame++;
        const pct = progressFrame / PROGRESS_BAR_FRAMES;
        if (progressBarEl) progressBarEl.style.width = (pct * 100) + '%';
      } else {
        startNewRound();
      }
    }
    requestAnimationFrame(update);
    draw();
  }

  // Draw world
  function draw() {
    // Paint the entire canvas a neutral grey so that areas outside
    // the world boundaries are visibly distinct.  We intentionally
    // avoid using clearRect because we want to lay down a solid
    // background colour every frame.
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!player) return;
    // Determine scale and offsets similar to multiplayer version
    const scaleX = canvas.width / (VIEW_WIDTH_BLOCKS * CELL_SIZE);
    const scaleY = canvas.height / (VIEW_HEIGHT_BLOCKS * CELL_SIZE);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = canvas.width / 2 - player.x * CELL_SIZE * scale;
    const offsetY = canvas.height / 2 - player.y * CELL_SIZE * scale;
    const gridSize = CELL_SIZE * scale;
    // Paint the world area with a light colour to distinguish it
    // from the grey background.  Compute the world rectangle in
    // screen coordinates and draw it before any obstacles or items.
    {
      const left = 0 * CELL_SIZE * scale + offsetX;
      const top = 0 * CELL_SIZE * scale + offsetY;
      const width = WORLD_WIDTH * CELL_SIZE * scale;
      const height = WORLD_HEIGHT * CELL_SIZE * scale;
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(left, top, width, height);
    }
    // Grid lines are intentionally omitted to provide a cleaner visual.
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
      } else if (ob.type === 'ellipse') {
        const ox = ob.cx * CELL_SIZE * scale + offsetX;
        const oy = ob.cy * CELL_SIZE * scale + offsetY;
        const rx = ob.rx * CELL_SIZE * scale;
        const ry = ob.ry * CELL_SIZE * scale;
        ctx.beginPath();
        ctx.ellipse(ox, oy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw world border as a visible outline around the edges of the
    // map.  The border is drawn after obstacles so it appears on top.
    {
      const left = 0 * CELL_SIZE * scale + offsetX;
      const top = 0 * CELL_SIZE * scale + offsetY;
      const width = WORLD_WIDTH * CELL_SIZE * scale;
      const height = WORLD_HEIGHT * CELL_SIZE * scale;
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 2;
      ctx.strokeRect(left, top, width, height);
    }
    // Draw items (fruit and ammo).  Fruit are circles; ammo pickups
    // are drawn as diamond shapes so they stand out from fruit.
    items.forEach((it) => {
      const sx = it.x * CELL_SIZE * scale + offsetX;
      const sy = it.y * CELL_SIZE * scale + offsetY;
      const radius = it.radius * CELL_SIZE * scale;
      // Draw fruit with a leafy top or ammo as a bullet shape
      if (it.type === 'fruit') {
        // Main fruit body
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, Math.PI * 2);
        ctx.fill();
        // Draw a small leaf on top right
        ctx.fillStyle = '#2f7d32';
        ctx.beginPath();
        const leafRadius = radius * 0.35;
        const leafX = sx + radius * 0.4;
        const leafY = sy - radius * 0.6;
        ctx.ellipse(leafX, leafY, leafRadius, leafRadius * 0.6, -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.type === 'ammo') {
        // Draw bullet shape: hexagon‑like body oriented horizontally
        ctx.fillStyle = it.color;
        ctx.beginPath();
        const tipOffset = radius * 0.8;
        const sideOffset = radius * 0.4;
        ctx.moveTo(sx - tipOffset, sy);
        ctx.lineTo(sx - sideOffset, sy - radius);
        ctx.lineTo(sx + sideOffset, sy - radius);
        ctx.lineTo(sx + tipOffset, sy);
        ctx.lineTo(sx + sideOffset, sy + radius);
        ctx.lineTo(sx - sideOffset, sy + radius);
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
      ctx.fillStyle = '#d32f2f';
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw each target practice bot with a health bar.  Bots with
    // zero health are not drawn.
    for (const enemy of targetBots) {
      if (enemy.health <= 0) continue;
      const ex = enemy.x * CELL_SIZE * scale + offsetX;
      const ey = enemy.y * CELL_SIZE * scale + offsetY;
      const er = enemy.radius * CELL_SIZE * scale;
      // Draw bot body
      ctx.beginPath();
      ctx.fillStyle = enemy.color;
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      // Draw health bar background
      const barWidth = er * 2;
      const barHeight = 6;
      const barX = ex - barWidth / 2;
      const barY = ey - er - 10;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      // Draw health bar fill proportionally
      const healthPct = enemy.health / enemy.maxHealth;
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);
      // Outline
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);
    }
    // Draw the speed boost if it exists.  Represent the boost as a
    // stylised lightning bolt.  The bolt is drawn relative to its
    // radius and oriented upright.  Use a bright yellow colour for
    // visibility.
    if (speedBoost) {
      const bx = speedBoost.x * CELL_SIZE * scale + offsetX;
      const by = speedBoost.y * CELL_SIZE * scale + offsetY;
      const br = speedBoost.radius * CELL_SIZE * scale;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      // Define the lightning bolt shape using relative coordinates.
      const pts = [
        { x: 0, y: -1 },
        { x: 0.4, y: -0.3 },
        { x: -0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.1, y: 0.5 },
        { x: 0.3, y: 1 }
      ];
      ctx.moveTo(bx + pts[0].x * br, by + pts[0].y * br);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(bx + pts[i].x * br, by + pts[i].y * br);
      }
      ctx.closePath();
      ctx.fill();
    }
    // Draw the health boost if it exists.  Represent this as a
    // red plus sign.  The plus sign consists of a horizontal and
    // vertical bar intersecting at the centre.  Size scales with
    // the boost’s radius.  Use a vivid red colour for visibility.
    if (healthBoost) {
      const hx = healthBoost.x * CELL_SIZE * scale + offsetX;
      const hy = healthBoost.y * CELL_SIZE * scale + offsetY;
      const hr = healthBoost.radius * CELL_SIZE * scale;
      // Determine dimensions for the plus sign.  The bar lengths
      // extend beyond the radius to make the symbol prominent.  The
      // thickness is a fraction of the radius.
      const barLength = hr * 1.6;
      const barThickness = hr * 0.5;
      ctx.fillStyle = '#e53935';
      // Horizontal bar
      ctx.fillRect(hx - barLength / 2, hy - barThickness / 2, barLength, barThickness);
      // Vertical bar
      ctx.fillRect(hx - barThickness / 2, hy - barLength / 2, barThickness, barLength);
    }
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
    // Draw player name and level above.  We show the player's level
    // instead of their score to emphasise progress.  Use a dynamic
    // font size proportional to player radius.
    ctx.fillStyle = '#000';
    ctx.font = `${Math.max(12, pr / 2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${player.name} (Lv ${player.level})`, px, py - pr - 2);
  }
  // Start the animation loop
  update();
})();