# BAMBOOBUZZ

A browser-based, 2D solo robot practice simulator inspired by PlayDSim and the BIOBUZZ 2026-2027 game. Built with plain JavaScript, HTML canvas, and CSS; no dependencies or build step.

## Play

Open `index.html` in a desktop browser. Keep `app.js` and `style.css` in the same folder. Alternatively, open the self-contained `BAMBOOBUZZ.html` file.

For local HTTP hosting with Node.js installed, run `npx --yes http-server .` and open the URL it prints. The three source files can also be served directly by any static web host.

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

## Files

- `index.html`: page and driver station.
- `app.js`: simulation, physics, rendering, scoring, and controls.
- `style.css`: responsive layout and visual styling.
- `BAMBOOBUZZ.html`: standalone edition with the same script and styles embedded.

When editing the simulator, update the standalone edition from the three source files before distributing it.
