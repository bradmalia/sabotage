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
 *   - Rules: shells hit ONLY airborne (`state === "falling"`) paras. Shoot the
 *     canopy → loses chute → freefalls → splats on the ground. Grounded
 *     (walking/stacked) paras are shell-immune. Bombs that hit the ground kill
 *     nearby grounded paras. 3 stacked on EITHER side = game over
 *     ("Paratroopers stacked 3 high on the … side!").
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

test('3 stacked on one side ends the game', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const geom = await page.evaluate(() => ({
    turretX: (window as any).turretX,
    groundY: (window as any).groundY,
  }));
  const landY = geom.groundY - 5;
  const leftX = geom.turretX - 55; // getStackX(-1), one step from target

  const dropTrooper = async () =>
    page.evaluate(({ landY, leftX }: any) => {
      (window as any).paratroopers.push({
        x: leftX, y: landY, vy: 0,
        hasChute: false, chuteDeployed: true, state: 'walking', side: -1,
      });
      (window as any).update(0.05);
      return {
        left: (window as any).stackLeft.length,
        running: (window as any).running,
      };
    }, { landY, leftX });

  const a = await dropTrooper();
  console.log('after trooper 1:', a);
  expect(a.left).toBe(1);
  expect(a.running).toBe(true);

  const b = await dropTrooper();
  console.log('after trooper 2:', b);
  expect(b.left).toBe(2);
  expect(b.running).toBe(true);

  const c = await dropTrooper();
  console.log('after trooper 3:', c);
  expect(c.left).toBe(3);
  expect(c.running).toBe(false); // game over only now

  // endGame() reveals the overlay shortly after, with the reason.
  await page.waitForTimeout(1100);
  await expect(page.locator('#overlay')).toBeVisible();
  const reason = (await page.locator('#overlay h2').textContent()) || '';
  console.log('game over reason:', reason);
  expect(reason).toContain('stacked 3 high');
  expect(reason).toContain('left');
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

test('grounded (walking) paras are immune to shells', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const groundY = (window as any).groundY;
    const turretX = (window as any).turretX;
    (window as any).paratroopers.push({ x: turretX - 120, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'walking', side: -1 });
    (window as any).shells.push({ x: turretX - 120, y: groundY - 5, vx: 100, vy: 0 });
    (window as any).update(0.016);
    const p = (window as any).paratroopers[0];
    return { count: (window as any).paratroopers.length, state: p ? p.state : null };
  });
  console.log('walking para after shell pass:', res);
  expect(res.count).toBe(1);
  expect(res.state).toBe('walking');
});

test('a ground bomb kills nearby grounded paras', async ({ page }) => {
  await page.goto(URL);
  await cleanState(page);
  const res = await page.evaluate(() => {
    const groundY = (window as any).groundY;
    const turretX = (window as any).turretX;
    (window as any).paratroopers.push({ x: turretX - 40, y: groundY - 5, vy: 0, hasChute: false, chuteDeployed: true, state: 'stacked', side: -1 });
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
