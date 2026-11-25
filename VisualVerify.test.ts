import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * VisualVerify for the maliaplace "Sabotage 1981 · Apple II · Mark Allen" build
 * that now lives in index.html (the preferred, smaller build).
 *
 * This build's ACTUAL rules (verified against its source) differ from the old
 * sabota build the previous test targeted:
 *   - Sound: `#sound-btn` (+ `.muted` class) toggled by `toggleSound()`; there
 *     is NO `#mute-btn`, NO `isMuted`, and NO 'm' key binding.
 *   - Fire: hold SPACE / mouse / canvas-touch via `fireHeld`; there is NO
 *     `#btn-fire`. `fire()` costs 1 score point and pushes one shell per call.
 *   - Rules (original Sabotage): shells hit ONLY airborne (`state === "falling"`)
 *     paras — shoot the canopy and they drop fast and SPLAT. Landed soldiers
 *     (`state "grounded"`) stand where they land and are shell-immune. Two ways
 *     they end the game: (A) 3 piled in ONE column right by the turret ("a
 *     3-high pillar … reaches over") , or (B) 4 on ONE side once the sky is clear
 *     → the squad forms a "human pyramid" that climbs over it. Ground bombs still
 *     kill nearby troopers.
 *
 * Game state (W, H, scale, offsetX, offsetY, cssW, cssH, turretX, groundY,
 * running, score, shells, helicopters, jets, paratroopers, bombs, stackLeft,
 * stackRight) is exposed as live window properties (top-level `var`) and the
 * functions (reset, startGame, update, fire, aimAndFire, toggleSound) are
 * top-level functions — all reachable over `window.*` for white-box testing.
 */
const URL = 'file://' + path.resolve(__dirname, 'index.html');

async function cleanState(page: any) {
  await page.evaluate(() => {
    (window as any).reset();
    (window as any).running = true;
    (window as any).helicopters = [];
    (window as any).jets = [];
    (window as any).paratroopers = [];
    (window as any).bombs = [];
    (window as any).shells = [];
  });
}

test('start flow sets running state & hides the overlay', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#overlay')).toBeVisible();
  await expect(page.locator('#overlay h1')).toHaveText('SABOTAGE');
  await expect(page.locator('button.start-btn')).toHaveText(/START MISSION/);
  expect(await page.evaluate(() => (window as any).running)).toBe(false);

  await page.locator('button.start-btn').click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect(await page.evaluate(() => (window as any).running)).toBe(true);
  // Geometry sanity on the fixed virtual playfield.
  expect(await page.evaluate(() => (window as any).W)).toBe(720);
  expect(await page.evaluate(() => (window as any).H)).toBe(480);
  expect(await page.evaluate(() => (window as any).turretX)).toBe(360);
  expect(await page.evaluate(() => (window as any).groundY)).toBeCloseTo(480 * 0.92, 3);
});

test('mute toggles via #sound-btn (no m-key, no isMuted)', async ({ page }) => {
  await page.goto(URL);
  const btn = page.locator('#sound-btn');
  // Starts enabled.
  expect(await btn.textContent()).not.toContain('🔇');
  expect(((await btn.getAttribute('class')) || '')).not.toContain('muted');
  await btn.click();
  expect(await btn.textContent()).toContain('🔇');
  expect(((await btn.getAttribute('class')) || '')).toContain('muted');
  await btn.click();
  expect(await btn.textContent()).not.toContain('🔇');
  expect(((await btn.getAttribute('class')) || '')).not.toContain('muted');
});

test('fire() mechanics + hold-SPACE rapid fire', async ({ page }) => {
  await page.goto(URL);
  await page.locator('button.start-btn').click();
  await page.waitForTimeout(120);

  // 1) fire() deterministically pushes exactly one shell per call.
  const direct = await page.evaluate(() => {
    (window as any).reset(); (window as any).running = true;
    (window as any).shells = [];
    const before = (window as any).shells.length;
    for (let i = 0; i < 4; i++) (window as any).fire();
    return { before, after: (window as any).shells.length };
  });
  console.log('direct fire() shells:', direct);
  expect(direct.after - direct.before).toBe(4);

  // 2) Holding SPACE (real key handler sets fireHeld) rapid-fires multiple shells.
  await page.evaluate(() => { (window as any).shells = []; });
  await page.keyboard.down('Space');
  const hold = await page.evaluate(() => {
    for (let i = 0; i < 8; i++) (window as any).update(0.05);
    return (window as any).shells.length;
  });
  await page.keyboard.up('Space');
  console.log('hold-SPACE shells:', hold);
  expect(hold).toBeGreaterThanOrEqual(2);
});

test('aiming re-aims the turret toward the cursor', async ({ page }) => {
  await page.goto(URL);
  await page.locator('button.start-btn').click();
  await page.waitForTimeout(120);

  const angle = await page.evaluate(() => {
    (window as any).reset(); (window as any).running = true;
    const r = document.getElementById('c')!.getBoundingClientRect();
    const scale = (window as any).scale, ox = (window as any).offsetX, oy = (window as any).offsetY;
    // Aim at a point LEFT of and ABOVE the turret (virtual x=200, y=300).
    const cx = r.left + ox + 200 * scale;
    const cy = r.top + oy + 300 * scale;
    (window as any).aimAndFire(cx, cy);
    return (window as any).turretAngle;
  });
  console.log('turret angle aiming top-left:', angle);
  // Top-left means the angle sits past -PI/2 in the upper-left hemisphere.
  expect(angle).toBeLessThan(-Math.PI / 2);
});

test('a 3-high pillar beside the turret reaches over it (game over)', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const turretX = (window as any).turretX;
    const groundY = (window as any).groundY;
    // 3 soldiers stacked in one column, within reach of the turret.
    const x = turretX - 45;
    for (let i = 0; i < 3; i++) {
      const p = { x, y: groundY - 5 - i * 16, vy: 0, hasChute: false, chuteDeployed: true, state: 'grounded', side: -1 };
      (window as any).paratroopers.push(p);
      (window as any).stackLeft.push(p);
    }
    (window as any).update(0.016);
    return { running: (window as any).running };
  });
  console.log('3-pillar:', res);
  expect(res.running).toBe(false);

  await page.waitForTimeout(1100);
  const reason = (await page.locator('#overlay h2').textContent()) || '';
  console.log('game over reason:', reason);
  expect(reason).toContain('pillar');
  expect(reason).toContain('left');
});

test('4 on one side, sky clear -> the squad forms a human pyramid (game over)', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const turretX = (window as any).turretX;
    const groundY = (window as any).groundY;
    // 4 scattered soldiers (no 3-pillar, none within reach) on the LEFT; sky clear.
    const xs = [turretX - 180, turretX - 130, turretX - 95, turretX - 160];
    for (const x of xs) {
      const p = { x, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'grounded', side: -1 };
      (window as any).paratroopers.push(p);
      (window as any).stackLeft.push(p);
    }
    let guard = 0;
    while ((window as any).running && guard++ < 400) (window as any).update(0.05);
    return { running: (window as any).running };
  });
  console.log('pyramid:', res);
  expect(res.running).toBe(false);

  await page.waitForTimeout(1100);
  const reason = (await page.locator('#overlay h2').textContent()) || '';
  console.log('game over reason:', reason);
  expect(reason).toContain('pyramid');
});

test('the pyramid waits while a soldier is still in the air', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const turretX = (window as any).turretX;
    const groundY = (window as any).groundY;
    const xs = [turretX - 180, turretX - 130, turretX - 95, turretX - 160];
    for (const x of xs) {
      const p = { x, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'grounded', side: -1 };
      (window as any).paratroopers.push(p);
      (window as any).stackLeft.push(p);
    }
    // One para still descending keeps the "sky clear" check false -> hold position.
    (window as any).paratroopers.push({ x: 150, y: 40, vy: 55, hasChute: true, chuteDeployed: true, state: 'falling', side: 0 });
    for (let i = 0; i < 24; i++) (window as any).update(0.05); // ~1.2s of simulation
    const air = (window as any).paratroopers.find((p: any) => p.state === 'falling');
    return { running: (window as any).running, airStillFalling: !!air };
  });
  console.log('blocked pyramid:', res);
  expect(res.airStillFalling).toBe(true);
  expect(res.running).toBe(true);
});

test('shooting the canopy drops the chute -> freefall velocity', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    (window as any).paratroopers.push({ x: 200, y: 150, vy: 55, hasChute: true, chuteDeployed: true, state: 'falling', side: 0 });
    (window as any).shells.push({ x: 200, y: 150 - 25, vx: 0, vy: 0 });
    (window as any).update(0.016);
    return {
      hasChute: (window as any).paratroopers[0].hasChute,
      vy: (window as any).paratroopers[0].vy,
      shells: (window as any).shells.length,
    };
  });
  console.log('after canopy hit:', res);
  expect(res.hasChute).toBe(false);
  expect(res.vy).toBe(280); // freefall speed
  expect(res.shells).toBe(0);
});

test('a freefalling (no-chute) para splats on the ground', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const groundY = (window as any).groundY;
    (window as any).paratroopers.push({ x: 200, y: groundY - 8, vy: 280, hasChute: false, chuteDeployed: true, state: 'falling', side: 0 });
    (window as any).update(0.05);
    return (window as any).paratroopers.length;
  });
  console.log('paras after freefall hit ground:', res);
  expect(res).toBe(0);
});

test('grounded soldiers are immune to shells', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const groundY = (window as any).groundY;
    const turretX = (window as any).turretX;
    (window as any).paratroopers.push({ x: turretX - 120, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'grounded', side: -1 });
    (window as any).shells.push({ x: turretX - 120, y: groundY - 5, vx: 100, vy: 0 });
    (window as any).update(0.016);
    const p = (window as any).paratroopers[0];
    return { count: (window as any).paratroopers.length, state: p ? p.state : null };
  });
  console.log('grounded para after shell pass:', res);
  expect(res.count).toBe(1);
  expect(res.state).toBe('grounded');
});

test('a ground bomb kills nearby grounded paras', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const groundY = (window as any).groundY;
    const turretX = (window as any).turretX;
    (window as any).paratroopers.push({ x: turretX - 40, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'grounded', side: -1 });
    (window as any).bombs.push({ x: turretX - 40, y: groundY, vx: 0, vy: 100 });
    (window as any).update(0.05);
    return (window as any).paratroopers.length;
  });
  console.log('paras after ground bomb:', res);
  expect(res).toBe(0);
});

test('mobile canvas tap fires the turret', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await page.locator('button.start-btn').click();
  await page.waitForTimeout(120);
  await page.evaluate(() => { (window as any).shells = []; (window as any).helicopters = []; (window as any).paratroopers = []; (window as any).bombs = []; });

  const before = await page.evaluate(() => (window as any).shells.length);
  await page.locator('#c').dispatchEvent('touchstart', { touches: [{ clientX: 195, clientY: 420, identifier: 1 }] });
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => (window as any).shells.length);
  console.log('mobile tap shells before/after:', before, after);
  expect(after - before).toBeGreaterThanOrEqual(1);
  await page.locator('#c').dispatchEvent('touchend', { changedTouches: [{ clientX: 195, clientY: 420, identifier: 1 }] });
});
