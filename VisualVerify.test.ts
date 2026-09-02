import { test, expect } from '@playwright/test';
import path from 'path';

test('Comprehensive Sabotage Feature Verification', async ({ page }) => {
  const filePath = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(filePath);

  // 1. Verify overlay is visible
  await expect(page.locator('#overlay')).toBeVisible();
  await page.screenshot({ path: '/home/brad/sabotage/screenshot_start.png' });

  // 2. Start game
  await page.click('#start-btn');
  await expect(page.locator('#overlay')).toBeHidden();
  await page.waitForTimeout(200);

  // 3. Test Mute Button and 'M' Key
  const muteBtn = page.locator('#mute-btn');
  await expect(muteBtn).toHaveText(/AUDIO/);
  await muteBtn.click();
  await expect(muteBtn).toHaveText(/MUTED/);
  const isMutedAfterClick = await page.evaluate(() => (window as any).isMuted);
  expect(isMutedAfterClick).toBe(true);

  // Press 'm' key to unmute
  await page.keyboard.press('m');
  await expect(muteBtn).toHaveText(/AUDIO/);
  const isMutedAfterKey = await page.evaluate(() => (window as any).isMuted);
  expect(isMutedAfterKey).toBe(false);

  // 4. Test Holding Space for Rapid Fire
  const scoreBeforeHoldSpace = await page.evaluate(() => (window as any).score);
  await page.keyboard.down('Space');
  await page.waitForTimeout(450); // Hold for ~450ms (~3-4 shots)
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);

  const scoreAfterHoldSpace = await page.evaluate(() => (window as any).score);
  const shotsFiredSpace = scoreBeforeHoldSpace - scoreAfterHoldSpace;
  console.log(`Shots fired by holding space: ${shotsFiredSpace}`);
  expect(shotsFiredSpace).toBeGreaterThanOrEqual(2);

  // 5. Test Holding Mouse for Rapid Fire and Mouse Aiming
  await page.mouse.move(250, 180);
  const angleAimLeft = await page.evaluate(() => (window as any).turretAngle);
  expect(angleAimLeft).toBeLessThan(-Math.PI / 2); // aiming top-left

  const scoreBeforeHoldMouse = await page.evaluate(() => (window as any).score);
  await page.mouse.down();
  await page.waitForTimeout(450); // Hold mouse for ~450ms
  await page.mouse.up();
  await page.waitForTimeout(100);

  const scoreAfterHoldMouse = await page.evaluate(() => (window as any).score);
  const shotsFiredMouse = scoreBeforeHoldMouse - scoreAfterHoldMouse;
  console.log(`Shots fired by holding mouse: ${shotsFiredMouse}`);
  expect(shotsFiredMouse).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: '/home/brad/sabotage/screenshot_desktop_gameplay.png' });

  // 6. Test Paratrooper Walking, Stacking, and 3-Stack Game Over
  // Reset game state for controlled test
  await page.evaluate(() => {
    (window as any).reset();
    (window as any).running = true;
    (window as any).helicopters = [];
    (window as any).jets = [];
    (window as any).bombs = [];
    (window as any).shells = [];
    (window as any).paratroopers = [];
  });

  // Spawn paratrooper 1 on left side near ground
  await page.evaluate(() => {
    const W = (window as any).W;
    const H = (window as any).H;
    const turretX = (window as any).turretX;
    (window as any).paratroopers.push({
      x: turretX - 100,
      y: H * 0.92 - 5,
      vy: 60,
      vx: 38,
      parachute: false,
      state: "walking",
      side: "left",
      stackLevel: 0,
      animTimer: 0
    });
  });

  // Let trooper 1 walk to turret
  await page.waitForTimeout(1500); // 100px / 38px/s ~ 2.6s, or speed up simulation
  await page.evaluate(() => {
    // Advance time by 2.5s
    for (let i = 0; i < 50; i++) {
      (window as any).update(0.05);
    }
  });

  const parasAfter1 = await page.evaluate(() => {
    return (window as any).paratroopers.map((p: any) => ({ state: p.state, stackLevel: p.stackLevel, x: p.x, side: p.side }));
  });
  console.log('Paras after 1 walks:', parasAfter1);
  expect(parasAfter1[0].state).toBe('stacked');
  expect(parasAfter1[0].stackLevel).toBe(0);
  const runningAfter1 = await page.evaluate(() => (window as any).running);
  expect(runningAfter1).toBe(true); // Game does NOT end on 1st land/stack!

  // Spawn trooper 2 on left side and step
  await page.evaluate(() => {
    const turretX = (window as any).turretX;
    const H = (window as any).H;
    (window as any).paratroopers.push({
      x: turretX - 28, // right at stack position
      y: H * 0.92 - 5,
      vy: 60,
      vx: 38,
      parachute: false,
      state: "walking",
      side: "left",
      stackLevel: 0,
      animTimer: 0
    });
    // Step simulation so Trooper 2 climbs to Level 1
    for (let i = 0; i < 20; i++) {
      (window as any).update(0.05);
    }
  });

  const parasAfter2 = await page.evaluate(() => {
    return (window as any).paratroopers
      .filter((p: any) => p.side === "left" && p.state === "stacked")
      .map((p: any) => ({ state: p.state, stackLevel: p.stackLevel }));
  });
  console.log('Stacked on left after 2:', parasAfter2);
  expect(parasAfter2.length).toBe(2);
  expect(parasAfter2[1].stackLevel).toBe(1);
  const runningAfter2 = await page.evaluate(() => (window as any).running);
  expect(runningAfter2).toBe(true); // Game does NOT end on 2nd stack!

  await page.screenshot({ path: '/home/brad/sabotage/screenshot_paratrooper_stacking.png' });

  // Spawn trooper 3 on left side and step -> Trooper 3 should enter CLIMBING state (game continues while climbing)
  await page.evaluate(() => {
    const turretX = (window as any).turretX;
    const H = (window as any).H;
    (window as any).paratroopers.push({
      x: turretX - 28,
      y: H * 0.92 - 5,
      vy: 60,
      vx: 38,
      parachute: false,
      state: "walking",
      side: "left",
      stackLevel: 0,
      animTimer: 0
    });
    // Step once: Trooper 3 touches stack base and starts climbing
    (window as any).update(0.05);
  });

  const trooper3WhileClimbing = await page.evaluate(() => {
    return (window as any).paratroopers.find((p: any) => p.side === "left" && p.stackLevel === 2);
  });
  console.log('Trooper 3 while climbing:', trooper3WhileClimbing);
  expect(trooper3WhileClimbing.state).toBe('climbing');

  const runningWhileClimbing = await page.evaluate(() => (window as any).running);
  console.log(`Running while trooper 3 is climbing: ${runningWhileClimbing}`);
  expect(runningWhileClimbing).toBe(true); // Game MUST STILL BE RUNNING while he climbs!

  await page.screenshot({ path: '/home/brad/sabotage/screenshot_trooper3_climbing.png' });

  // Advance time so Trooper 3 climbs all the way to the top (y <= groundY - 33)
  await page.evaluate(() => {
    for (let i = 0; i < 35; i++) {
      (window as any).update(0.05);
    }
  });

  const runningAfterReachTop = await page.evaluate(() => (window as any).running);
  const overlayVisible = await page.locator('#overlay').isVisible();
  console.log(`Running after reaching top: ${runningAfterReachTop}, Overlay visible: ${overlayVisible}`);
  expect(runningAfterReachTop).toBe(false); // Game OVER only when he reaches top!
  expect(overlayVisible).toBe(true);

  const gameOverText = await page.locator('#overlay h2').textContent();
  console.log(`Game over message: ${gameOverText}`);
  expect(gameOverText).toContain('Three paratroopers stacked up');

  await page.screenshot({ path: '/home/brad/sabotage/screenshot_game_over_3stack.png' });

  // 7. Test Shooting Parachute Canopy (Man freefalls to death) vs Shooting Man Directly
  await page.evaluate(() => {
    (window as any).reset();
    (window as any).running = true;
    document.getElementById("overlay")?.classList.add("hidden");
    (window as any).helicopters = [];
    (window as any).jets = [];
    (window as any).bombs = [];
    (window as any).shells = [];
    (window as any).paratroopers = [];

    // Spawn falling paratrooper with open chute
    (window as any).paratroopers.push({
      x: 300,
      y: 200,
      vy: 60,
      vx: 0,
      parachute: true,
      state: "falling",
      side: null,
      stackLevel: 0,
      animTimer: 0
    });

    // Spawn shell aiming at the parachute canopy (y = 200 - 25 = 175)
    (window as any).shells.push({
      x: 300,
      y: 175,
      vx: 0,
      vy: -100
    });

    // Run collision step
    (window as any).update(0.016);
  });

  const chuteHitPara = await page.evaluate(() => {
    return (window as any).paratroopers[0];
  });
  console.log('Para after chute hit:', chuteHitPara);
  expect(chuteHitPara.parachute).toBe(false);
  expect(chuteHitPara.state).toBe('freefalling');
  expect(chuteHitPara.vy).toBe(300);

  // Take screenshot of panicked freefalling trooper
  await page.screenshot({ path: '/home/brad/sabotage/screenshot_freefalling_trooper.png' });

  // 8. Test Ground Trooper Immunity to Gunfire
  await page.evaluate(() => {
    (window as any).shells = [];
    (window as any).paratroopers = [];
    const H = (window as any).H;
    const turretX = (window as any).turretX;
    
    // Spawn walking trooper on ground
    (window as any).paratroopers.push({
      x: turretX - 120,
      y: H * 0.92 - 5,
      vy: 0,
      vx: 38,
      parachute: false,
      state: "walking",
      side: "left",
      stackLevel: 0,
      animTimer: 0
    });

    // Spawn shell directly aiming through the walking trooper
    (window as any).shells.push({
      x: turretX - 120,
      y: H * 0.92 - 5,
      vx: 100,
      vy: 0
    });

    (window as any).update(0.016);
  });

  // Take screenshot showing shell passing through ground trooper
  await page.screenshot({ path: '/home/brad/sabotage/screenshot_ground_immunity.png' });

  const walkingTrooperAfterShell = await page.evaluate(() => (window as any).paratroopers[0]);
  console.log('Walking trooper after shell collision step:', walkingTrooperAfterShell);
  expect(walkingTrooperAfterShell).toBeDefined();
  expect(walkingTrooperAfterShell.state).toBe('walking'); // Immune to gunfire!

  // 9. Test Bomb Killing Men on Ground
  await page.evaluate(() => {
    (window as any).shells = [];
    const H = (window as any).H;
    const trooperX = (window as any).paratroopers[0].x;
    
    // Spawn bomb dropping directly onto walking trooper
    (window as any).bombs.push({
      x: trooperX,
      y: H * 0.92 - 10,
      vx: 0,
      vy: 100
    });

    (window as any).update(0.05);
  });

  const troopersAfterBomb = await page.evaluate(() => (window as any).paratroopers.length);
  console.log('Troopers after bomb hit:', troopersAfterBomb);
  expect(troopersAfterBomb).toBe(0); // Killed by bomb!

  // 10. Test Freefalling Paratrooper Crushing Ground Trooper
  await page.evaluate(() => {
    const H = (window as any).H;
    const turretX = (window as any).turretX;
    (window as any).bombs = [];
    (window as any).shells = [];
    (window as any).paratroopers = [];

    // Ground stacked trooper
    (window as any).paratroopers.push({
      x: turretX - 28,
      y: H * 0.92 - 5,
      vy: 0,
      vx: 0,
      parachute: false,
      state: "stacked",
      side: "left",
      stackLevel: 0,
      animTimer: 0
    });

    // Freefalling trooper directly above
    (window as any).paratroopers.push({
      x: turretX - 28,
      y: H * 0.92 - 15,
      vy: 300,
      vx: 0,
      parachute: false,
      state: "freefalling",
      side: null,
      stackLevel: 0,
      animTimer: 0
    });

    // Run step so freefalling trooper hits the ground
    (window as any).update(0.05);
  });

  const troopersAfterCrush = await page.evaluate(() => (window as any).paratroopers.length);
  console.log('Troopers after crush:', troopersAfterCrush);
  expect(troopersAfterCrush).toBe(0); // Both crushed & splatted!

  // 11. Mobile Viewport & Mobile Controls Rapid Fire
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    (window as any).startGame();
  });
  await expect(page.locator('#overlay')).toBeHidden();
  await page.waitForTimeout(200);

  // Test Rapid fire on mobile fire button
  const scoreBeforeMobileFire = await page.evaluate(() => (window as any).score);
  await page.locator('#btn-fire').dispatchEvent('touchstart');
  await page.waitForTimeout(450); // Hold for 450ms
  await page.locator('#btn-fire').dispatchEvent('touchend');
  await page.waitForTimeout(100);

  const scoreAfterMobileFire = await page.evaluate(() => (window as any).score);
  const shotsMobileFire = scoreBeforeMobileFire - scoreAfterMobileFire;
  console.log(`Shots fired by holding mobile fire button: ${shotsMobileFire}`);
  expect(shotsMobileFire).toBeGreaterThanOrEqual(2);

  // Mobile screenshot
  await page.screenshot({ path: '/home/brad/sabotage/screenshot_mobile.png' });
});
