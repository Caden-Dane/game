/*
 * Client‑side logic for the fruit growing multiplayer game.
 *
 * Connects to the Socket.IO server, renders the game world on a canvas, and
 * handles user input via keyboard and touch.  The client receives periodic
 * state updates from the server and draws players and fruit on top of a
 * grid.  The camera follows the local player to keep them centered on the
 * screen.  Scoreboard updates and connection status messages are also
 * displayed.
 */

(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const nameInput = document.getElementById('name-input');
  const startBtn = document.getElementById('start-btn');
  const statusText = document.getElementById('status');
  const scoresList = document.getElementById('scores');

  // Adjust canvas size to fill the viewport
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  let socket = null;
  let playerId = null;
  let world = { width: 0, height: 0, cellSize: 50 };
  let state = { players: [], fruits: [] };
  let inputDir = { x: 0, y: 0 };

  // Connect to the server and start the game
  function startGame() {
    const name = nameInput.value.trim();
    startBtn.disabled = true;
    statusText.textContent = 'Connecting…';
    socket = io();
    socket.on('connect', () => {
      socket.emit('join', name);
    });
    socket.on('init', (data) => {
      playerId = data.id;
      world = data.world;
      statusText.textContent = '';
      // Hide the name input after joining
      nameInput.style.display = 'none';
      startBtn.style.display = 'none';
    });
    socket.on('state', (newState) => {
      state = newState;
      updateScores();
    });
    socket.on('dead', () => {
      statusText.textContent = 'You were eaten! Refresh to rejoin.';
    });
  }

  startBtn.addEventListener('click', startGame);

  // Update scoreboard
  function updateScores() {
    scoresList.innerHTML = '';
    const sorted = state.players.slice().sort((a, b) => b.score - a.score);
    sorted.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = `${p.name}: ${Math.floor(p.score)}`;
      if (p.id === playerId) {
        li.style.fontWeight = 'bold';
      }
      scoresList.appendChild(li);
    });
  }

  // Handle keyboard controls
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    updateInputDir();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    updateInputDir();
  });

  function updateInputDir() {
    let x = 0, y = 0;
    if (keys['arrowup'] || keys['w']) y -= 1;
    if (keys['arrowdown'] || keys['s']) y += 1;
    if (keys['arrowleft'] || keys['a']) x -= 1;
    if (keys['arrowright'] || keys['d']) x += 1;
    inputDir = { x, y };
    if (socket) {
      socket.emit('input', inputDir);
    }
  }

  // Handle touch controls: user touches to set direction relative to the player
  canvas.addEventListener('touchstart', handleTouch);
  canvas.addEventListener('touchmove', handleTouch);
  function handleTouch(e) {
    if (!playerId) return;
    const touch = e.touches[0];
    if (!touch) return;
    // Determine direction vector relative to the player's position on screen
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    const cameraX = player.x;
    const cameraY = player.y;
    // Convert touch position to world coordinates
    const rect = canvas.getBoundingClientRect();
    const tx = (touch.clientX - rect.left) / rect.width * canvas.width;
    const ty = (touch.clientY - rect.top) / rect.height * canvas.height;
    // Convert screen coords to world coords relative to camera
    const scale = canvas.width / (world.width * world.cellSize);
    const worldX = cameraX + (tx - canvas.width / 2) / (world.cellSize * scale);
    const worldY = cameraY + (ty - canvas.height / 2) / (world.cellSize * scale);
    const dirX = worldX - player.x;
    const dirY = worldY - player.y;
    inputDir = { x: dirX, y: dirY };
    if (socket) {
      socket.emit('input', inputDir);
    }
    e.preventDefault();
  }

  // Render loop
  function draw() {
    requestAnimationFrame(draw);
    if (!playerId || !state) {
      // Not joined yet
      return;
    }
    // Get the local player for camera position
    const me = state.players.find((p) => p.id === playerId);
    if (!me) {
      return;
    }
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Determine scale: we want to display a portion of the world around the player
    const scaleX = canvas.width / (world.width * world.cellSize);
    const scaleY = canvas.height / (world.height * world.cellSize);
    const scale = Math.min(scaleX, scaleY);
    // Compute camera offset so player is centered
    const offsetX = canvas.width / 2 - me.x * world.cellSize * scale;
    const offsetY = canvas.height / 2 - me.y * world.cellSize * scale;
    // Draw grid lines
    const gridSize = world.cellSize * scale;
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    for (let i = 0; i <= world.width; i++) {
      const x = i * gridSize + offsetX;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, world.height * gridSize + offsetY);
      ctx.stroke();
    }
    for (let j = 0; j <= world.height; j++) {
      const y = j * gridSize + offsetY;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(world.width * gridSize + offsetX, y);
      ctx.stroke();
    }
    // Draw fruits
    state.fruits.forEach((fruit) => {
      const screenX = fruit.x * world.cellSize * scale + offsetX;
      const screenY = fruit.y * world.cellSize * scale + offsetY;
      const radius = fruit.radius * world.cellSize * scale;
      ctx.beginPath();
      ctx.fillStyle = fruit.color;
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    // Draw players
    state.players.forEach((p) => {
      const screenX = p.x * world.cellSize * scale + offsetX;
      const screenY = p.y * world.cellSize * scale + offsetY;
      const radius = p.radius * world.cellSize * scale;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fill();
      // Draw name above the player
      ctx.fillStyle = '#000';
      ctx.font = `${Math.max(12, radius / 2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.name, screenX, screenY - radius - 2);
    });
  }
  draw();
})();