import { test, expect } from '@playwright/test';
import path from 'path';

const VW = 720; // must match the virtual field in index.html
const VH = 480;

/**
 * Load the game at a given viewport, set up a deterministic helo, step the
 * simulation for a fixed amount of virtual time, and return the resulting
 * game-space state. Parity holds iff W/H and the helo's motion are identical
 * across viewports — i.e. difficulty no longer depends on screen size.
 */
async function stateAtViewport(page: any, width: number, height: number) {
  await page.setViewportSize({ width, height });
  const filePath = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(filePath);

  await page.evaluate(() => {
    (window as any).reset();
    // One deterministic helo: virtual x=100, moving right at 80 virtual px/s.
    (window as any).helicopters = [
      { x: 100, y: VH / 2, vx: 80, vy: 0, rotorAngle: 0, dropping: false },
    ];
    (window as any).paratroopers = [];
    (window as any).bombs = [];
    (window as any).shells = [];
    // reset() already sets heloSpawnTimer=2; we only step 0.25s so auto-spawn
    // never fires and the helo motion is fully deterministic.
    // Step a fixed 0.25s → helo should advance 80 * 0.25 = 20 virtual px.
    for (let i = 0; i < 5; i++) (window as any).update(0.05);
  });

  return page.evaluate(() => ({
    W: (window as any).W,
    H: (window as any).H,
    scale: (window as any).scale,
    offsetX: (window as any).offsetX,
    offsetY: (window as any).offsetY,
    cssW: (window as any).cssW,
    cssH: (window as any).cssH,
    turretX: (window as any).turretX,
    groundY: (window as any).groundY,
    heloX: (window as any).helicopters[0].x,
  }));
}

test('Playfield geometry is identical across viewport sizes', async ({ page }) => {
  const phone = await stateAtViewport(page, 390, 844);   // ~iPhone portrait
  const laptop = await stateAtViewport(page, 1280, 720); // ~laptop
  const wide4k = await stateAtViewport(page, 3840, 2160); // ~4K ultrawide-ish

  console.log('phone ', phone);
  console.log('laptop', laptop);
  console.log('wide4k', wide4k);

  // 1. Game space is a fixed virtual field regardless of the visible width/height.
  for (const s of [phone, laptop, wide4k]) {
    expect(s.W).toBe(VW);
    expect(s.H).toBe(VH);
    expect(s.turretX).toBe(VW / 2);
    expect(s.groundY).toBeCloseTo(VH * 0.92, 3);
  }

  // 2. Deterministic motion is viewport-independent (helo at x=100 + 20 vpx).
  expect(phone.heloX).toBeCloseTo(120, 2);
  expect(laptop.heloX).toBeCloseTo(phone.heloX, 6);
  expect(wide4k.heloX).toBeCloseTo(phone.heloX, 6);

  // 3. The renderer maps the same virtual field to a different on-screen size
  //    (scale + letterbox must adapt) — this is the whole point of the fix.
  expect(phone.scale).not.toEqual(laptop.scale);
  expect(laptop.scale).not.toEqual(wide4k.scale);
  // Uniform-scale invariant: the virtual field always fits inside the viewport.
  for (const s of [phone, laptop, wide4k]) {
    expect(s.cssW).toBeGreaterThanOrEqual(s.W * s.scale - 1);
    expect(s.cssH).toBeGreaterThanOrEqual(s.H * s.scale - 1);
    expect(s.offsetX).toBeGreaterThanOrEqual(0);
    expect(s.offsetY).toBeGreaterThanOrEqual(0);
  }
});
