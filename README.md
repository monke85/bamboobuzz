# BAMBOOBUZZ

A browser-based, 2D solo robot practice simulator inspired by PlayDSim and the BIOBUZZ 2026-2027 game. Built with plain JavaScript, HTML canvas, and CSS, with a shared Cloudflare D1 leaderboard.

Play online: [https://biobuzz-solo-arena-2026.earthynova8192.chatgpt.site](https://biobuzz-solo-arena-2026.earthynova8192.chatgpt.site)

## Play

Open `index.html` in a desktop browser. Keep `app.js`, `leaderboard.js`, and `style.css` in the same folder. Alternatively, open the self-contained `BAMBOOBUZZ.html` file. The simulator runs locally; posting scores needs an internet connection to the hosted leaderboard.

The frontend can be served by any static web host. For the hosted Worker and its database API, use Node.js 24 or later and run `npm run build`; there are no npm dependencies. The build embeds the page assets into `dist/server/index.js`. Managed Sites hosting provisions the `DB` D1 binding and applies the SQL migration in `drizzle/`.

Press **Start match**, then click the field to focus controls. Connect a standard gamepad and press a button to enable it. Keyboard bindings can be replaced under **Driver Station -> Customize keyboard controls**; preferences are saved in your browser.

## Controls

| Action | Default keyboard | Standard gamepad |
| --- | --- | --- |
| Drive forward / reverse | W / S or Up / Down | Both sticks forward / back |
| Turn | A / D or Left / Right | Left stick: left wheel; right stick: right wheel |
| Intake pollen | Hold F | Hold LB |
| Wind up and fire all cargo | Space | RT |
| Place / drop | G | A / Cross |
| Supply unlocked nectar onto field | H | B / Circle |
| Select cargo | Tab | Y / Triangle |
| Slow drive | Hold Shift | LT |
| Pause / resume | P | Start |

## Robot and match

- Tank drive with two powered side wheels and four passive corner wheels.
- Footprint: 390 mm wide, 400 mm long, with a 256 mm pollen-only intake and triangular guide funnel.
- Four-piece cargo capacity; animated 1.5-second catapult windup releases the entire load, followed by a 0.55-second reset.
- Start position: (56, 7.874016) inches from the bottom-left, facing the hive with the rear touching the wall.
- 30 seconds of manually driven AUTO practice, an 8-second frozen transition, and 120 seconds of TELEOP.
- A full-body red-half boundary applies during AUTO practice and releases in TELEOP.
- Raised hive cells allow travel underneath; the visible side base rails and flower floor bases remain solid. Enable **Collision outlines** to inspect them.
- Gravity-based shots, rim collisions, visible hive cargo, bouncing balls, and randomized spills.
- Hive tipping loads: 8 pollen, 3 nectar + 3 pollen, or 5 nectar; mixed loads interpolate by weight.

## Simulation limits

This is an unofficial solo practice game, with no affiliation with FIRST or PlayDSim. It does not implement opponents, ranking points, or a complete referee/mechanical model. AUTO uses driver controls for practice rather than a programmed autonomous routine. The strict AUTO centerline barrier is a practice restriction; official G402 addresses interference rather than categorically banning all crossings. The model assumes the robot fits below the raised cells and approximates side rail width as 1 inch. Official resources and further model notes are linked inside the simulator.

## Shared leaderboard and match results

At the end of TELEOP, a results dialog shows the final score, hive tips, and score breakdown. Enter a driver name and press **Post score**. The game fills in the score automatically. Players do not need an account.

The online board shows the top 20 runs, sorted by score, then submission time. Refresh scores to see new results from other devices. The server checks the match duration and score breakdown and accepts each run once; failed submissions can be retried without duplicate rows. This is a practice leaderboard, not a cheat-proof competitive service: the simulation runs in the browser.

To clear it, open the hosted site, choose **Owner sign-in**, and sign in with the owner's ChatGPT account. **Clear leaderboard** appears only for the owner. Type `CLEAR` in the confirmation dialog to delete all scores and invalidate matches started before the reset. A new match can then post to the fresh board.

The owner's email is configured server-side as `ADMIN_EMAIL`, never included in client code. Owner authorization relies on verified identity headers supplied by Sites; replace that identity boundary if deploying the Worker directly through another host. Do not accept user-supplied identity headers on a standalone public server.

Database records live in Cloudflare D1, shared across browsers. Browser storage only remembers keyboard preferences and the last driver name. The frontend's `leaderboard-api` meta tag selects the hosted API; an empty value uses the current origin.

## Checks

Run `npm test` on Node.js 24 or later. Tests exercise the SQLite migration, ranking, match eligibility, duplicate submissions, owner authorization, reset behavior, results UI, retry, replay, and safe rendering of names.

## Files

- `index.html`: page and driver station.
- `app.js`: simulation, physics, rendering, scoring, and controls.
- `leaderboard.js`: shared leaderboard, results form, and owner controls.
- `style.css`: responsive layout and visual styling.
- `BAMBOOBUZZ.html`: standalone edition with the same script and styles embedded.
- `server/leaderboard.mjs`: D1 API and owner authorization.
- `drizzle/`: schema migration for scores, match sessions, and leaderboard resets.
- `scripts/build.mjs`: dependency-free Worker build.
- `tests/`: API and UI regression checks.

When editing the simulator, update the standalone edition from the three source files before distributing it.
