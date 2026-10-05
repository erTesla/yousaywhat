/**
 * Visual capture of the screens touched by the CSS consolidation.
 * Writes PNGs to e2e/shots/ for manual inspection.
 *
 * ⚠ Runs against the live site and creates a session + games, like the smoke test.
 * Usage: node e2e/shots.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

const BASE = process.env.BASE || 'https://yousaywhat.web.app';
const OUT  = 'e2e/shots';
mkdirSync(OUT, { recursive: true });

const NAME = 'UI Check ' + Date.now().toString().slice(-5);
const PW   = 'shots-pw-1234';
let n = 0;
const shot = async (pg, label, locator) => {
  const file = `${OUT}/${String(++n).padStart(2, '0')}-${label}.png`;
  const target = locator ? pg.locator(locator).first() : pg;
  await target.screenshot({ path: file }).catch(async () => { await pg.screenshot({ path: file }); });
  console.log('  ' + file);
};

const run = async () => {
  const browser = await chromium.launch();
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const playCtx = await browser.newContext({ viewport: { width: 390, height: 780 } }); // phone
  const host = await hostCtx.newPage();
  const play = await playCtx.newPage();

  // Home: pin-input uppercasing + ScoreRow in the mini leaderboard
  await host.goto(BASE, { waitUntil: 'domcontentloaded' });
  await host.waitForTimeout(3500);
  await shot(host, 'home-full');
  await shot(host, 'home-mini-leaderboard', '.mini-lb');

  // Session + type picker (gtc-tag pills)
  await host.getByRole('button', { name: /Start a Session/i }).click();
  await host.getByPlaceholder(/Session name/i).fill(NAME);
  await host.getByPlaceholder(/Host password/i).fill(PW);
  await host.getByRole('button', { name: /Create Session/i }).click();
  await host.waitForURL(/\/session\/host/, { timeout: 25000 });
  const code = (await host.locator('.session-code-badge strong').first().innerText()).trim();
  console.log('  session =', code);
  await shot(host, 'dashboard-empty');

  // player joins
  await play.goto(BASE, { waitUntil: 'domcontentloaded' });
  await play.waitForTimeout(3500);
  await play.locator('.pin-input').fill(code.toLowerCase());   // check uppercasing
  await shot(play, 'phone-pin-input-uppercase', '.join-card');
  await play.getByRole('button', { name: /^Join$/ }).click();
  await play.waitForURL(/\/session\/join/, { timeout: 25000 });
  await play.getByPlaceholder(/Your name/i).fill('Ada');
  await play.getByRole('button', { name: /Join Session/i }).click();
  await play.waitForURL(/\/session\/play/, { timeout: 25000 });
  await play.waitForTimeout(2000);
  await shot(play, 'phone-waiting-lobby');

  await host.getByRole('button', { name: /Start New Game/i }).click();
  await host.waitForURL(/\/create\?/, { timeout: 25000 });
  await host.locator('.game-type-card').first().waitFor({ state: 'visible', timeout: 25000 });
  await shot(host, 'type-picker-tags', '.game-type-grid');

  // ── POLL: host live graph (hpg bars, 20px) ──
  await host.locator('.game-type-card', { hasText: 'Poll' }).first().click();
  await host.waitForURL(/\/create\/setup/, { timeout: 25000 });
  await host.getByPlaceholder(/Question text/i).fill('Best language for a quiz app?');
  for (const [l, v] of [['A', 'JavaScript'], ['B', 'Python'], ['C', 'Rust'], ['D', 'Go']]) {
    await host.getByPlaceholder(`Option ${l}`).fill(v);
  }
  await shot(host, 'setup-poll-editor');
  await host.getByRole('button', { name: /Launch Game Now/i }).click();
  await host.waitForURL(/\/host\?/, { timeout: 25000 });
  await host.waitForTimeout(2500);
  await shot(host, 'host-topbar-kind-badge', '.host-topbar');

  await play.waitForURL(/\/play\?pin=/, { timeout: 30000 });
  const open = host.getByRole('button', { name: /Open Poll/i });
  await open.waitFor({ state: 'visible', timeout: 25000 });
  await host.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Open Poll/i.test(x.textContent));
    return b && !b.disabled;
  }, null, { timeout: 25000 }).catch(() => {});
  await open.click();

  await play.locator('.poll-option').first().waitFor({ state: 'visible', timeout: 25000 });
  await shot(play, 'phone-poll-vote-and-emoji-strip');
  await play.locator('.poll-option').first().click();   // JavaScript
  await host.waitForTimeout(3000);
  await shot(host, 'host-live-poll-graph');
  await shot(host, 'host-poll-graph-closeup', '.wc-stage');
  await play.waitForTimeout(1500);
  await shot(play, 'phone-poll-live-results');

  await host.getByRole('button', { name: /End poll/i }).click();
  await host.waitForTimeout(4000);
  await shot(host, 'host-poll-ended');

  // ── Dashboard: activity preview (poll-mini bars, 7px) + history pills ──
  await host.goto(`${BASE}/session/host?code=${code}&secret=x`, { waitUntil: 'domcontentloaded' });
  await host.locator('.session-clouds-card').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await host.waitForTimeout(2000);
  await shot(host, 'dashboard-with-activity');
  await shot(host, 'dashboard-activity-preview', '.session-clouds-card');
  await shot(host, 'dashboard-history-pills', '.session-history-card');
  await shot(host, 'dashboard-leaderboard-scorerow', '.session-lb-card');

  // ── QUIZ: results breakdown (qb bars keep squared corners + per-choice colour) ──
  await host.getByRole('button', { name: /Start New Game/i }).click();
  await host.waitForURL(/\/create\?/, { timeout: 25000 });
  await host.locator('.game-type-card').first().waitFor({ state: 'visible', timeout: 25000 });
  await host.locator('.game-type-card', { hasText: 'Quiz' }).first().click();
  await host.waitForURL(/\/create\/setup/, { timeout: 25000 });
  await host.getByPlaceholder(/Question text/i).fill('What is 7 x 6?');
  for (const [l, v] of [['A', '42'], ['B', '36'], ['C', '48'], ['D', '49']]) {
    await host.getByPlaceholder(`Answer ${l}`).fill(v);
  }
  await host.locator('input[type=radio]').nth(0).check();
  await host.getByRole('button', { name: /Launch Game Now/i }).click();
  await host.waitForURL(/\/host\?/, { timeout: 25000 });
  await play.waitForURL(/\/play\?pin=/, { timeout: 30000 });
  const start = host.getByRole('button', { name: /Start Game/i });
  await start.waitFor({ state: 'visible', timeout: 25000 });
  await host.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Start Game/i.test(x.textContent));
    return b && !b.disabled;
  }, null, { timeout: 25000 }).catch(() => {});
  await start.click();
  await play.locator('.answer-btn').first().waitFor({ state: 'visible', timeout: 25000 });
  await shot(play, 'phone-quiz-answer-grid');
  await play.locator('.answer-btn').nth(0).click();
  await host.getByRole('button', { name: /Reveal Answer/i }).click({ timeout: 25000 });
  await host.waitForTimeout(1500);
  await shot(host, 'host-reveal-mcq');
  await host.getByRole('button', { name: /Show Scoreboard/i }).click();
  await host.waitForTimeout(1500);
  await shot(host, 'host-scoreboard-scorerow');
  const pin = new URL(host.url()).searchParams.get('pin');
  const secret = new URL(host.url()).searchParams.get('secret');
  await host.getByRole('button', { name: /End Game/i }).click();
  await host.waitForTimeout(4000);
  await shot(host, 'host-final-results');

  // results breakdown as host (qb bars)
  const res = await hostCtx.newPage();
  await res.goto(`${BASE}/results?pin=${pin}&secret=${secret}`, { waitUntil: 'domcontentloaded' });
  await res.waitForTimeout(4000);
  await shot(res, 'results-breakdown-qb-bars');
  await res.close();

  console.log(`\n${n} screenshots in ${OUT}/   session=${code}`);
  await browser.close();
};

run().catch(e => { console.error('SHOT ERROR:', e.message.split('\n')[0]); process.exit(1); });
