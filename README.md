# SG1 Iris

Animated titanium iris add-on for the StargateProject SG1 v4 Retro interface.

The iris uses 22 curved blades, closes with a symmetrical overlapping plume,
and retracts completely below the existing inner Stargate ring when open.
During closing and opening it pauses for one second at the same two-thirds
position, immediately before the central plume appears or disappears.
Every incoming dialing sequence automatically closes the iris and keeps it
closed while the incoming status remains active.
After a connection to `P3W-451 (Black Hole)` is established, SG1 Iris keeps
the iris open at the start of the event, plays `outgoing wormhole.wav` once in
the browser at thirty-five seconds and starts closing at forty-five seconds.
The Black Hole timing is calculated from the Stargate backend countdown
(`wormhole_max_time` and `wormhole_time_till_close`), not from the browser or
computer clock, so it behaves consistently across Mac, Windows, Android and
tablet WebView browsers.
The clip lasts about 7.87 seconds, so it finishes around 42.87 seconds and
leaves roughly 2.13 seconds before the iris begins moving.
Only during this Black Hole pre-close sequence, regular random clips from
`audio_clips` are blocked. The dedicated Iris warning remains allowed. Random
clip playback is restored after the iris has completely closed.
When any active wormhole ends, the iris automatically opens and returns to its
resting position, matching the post-connection reset of the other SG1 hardware.
The installer moves this dedicated clip from SG1's original Black Hole audio
folder into:

```text
/home/pi/sg1_v4/soundfx/milkyway/audio_clips/Iris/black_hole/outgoing wormhole.wav
```
<img width="3600" height="1200" alt="image" src="https://github.com/user-attachments/assets/ebd6adc2-a4df-4f60-b67a-c6612f3597cb" />

## Requirements

- SG1 v4 installed in `/home/pi/sg1_v4`.
- Retro interface installed in `/home/pi/sg1_v4/web/retro`.
- Raspberry Pi Chromium or another browser with Canvas and ES module support.

## Install

SSH into the Raspberry Pi and run the full install block:

```bash
cd /home/pi
rm -rf SG1-Iris
git clone https://github.com/matelv-x/SG1-Iris.git
cd SG1-Iris
chmod +x install.sh restore.sh
sudo ./install.sh --target /home/pi/sg1_v4
sudo systemctl restart stargate.service
systemctl status stargate.service --no-pager -l
```

After installation, refresh the Retro page without cache. Use the
`CLOSE IRIS` / `OPEN IRIS` control in the Retro navigation menu, or press
`Ctrl+I`.

Quick browser test:

```text
http://stargate.local/retro/dial.html
```

If your gate uses a different local name or IP address, open the same Retro path
on that address instead.

## Black Hole update

Use the latest version if you want the current Black Hole / Iris behavior:

- detects `P3W-451` / Black Hole connections
- keeps the iris open at the start of the Black Hole event
- uses the Stargate backend countdown instead of the browser clock
- closes the iris automatically after the Black Hole delay
- avoids old saved browser state forcing the iris closed at the start of a new
  Black Hole event
- works more reliably across Mac, Windows, Android, Safari, Edge, Chrome,
  Firefox and Android WebView

To update an existing installation, run the normal install block again:

```bash
cd /home/pi
rm -rf SG1-Iris
git clone https://github.com/matelv-x/SG1-Iris.git
cd SG1-Iris
chmod +x install.sh restore.sh
sudo ./install.sh --target /home/pi/sg1_v4
sudo systemctl restart stargate.service
```

After updating, hard-refresh the Retro page:

```text
Edge / Chrome: Ctrl + F5
Firefox: Ctrl + Shift + R
```

If a browser still behaves like the old version, delete the site data/cookies
for your gate address, for example `stargate.local`, `gate3.local` or the
gate IP address, then reopen the Retro page.

## Dry run

```bash
sudo ./install.sh --target /home/pi/sg1_v4 --dry-run
```

## Restore / uninstall

```bash
cd /home/pi/SG1-Iris
sudo ./restore.sh --target /home/pi/sg1_v4
sudo systemctl restart stargate.service
```

## What it changes

- Adds `web/retro/js/iris.js`.
- Adds `web/retro/css/iris.css`.
- Injects only marked stylesheet and script hooks into `dial.html` and
  `dial9.html`.
- Reads the SG1 gate status directly from the web API, so the iris can
  automatically close on incoming and react to a black-hole connection without
  depending on a `dial.js` hook.
- Plays the one-time Black Hole warning directly in the active Retro browser,
  which supports web-only Fan Gate and Land of Light pages without speakers
  connected to the SG1 backend.
- Uses an isolated, one-shot audio object and then returns to SG1 v4's normal
  browser audio handling without replacing or reconfiguring it.
- Preloads the warning as soon as the Black Hole connection is established so
  network latency does not consume its safety gap before closure.
- Applies the random-audio guard only to an active Black Hole sequence. Normal
  gate sounds are not blocked, and the guard is removed after full iris closure
  or immediately if the connection ends early.
- Automatically opens after every completed incoming, outgoing or Black Hole
  connection.
- Moves the warning out of the general Black Hole clip folder into the marked,
  managed `soundfx/milkyway/audio_clips/Iris/black_hole` folder so it belongs
  only to this Iris event.
- Removes the old marked Iris hook from `web/retro/js/dial.js` when upgrading
  from an earlier SG1 Iris version.
- Preserves the existing rings, glyphs, chevrons and other installed add-ons.
- Creates timestamped backups below `web/backups/`.
- Restore removes only SG1 Iris hooks and managed assets.
- Restore moves the warning back to its original Black Hole folder and removes
  the empty Iris audio folders only when the ownership marker is present.
- Reinstalling is safe and does not duplicate hooks.

## Control and integration

SG1 Iris has two built-in control options:

Menu:

```text
OPEN IRIS / CLOSE IRIS
```

The menu button is added to the Retro navigation bar and updates its label to
show the available action.

Keyboard:

```text
Ctrl+I
```

Incoming calls close the iris automatically. If you manually open the iris
during the same incoming wormhole, the add-on respects that manual override
until the gate returns to idle. The next incoming call will close it again.

Selecting `P3W-451 (Black Hole)` does not close the iris during dialing. Once
the connection is established, the iris is forced open for the start of that
Black Hole event, the dedicated `outgoing wormhole.wav` warning plays once
after thirty-five seconds and the iris starts closing after forty-five seconds.
The countdown comes from the Stargate backend status, so client clock drift or
browser timer differences do not change the intended timing.
If the connection ends before either action, the pending action is cancelled.

JavaScript API:

```javascript
sg1Iris.open();
sg1Iris.close();
sg1Iris.toggle();
sg1Iris.isClosed();
```

DOM commands:

```javascript
document.dispatchEvent(new Event("iris:open"));
document.dispatchEvent(new Event("iris:close"));
document.dispatchEvent(new Event("iris:toggle"));
```

## Attribution and originality

Original base project: StargateProject SG1 software from the
BuildAStargate/Kristian/Jonnerd project lineage.

Retro interface credit: [polklabs/stargate-retro](https://github.com/polklabs/stargate-retro).

matelv-x/Codex modification: this repository adds the standalone animated iris,
its SG1 v4 installer, backup workflow and surgical restore tooling.
