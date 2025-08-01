# Single‑Player Fruit Growing Game

This directory contains a feature‑rich single‑player version of the
fruit‑eating grid game.  Unlike the multiplayer variant, this game
runs entirely in the browser without any backend.  You can host it
directly on GitHub Pages or any static website service.  The map is
three times larger than in the basic game, obstacles come in a variety
of shapes, and bullets travel farther but cannot leave the map.  A
simple upgrade system lets you tune your play style as you score
points.

## How It Works

* **Grid‑based world** – A large rectangular grid provides the play
  area.  The player moves smoothly between cells but can use the grid
  lines to orient themselves.  The visible region scrolls around the
  hero as they explore the expansive map.
* **Two types of items** – The game world contains both fruit and
  ammunition pickups.  Fruit come in three levels (1–3) and award
  points equal to their level when eaten.  Ammo pickups grant extra
  ammo for your cannon without affecting your score.  Four sizes of
  ammo pickup (1, 3, 5 and 10 ammo) are available, with the larger
  pickups being rarer.  Fruit are drawn as circles using green,
  yellow and red hues, while ammo pickups appear as coloured diamonds
  so they are easy to distinguish.
* **Cannon and bullets** – Your circle never grows.  Instead you
  collect ammunition and fire it from a small cannon mounted on the
  front of your blob.  Press **Fire** or tap the space bar to shoot;
  each shot consumes one ammo.  Bullets have a longer range by
  default but still disappear when they hit an obstacle or the edge
  of the map.  When an ammo pickup of value 10 is collected you’ll
  have plenty of shots to use.
* **Obstacle variety** – Randomly generated obstacles block your path
  and bullets.  Some obstacles are rectangles of varying width and
  height; others are circular boulders.  You must navigate around
  these shapes to reach items.
* **Upgrades** – For every 20 points you score (by eating fruit) you
  earn one upgrade point.  Use these points to improve your blob:
  increase bullet speed, increase bullet range, increase health or
  increase movement speed.  Press the number keys 1–4 to spend a
  point on one of these upgrades.  The scoreboard displays your
  current health, available upgrade points and the level of each
  upgrade.
* **Expanded map and faster spawns** – The play field is three times
  wider and taller than the basic game, and items spawn 1.5 times
  faster.  The number of fruit and ammo pickups on the map scales with
  the increased area so you’re never too far from your next snack or
  ammunition cache.
* **Touch and keyboard controls** – Use the arrow keys or W/A/S/D on
  desktop, or drag your finger on mobile, to control movement.  The
  **Fire** button or space bar fires ammunition.  When upgrade points
  are available, a list of upgrade options appears in the status
  panel; press 1–4 to apply an upgrade.

Modern browsers allow games to be created using just HTML5 and
JavaScript.  The canvas element provides a drawing surface, and
JavaScript engines deliver sufficient performance across desktop and
mobile devices【27436902493798†L106-L124】.  Since there is no backend,
all state (player position, items, score and upgrades) is maintained
locally in the client.

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