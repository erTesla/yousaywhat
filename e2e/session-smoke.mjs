/**
 * End-to-end smoke test for the persistent-sessions flow.
 *
 * Drives two separate browser contexts (host + player) so each gets its own
 * anonymous Firebase uid, then plays two full games in one session.
 *
 * ⚠ RUNS AGAINST THE LIVE SITE AND WRITES REAL DATA.
 *   Each run creates a session ("E2E Test <n>"), two games, and — because the
 *   player scores points — one `globalLeaderboard` entry named "TEST-Player".
 *   The monotonic totalScore rule means that entry CANNOT be removed from the
 *   client; delete it in the Firebase Console if it clutters the leaderboard.
 *
 *   Point at a local dev server instead with:  BASE=http://localhost:5173
 *
 * Usage:  npm run test:e2e
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'https://yousaywhat.web.app';
const results = [];
const log = (...a) => console.log(...a);

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const SESSION_NAME  = 'E2E Test ' + Date.now().toString().slice(-6);
const HOST_PASSWORD = 'e2e-secret-' + Date.now().toString().slice(-4);

async function run() {
  const browser = await chromium.launch();
  // Separate contexts => separate storage => distinct anonymous Firebase uids
  const hostCtx   = await browser.newContext();
  const playerCtx = await browser.newContext();
  const host   = await hostCtx.newPage();
  const player = await playerCtx.newPage();
  globalThis.__pages = { host, player };

  const errors = [];
  for (const [who, pg] of [['host', host], ['player', player]]) {
    pg.on('pageerror', e => errors.push(`${who} pageerror: ${e.message}`));
    pg.on('console', m => {
      if (m.type() === 'error') errors.push(`${who} console: ${m.text().slice(0, 200)}`);
    });
  }

  // ───────────────────────────── 1. Host creates a session
  log('\n[1] Host creates session');
  await host.goto(BASE, { waitUntil: 'networkidle' });
  await host.getByRole('button', { name: /Start a Session/i }).click();
  await host.getByPlaceholder(/Session name/i).fill(SESSION_NAME);
  await host.getByPlaceholder(/Host password/i).fill(HOST_PASSWORD);
  await host.getByRole('button', { name: /Create Session/i }).click();

  await host.waitForURL(/\/session\/host/, { timeout: 20000 });
  const code = (await host.locator('.session-code-badge strong').first().innerText()).trim();
  check('session created, memorable code issued', /^[A-Z]+-\d{4}$/.test(code), `code=${code}`);
  check('session name shown on dashboard', (await host.locator('h1').innerText()).includes(SESSION_NAME));
  check('5.5 copy button present', await host.getByRole('button', { name: /^Copy$/ }).isVisible());
  check('status chip reads idle', (await host.locator('.status-chip').innerText()).toLowerCase().includes('idle'));

  // ───────────────────────────── 2. Player joins by session code
  log('\n[2] Player joins by session code');
  await player.goto(BASE, { waitUntil: 'networkidle' });
  await player.waitForTimeout(2500);   // let anonymous sign-in settle
  await player.locator('.pin-input').fill(code);
  await player.getByRole('button', { name: /^Join$/ }).click();
  await player.waitForURL(/\/session\/join/, { timeout: 20000 });
  check('session code routed to session join (not game PIN)', true);
  await player.getByPlaceholder(/Your name/i).fill('TEST-Player');
  await player.getByRole('button', { name: /Join Session/i }).click();
  await player.waitForURL(/\/session\/play/, { timeout: 20000 });
  await player.waitForSelector('text=/Waiting for the host/i', { timeout: 20000 });
  check('player lands in waiting room', true);

  await host.waitForSelector('text=/1 player joined/i', { timeout: 20000 });
  check('host dashboard sees the joined player', true);

  // ───────────────────────────── 3. Host starts a game
  log('\n[3] Host creates game (1 question)');
  await host.getByRole('button', { name: /Start New Game/i }).click();
  await host.waitForURL(/\/create\?/, { timeout: 20000 });
  check('create picker carries sessionCode', host.url().includes(`sessionCode=${code}`));
  await host.locator('.game-type-card').first().waitFor({ state: 'visible', timeout: 25000 });
  const labels = await host.locator('.gtc-label').allInnerTexts();
  check('poll type offered again, now as its own format', labels.some(l => /poll/i.test(l)), labels.join('/'));
  const tags = await host.locator('.gtc-tag').allInnerTexts();
  check('activities are labelled "no scoring" in the picker',
        tags.filter(t => /no scoring/i.test(t)).length === 2, tags.join(' / '));

  await host.locator('.game-type-card', { hasText: 'Quiz' }).first().click();
  await host.waitForURL(/\/create\/setup/, { timeout: 20000 });

  // 1.3: session must NOT be 'playing' yet (questions don't exist)
  const stillWaiting = await player.locator('text=/Waiting for the host/i').isVisible();
  check('1.3 player NOT pulled in before questions exist', stillWaiting);

  await host.getByPlaceholder(/Question text/i).fill('What is 2 + 2?');
  for (const [i, v] of [['A', '3'], ['B', '4'], ['C', '5'], ['D', '6']]) {
    await host.getByPlaceholder(`Answer ${i}`).fill(v);
  }
  await host.locator('input[type=radio]').nth(1).check();   // B = 4 correct
  await host.getByRole('button', { name: /Launch Game/i }).click();
  await host.waitForURL(/\/host\?/, { timeout: 20000 });
  check('host landed on host screen', true);

  // ───────────────────────────── 4. Player auto-joins
  log('\n[4] Player auto-joins the launched game');
  await player.waitForURL(/\/play\?pin=/, { timeout: 25000 });
  await player.waitForTimeout(1200);
  check('player auto-pushed into game without re-entering PIN',
        /sessionCode=/i.test(player.url()), player.url().replace(BASE, ''));
  await player.waitForSelector('text=/Waiting for host to start/i', { timeout: 20000 });

  // ───────────────────────────── 5. Play the question
  log('\n[5] Question / answer / reveal / scoreboard');
  await host.getByRole('button', { name: /Start Game/i }).click();
  await player.waitForSelector('.answer-btn', { timeout: 20000 });
  await player.locator('.answer-btn').nth(1).click();       // correct
  await player.waitForSelector('.answered-splash', { timeout: 20000 });

  await host.getByRole('button', { name: /Reveal Answer/i }).click({ timeout: 25000 });
  await player.waitForSelector('.reveal-banner', { timeout: 20000 });
  const revealTxt = await player.locator('.reveal-banner').innerText();
  check('player sees Correct! on right answer', /Correct/i.test(revealTxt), revealTxt.replace(/\n/g, ' '));

  // THE BIG ONE: scoreboard used to white-screen for both sides
  await host.getByRole('button', { name: /Show Scoreboard/i }).click();
  await host.waitForTimeout(1500);
  const hostRows   = await host.locator('.score-row').count();
  const hostBody   = (await host.locator('body').innerText()).trim();
  check('0.1 host scoreboard renders (no white screen)', hostRows > 0, `${hostRows} rows`);
  check('0.1 host page not blank', hostBody.length > 20, `${hostBody.length} chars`);
  const playerRows = await player.locator('.score-row').count();
  check('0.1 player scoreboard renders', playerRows > 0, `${playerRows} rows`);

  // ───────────────────────────── 6. End game -> session tally
  log('\n[6] End game and tally into session');
  await host.getByRole('button', { name: /End Game/i }).click();
  await host.waitForSelector('text=/Final Results/i', { timeout: 20000 });
  check('host sees final results + podium', await host.locator('.podium, .scoreboard').count() > 0);
  check('1.2/session: Back to Session Dashboard offered', await host.getByRole('button', { name: /Back to Session/i }).isVisible());

  await player.waitForSelector('text=/Game Over|You Won/i', { timeout: 20000 });
  check('6.x player sees Back to Session (not Play Again)', await player.getByRole('button', { name: /Back to Session/i }).isVisible());

  // 0.3 player results page
  const resPage = await playerCtx.newPage();
  await resPage.goto(`${BASE}/results?pin=${new URL(host.url()).searchParams.get('pin')}`, { waitUntil: 'networkidle' });
  // Assert real content rendered, not just the absence of an error while loading
  await resPage.locator('.score-row, .results-section').first()
    .waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  const resTxt = (await resPage.locator('body').innerText());
  check('0.3 player results page loads (was permission-denied)',
        !/Could not load/i.test(resTxt) && /TEST-Player/.test(resTxt),
        resTxt.replace(/\n+/g, ' | ').slice(0, 90));
  await resPage.close();

  // back to dashboard, confirm cumulative score landed
  await host.getByRole('button', { name: /Back to Session/i }).click();
  await host.waitForURL(/\/session\/host/, { timeout: 20000 });
  await host.waitForTimeout(2500);
  const lbTxt = await host.locator('.session-lb-card').innerText();
  check('3.3 cumulative session score recorded', /TEST-Player/.test(lbTxt) && /[1-9]/.test(lbTxt), lbTxt.replace(/\n/g, ' ').slice(0, 90));
  const gamesTxt = await host.locator('.session-history-card').innerText();
  check('session past-games list records the game', /Games Played \(1\)/.test(gamesTxt), gamesTxt.split('\n')[0]);
  check('5.7 past game row is a link to results', await host.locator('a.session-game-row').count() > 0);

  // player returns to waiting room
  await player.getByRole('button', { name: /Back to Session/i }).click();
  await player.waitForURL(/\/session\/play/, { timeout: 20000 });
  await player.waitForTimeout(2000);
  const sp = await player.locator('body').innerText();
  check('player back in waiting room with session total', /Your total/i.test(sp), (sp.match(/Your total[^\n]*/) || [''])[0]);

  // ───────────────────────────── 7. Second game (the loop)
  log('\n[7] Second game in the same session');
  await host.getByRole('button', { name: /Start New Game/i }).click();
  await host.waitForURL(/\/create\?/, { timeout: 20000 });
  await host.locator('.game-type-card', { hasText: 'Quiz' }).first().click();
  await host.waitForURL(/\/create\/setup/, { timeout: 20000 });
  await host.getByPlaceholder(/Question text/i).fill('Capital of France?');
  for (const [i, v] of [['A', 'Paris'], ['B', 'Rome'], ['C', 'Oslo'], ['D', 'Lima']]) {
    await host.getByPlaceholder(`Answer ${i}`).fill(v);
  }
  await host.locator('input[type=radio]').nth(0).check();
  await host.getByRole('button', { name: /Launch Game/i }).click();
  await host.waitForURL(/\/host\?/, { timeout: 20000 });

  await player.waitForURL(/\/play\?pin=/, { timeout: 25000 });
  check('second game: player auto-joined again (loop works)', true);

  // 1.2 Resume/Cancel while a game is live
  const dash = await hostCtx.newPage();
  await dash.goto(host.url().replace(/\/host\?.*$/, `/session/host?code=${code}&secret=x`), { waitUntil: 'networkidle' });
  // Wait for the live-game banner rather than a fixed sleep — the dashboard has
  // to auth, verify host, then attach the session listener before it appears.
  const banner = dash.locator('.session-active-banner');
  await banner.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  const liveTxt = await dash.locator('body').innerText();
  check('1.2 dashboard shows game in progress', /Game in progress/i.test(liveTxt));
  check('1.2 Resume Game button present', await dash.getByRole('button', { name: /Resume Game/i }).count() > 0);
  check('1.2 Cancel button present', await dash.getByRole('button', { name: /^Cancel$/ }).count() > 0);
  const newGameDisabled = await dash.getByRole('button', { name: /Start New Game/i }).isDisabled();
  check('1.2 Start New Game disabled while game live', newGameDisabled);

  // 1.2 Resume actually gets back into the host screen
  await dash.getByRole('button', { name: /Resume Game/i }).click();
  await dash.waitForURL(/\/host\?/, { timeout: 20000 });
  await dash.waitForTimeout(6000);
  const resumedOk = await dash.locator('.host-topbar').count() > 0;
  const dashBody  = (await dash.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 160);
  check('1.2 Resume Game re-enters host screen with working secret', resumedOk, resumedOk ? '' : dashBody);
  await dash.close();

  // 1.1 score-wipe guard: player goes back to waiting room mid-game, then rejoins
  log('\n[8] 1.1 mid-game back-button score guard');
  await host.getByRole('button', { name: /Start Game/i }).click();
  await player.waitForSelector('.answer-btn', { timeout: 20000 });
  await player.locator('.answer-btn').nth(0).click();   // correct -> points
  await host.getByRole('button', { name: /Reveal Answer/i }).click({ timeout: 25000 });
  await player.waitForSelector('.reveal-banner', { timeout: 20000 });
  const scoreBefore = parseInt(((await player.locator('.reveal-total').innerText()).match(/\d+/) || [0])[0], 10);

  await player.goto(`${BASE}/session/play?code=${code}`, { waitUntil: 'networkidle' });
  // Wait for the session to actually resolve rather than asserting on "Loading…"
  await player.locator('.session-waiting').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  const afterNav = await player.locator('body').innerText();
  const offeredRejoin = /Rejoin Game/i.test(afterNav);
  check('1.1 returning mid-game offers Rejoin instead of auto-yanking', offeredRejoin,
        offeredRejoin ? 'manual rejoin shown' : afterNav.slice(0, 100).replace(/\n/g, ' '));

  if (offeredRejoin) {
    await player.getByRole('button', { name: /Rejoin Game/i }).click();
    await player.waitForURL(/\/play\?pin=/, { timeout: 20000 });
    await player.waitForTimeout(2500);
    const scoreAfter = parseInt((((await player.locator('body').innerText()).match(/Total:\s*(\d+)/) || [0, 0])[1]), 10);
    check('1.1 score preserved across rejoin (not reset to 0)',
          scoreAfter >= scoreBefore && scoreBefore > 0, `before=${scoreBefore} after=${scoreAfter}`);
  }

  // ───────────────────────────── 8b. Team mode gating + saved games
  log('\n[8b] Team mode gating and saved games');
  const d3 = await hostCtx.newPage();
  globalThis.__pages.d3 = d3;
  await d3.goto(`${BASE}/session/host?code=${code}&secret=x`, { waitUntil: 'networkidle' });
  await d3.locator('.session-teams-bar').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  check('team mode toggle present and OFF by default',
        (await d3.locator('.toggle-btn').innerText()).includes('OFF'));
  check('saved games card present', await d3.locator('.session-drafts-card').count() > 0);

  // Build a game and save it instead of launching
  await d3.getByRole('button', { name: /^Cancel$/ }).click().catch(() => {});
  await d3.waitForTimeout(2000);
  await d3.getByRole('button', { name: /Start New Game/i }).click();
  await d3.waitForURL(/\/create\?/, { timeout: 20000 });
  await d3.locator('.game-type-card', { hasText: 'Poll' }).first().click();
  await d3.waitForURL(/\/create\/setup/, { timeout: 20000 });
  check('poll editor hides the correct-answer radio',
        await d3.locator('input[type=radio]').count() === 0);
  await d3.getByPlaceholder(/Question text/i).fill('Tea or coffee?');
  await d3.getByPlaceholder(/Option A/i).fill('Tea');
  await d3.getByPlaceholder(/Option B/i).fill('Coffee');
  await d3.getByPlaceholder(/Name this game/i).fill('E2E Saved Poll');
  await d3.getByRole('button', { name: /Save for later/i }).click();
  await d3.waitForURL(/\/session\/host/, { timeout: 20000 });
  await d3.locator('.draft-row').first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  const draftTxt = await d3.locator('.session-drafts-card').innerText();
  check('saved game appears on the dashboard', /E2E Saved Poll/.test(draftTxt),
        draftTxt.replace(/\n+/g, ' | ').slice(0, 100));
  check('saved game is labelled as a Poll', /Poll/.test(draftTxt));
  check('saved game has Play and Delete',
        await d3.getByRole('button', { name: /^Play$/ }).count() > 0 &&
        await d3.getByRole('button', { name: /^Delete$/ }).count() > 0);
  await d3.close();
  delete globalThis.__pages.d3;

  // ───────────────────────────── 8c. Word cloud: its own flow end to end
  log('\n[8c] Word cloud dedicated flow');
  const wcHost = await hostCtx.newPage();
  globalThis.__pages.wcHost = wcHost;
  await wcHost.goto(`${BASE}/session/host?code=${code}&secret=x`, { waitUntil: 'networkidle' });
  await wcHost.getByRole('button', { name: /Start New Game/i }).waitFor({ state: 'visible', timeout: 25000 });
  await wcHost.getByRole('button', { name: /Start New Game/i }).click();
  await wcHost.waitForURL(/\/create\?/, { timeout: 20000 });
  await wcHost.locator('.game-type-card').first().waitFor({ state: 'visible', timeout: 25000 });
  await wcHost.locator('.game-type-card', { hasText: 'Word Cloud' }).first().click();
  await wcHost.waitForURL(/\/create\/setup/, { timeout: 20000 });

  check('word cloud setup is a single prompt (no add-question buttons)',
        await wcHost.getByRole('button', { name: /Add Question/i }).count() === 0);
  check('word cloud setup hides the question type dropdown',
        await wcHost.locator('select').count() <= 1);
  await wcHost.getByPlaceholder(/Your prompt/i).fill('One word for today?');
  await wcHost.getByRole('button', { name: /Open Word Cloud/i }).click();
  await wcHost.waitForURL(/\/host\?/, { timeout: 20000 });

  // player gets pulled in and submits a word
  await player.waitForURL(/\/play\?pin=/, { timeout: 25000 });
  // lobby -> live: the host opens the cloud
  await wcHost.getByRole('button', { name: /Open Word Cloud/i }).click({ timeout: 25000 });
  const wcInput = player.getByPlaceholder(/Type your answer/i);
  await wcInput.waitFor({ state: 'visible', timeout: 25000 });
  await wcInput.fill('sunny');
  await player.getByRole('button', { name: /Send/i }).first().click();
  await player.waitForTimeout(3000);

  check('no Reveal Answer button on a word cloud',
        await wcHost.getByRole('button', { name: /Reveal Answer/i }).count() === 0);
  check('host shows Save & back to dashboard',
        await wcHost.getByRole('button', { name: /Save & back to dashboard/i }).count() > 0);
  check('host shows End word cloud',
        await wcHost.getByRole('button', { name: /End word cloud/i }).count() > 0);
  const wcBody = await wcHost.locator('body').innerText();
  check('host screen has no question numbering', !/\bQ1\s*\/\s*\d/.test(wcBody));
  check('host sees the live response count', /1 response/i.test(wcBody),
        (wcBody.match(/\d+ responses?[^\n]*/) || [''])[0]);

  // End it — players should be released back to the session
  await wcHost.getByRole('button', { name: /End word cloud/i }).click();
  await wcHost.waitForTimeout(4000);
  check('ended word cloud shows the cloud, not a podium',
        /word cloud closed/i.test(await wcHost.locator('body').innerText()));
  await player.waitForTimeout(3000);
  const wcPlayer = await player.locator('body').innerText();
  check('player gets an activity end screen with no scores',
        /no points/i.test(wcPlayer) && !/You Won/i.test(wcPlayer),
        wcPlayer.replace(/\n+/g, ' | ').slice(0, 80));

  // dashboard mini view
  const wcDash = await hostCtx.newPage();
  await wcDash.goto(`${BASE}/session/host?code=${code}&secret=x`, { waitUntil: 'networkidle' });
  await wcDash.locator('.session-clouds-card').waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  const cloudTxt = await wcDash.locator('.session-clouds-card').innerText().catch(() => '');
  check('saved cloud appears on the dashboard in a small view',
        /One word for today/.test(cloudTxt) && /sunny/.test(cloudTxt),
        cloudTxt.replace(/\n+/g, ' | ').slice(0, 90));
  await wcDash.close();
  await wcHost.close();
  delete globalThis.__pages.wcHost;

  // ───────────────────────────── 9. Host rejoin from a different "device"
  log('\n[9] Host password rejoin from a fresh device');
  const newDeviceCtx = await browser.newContext();   // fresh storage => new anon uid
  const dev2 = await newDeviceCtx.newPage();
  globalThis.__pages.dev2 = dev2;

  // A stranger with the code but no password must be refused
  await dev2.goto(`${BASE}/session/rejoin?code=${code}`, { waitUntil: 'networkidle' });
  await dev2.waitForTimeout(2500);
  await dev2.getByPlaceholder(/Host password/i).fill('definitely-wrong-password');
  await dev2.getByRole('button', { name: /Rejoin Session/i }).click();
  await dev2.waitForTimeout(4000);
  const wrongTxt = await dev2.locator('body').innerText();
  check('rejoin rejects a wrong password', /Incorrect password/i.test(wrongTxt),
        (wrongTxt.match(/Incorrect password|No session found|Could not rejoin/i) || ['no error shown'])[0]);
  check('rejoin with wrong password does not reach dashboard', !/\/session\/host/.test(dev2.url()));

  // Correct password takes over as host
  await dev2.getByPlaceholder(/Host password/i).fill(HOST_PASSWORD);
  await dev2.getByRole('button', { name: /Rejoin Session/i }).click();
  await dev2.waitForURL(/\/session\/host/, { timeout: 25000 });
  await dev2.waitForTimeout(3500);
  const dev2Txt = await dev2.locator('body').innerText();
  check('rejoin with correct password reaches dashboard', /Cumulative Leaderboard/i.test(dev2Txt));
  check('rejoined host sees the original session name', dev2Txt.includes(SESSION_NAME));
  check('rejoined host sees preserved player data', /TEST-Player/.test(dev2Txt),
        (dev2Txt.match(/TEST-Player[^\n]*/) || [''])[0]);
  check('rejoined host can act (Start New Game present)',
        await dev2.getByRole('button', { name: /Start New Game/i }).count() > 0);

  // The password hash must not be readable by anyone
  const leak = await dev2.evaluate(async () => {
    const m = await import('https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js').catch(() => null);
    return m ? 'module-loaded' : 'blocked';
  }).catch(() => 'blocked');
  check('sessionAuth not exposed in page state', !/[0-9a-f]{64}/.test(dev2Txt), `probe=${leak}`);

  await newDeviceCtx.close();
  delete globalThis.__pages.dev2;

  // ───────────────────────────── summary
  log('\n[10] JS errors observed');
  const realErrors = errors.filter(e => !/permission_denied|Permission denied|favicon|net::ERR/i.test(e));
  if (realErrors.length === 0) log('  none');
  else realErrors.slice(0, 12).forEach(e => log('  ' + e));
  check('no uncaught JS errors', realErrors.length === 0, realErrors.length ? realErrors[0].slice(0, 120) : '');

  const permDenied = errors.filter(e => /permission_denied|Permission denied/i.test(e));
  log(`\n  (permission_denied messages: ${permDenied.length})`);
  permDenied.slice(0, 6).forEach(e => log('   ! ' + e.slice(0, 160)));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  log(`\n${'='.repeat(60)}`);
  log(`RESULT: ${results.length - failed.length}/${results.length} passed   session=${code}`);
  if (failed.length) { log('\nFAILED:'); failed.forEach(f => log(`  - ${f.name}  ${f.detail}`)); }
  process.exit(failed.length ? 1 : 0);
}

run().catch(async e => {
  console.error('\nHARNESS ERROR:', e.message.split('\n')[0]);
  for (const [who, pg] of Object.entries(globalThis.__pages || {})) {
    try {
      console.error(`  ${who} url: ${pg.url()}`);
      const t = (await pg.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 400);
      console.error(`  ${who} body: ${t}`);
    } catch { /* page may be closed */ }
  }
  process.exit(2);
});
