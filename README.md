# SABOTAGE (1981 Apple II Recreation)

[![Live Game](https://img.shields.io/badge/Play_Live-maliaplace.com%2Fsabotage-00f0ff?style=for-the-badge&logo=google-chrome)](https://www.maliaplace.com/sabotage/)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-HTML5_Canvas_%7C_Web_Audio-f59e0b?style=for-the-badge)](https://www.maliaplace.com/sabotage/)

A faithful, modern browser recreation of the classic **1981 Apple II arcade game *Sabotage*** by Mark Allen. Built in pure HTML5 Canvas and Web Audio API with zero external runtime dependencies.

Play live at: **[https://www.maliaplace.com/sabotage/](https://www.maliaplace.com/sabotage/)**

---

## 🕹️ Gameplay & Mechanics

Defend your turret against endless waves of transport helicopters, paratroopers, and high-speed fighter jets.

- **Gun Turret**: Rotate and fire explosive flak shells into the sky. Features **rapid-fire** by holding down the fire key, mouse button, or mobile touch button.
- **Dual Paratrooper Hitboxes**:
  - **Parachute Hit**: Shreds the canopy, sending the paratrooper into an animated panic freefall until he splats on the ground!
  - **Direct Body Hit**: Blows the airborne trooper out of the sky in mid-air.
- **Ground Combat & Stacking Mechanics**:
  - Paratroopers on the ground are **immune to direct gunfire**.
  - Ground troops can only be eliminated by **enemy bombs** or by **freefalling paratroopers** crushing them from above.
  - Landed troopers walk to the base of the turret and **stack on top of each other**.
  - When the third paratrooper reaches the stack, he **climbs to the top of the pyramid** to sabotage the turret. If he reaches the top, the game is over!
- **High-Speed Jets & Bombs**: Fast-moving jets drop bombs targeted at your turret and surrounding defenses.
- **Synthesized Retro Audio**: Procedurally generated authentic 8-bit sound effects using Web Audio API (with instant mute toggle).

---

## 🎮 Controls

### Desktop
- **Aim Left / Right**: `←` / `→` or `A` / `D`
- **Mouse Aiming**: Move the mouse cursor anywhere across the sky to aim
- **Fire / Rapid Fire**: Hold `SPACEBAR` or hold `Left Mouse Button`
- **Toggle Sound**: `M` or click the `🔊 AUDIO` button in the HUD

### Mobile / Touch Devices
- **Direct Aim & Shoot**: Tap or drag across the sky to aim and fire
- **Virtual D-Pad**: On-screen `◀` and `▶` buttons to rotate the barrel
- **Rapid Fire Button**: Hold the on-screen `FIRE` button

---

## 🏆 Scoring

| Target | Points |
| :--- | :--- |
| **Bomb** | `+25 pts` |
| **Helicopter / Jet** | `+5 pts` |
| **Paratrooper (Air / Chute / Splat / Crush)** | `+2 pts` |
| **Flak Shot Fired** | `-1 pt` |

---

## 🛠️ Local Development & Testing

### Running Locally
No build tools or bundlers required. Simply open `index.html` in any modern web browser or serve it locally:

```bash
# Python 3 local server
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000`.

### Automated Visual & Logic Verification
The project includes a comprehensive [Playwright](https://playwright.dev/) test suite verifying rapid fire, keyboard/mouse/touch controls, chute hitboxes, ground combat immunity, freefall crushing, and paratrooper pyramid climbing:

```bash
npm install
npx playwright test VisualVerify.test.ts
```

---

## 📜 License

MIT License &copy; 2026 Brad Malia
