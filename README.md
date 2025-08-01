# Single‑Player Fruit Growing Game

This directory contains a single‑player version of the
fruit‑eating grid game.  Unlike the multiplayer variant, this game
runs entirely in the browser without any backend.  You can host it
directly on GitHub Pages or any static website service.  In this
variant the map is three times larger and populated with impassable
obstacles.  Instead of growing when you eat fruit, you accumulate
ammunition and fire it from a small cannon mounted on your circle.

## How It Works

* **Grid‑based world** – A large rectangular grid provides the play
  area.  The player moves smoothly between cells but can use the
  grid lines to orient themselves.
* **Fruit with levels** – Fruit spawn at random positions on the
  map.  Each fruit has a level (1–3) that determines its size and
  colour.  Eating fruit awards that many points and adds the same
  amount of ammunition to your inventory.
* **Ammunition and cannon** – Your circle no longer grows when
  collecting fruit.  Instead you accumulate ammunition.  A small
  cannon mounted on the front of your blob can fire a projectile in
  the direction you’re facing.  Press **Fire** or the space bar to
  shoot; each shot consumes one ammo.
* **Obstacles** – Randomly generated rectangular obstacles block
  movement and bullets.  Navigate around them to reach fruit.
* **Expanded map** – The play field is three times wider and taller
  than before, and the maximum number of fruit scales with the
  increased area.  Fruit also spawn 1.5 times faster.
* **Touch and keyboard controls** – Use the arrow keys or W/A/S/D on
  desktop, or drag your finger on mobile, to control movement.  The
  **Fire** button or space bar fires ammunition.

Modern browsers allow games to be created using just HTML5 and
JavaScript.  The canvas element provides a drawing surface, and
JavaScript engines deliver sufficient performance across desktop and
mobile devices【27436902493798†L106-L124】.  Since there is no backend,
all state (player position, fruit, score) is maintained locally in the
client.

## Running the Game

1. Copy the contents of this `singleplayer-fruit-game` folder to the
   root of a GitHub Pages branch or any static hosting service.
2. Navigate to the hosted `index.html` in your browser.
3. Enter your name and press **Start** to begin playing.  Your
   current score and ammo count are displayed at the top left.  Eat
   fruit to earn points and ammunition, avoid obstacles, and see how
   high you can score!

There is no need to install Node.js or run a server for this version;
everything is contained within the HTML, CSS and JavaScript files.

## Customisation

Game parameters such as the world size, fruit spawn rate, maximum
fruit count and obstacle count are defined at the top of `game.js`.
You can tweak these values to change the difficulty or pacing.  Feel
free to adjust the number and size of obstacles, the amount of ammo
gained per fruit, or the bullet speed.  Additional features such as
power‑ups or multiple levels could be implemented using the same
patterns.