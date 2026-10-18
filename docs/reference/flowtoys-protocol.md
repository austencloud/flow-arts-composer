# Flowtoys Connect Bridge Protocol

How a phone or browser controls Flowtoys props (Capsule, Vision and other
"Flowtoys Connect" props) through the Flowtoys Bridge. Written in October 2026
from a read-only look at the official Android app, `com.flowtoys.app` 1.5.1,
pulled from Austen's phone, checked against the community protocol notes in
[flowtoys.py](https://github.com/willemolding/flowtoys.py) (MIT), which were
tested on hardware. Nothing here has been sent to a prop by our code yet.

## What the props can and cannot take

Flowtoys props play only the patterns built into their firmware. The bridge
and the official app can pick one of those patterns and adjust it live (hue,
saturation, brightness, speed, density, and the pattern's own adjust
controls), wake a group up, or turn it off. No path in the app, the bridge
protocol or the Flowtoys updater sends an image, a pixel sequence or a custom
pattern to a prop. The updater only replaces firmware (see "Firmware updater"
below). A web search in October 2026 found no image upload for any Flowtoys
prop either, including Vision; if Flowtoys adds one, it will need its own
check.

So an uploader in Flow Arts Composer can drive Flowtoys props as a live
remote, cueing their built-in modes in time with a sequence, but cannot put a
custom picture on them the way it can for Ignis and Lighttoys props.

## How the official app works

- The app is Flutter. Its Dart code lives in `libapp.so`; the Java side holds
  only plugins (Bluetooth LE through flutter_blue_plus, URL launching,
  sharing). It asks for Bluetooth, internet and microphone permissions.
- Its in-app help says the bridge "converts bluetooth into 'flowtoys connect'
  radio signals". The phone talks Bluetooth LE to the bridge; the bridge
  relays each command over the props' own radio.
- The Dart code names a bridge service, a bridge connection service, an OSC
  service, and models for shows, groups, modes, mode parameters and timeline
  elements. Shows are timelines of mode changes, not images.
- It carries OSC addresses such as `/setMode`, `/pattern`, `/sync_packet`,
  `/global/brightness`, `/global/saturation`, `/show/pause`, `/show/restart`
  and `/show/togglePlay`. These probably let other software drive the app
  over the network; that is inferred from the names, not traced.
- Accounts, shared mode lists and shows come from `api.flowtoys.com`
  (`assets/config/prod.json`).

### Built-in modes

`assets/data/base_modes.json` in the app lists 80 modes: pages 1, 2 and 3 with
10 modes each, and page 13 with 50. Each entry has a name, page, number,
default hue, saturation, brightness, speed and density (0 to 1), and which
parameters its two adjust controls change (`adjust_links`, usually hue,
sometimes density or mapping). Preview pictures for each mode ship as
`assets/images/modes/p<page>m<mode>.jpg`.

Page 4 holds the prop's own saved modes, and page 5 is the props' settings
page; page 5 mode 1 is grouping (see "Groups").

## Transport

- The bridge advertises as `Flowtoys Bridge`, needs no pairing, and accepts
  one connection at a time. Web Bluetooth in Chrome and Edge can open it.
- Service `49550001-aad5-59bd-934c-023d807e01d5`. Its characteristics share
  that UUID with the first group changed:

  | Characteristic | Direction                    | Use                           |
  | -------------- | ---------------------------- | ----------------------------- |
  | `49550003-…`   | write, with or without reply | one radio packet per write    |
  | `49550002-…`   | notify                       | packets the bridge overhears  |
  | `49550004-…`   | write                        | unknown                       |
  | `49550005-…`   | write                        | unknown; the app refers to it |

  The app's code names 0002, 0003 and 0005. Leave 0004 and 0005 alone until
  their purpose is known.

- Turn on notifications on 0002 after connecting.

## Radio packet (21 bytes)

| Offset | Size | Field                                      |
| ------ | ---- | ------------------------------------------ |
| 0      | 2    | group id, big-endian                       |
| 2      | 4    | counter, little-endian                     |
| 6      | 4    | four LFO values                            |
| 10     | 1    | hue                                        |
| 11     | 1    | saturation                                 |
| 12     | 1    | brightness                                 |
| 13     | 1    | speed                                      |
| 14     | 1    | density                                    |
| 15     | 1    | override mask                              |
| 16     | 2    | zero                                       |
| 18     | 1    | page, counted from 0 (page 1 is sent as 0) |
| 19     | 1    | mode, counted from 0                       |
| 20     | 1    | flags                                      |

A prop uses a value only when its bit is set in the override mask: `0x01` the
LFO values, `0x02` hue, `0x04` saturation, `0x08` brightness, `0x10` speed,
`0x20` density. Unset values should be sent as 0.

Flags: `0x08` restarts the pattern and is set when the mode changes; `0x02`
wakes the group and `0x04` turns it off (both reported, not confirmed). Other
bits (`0x01`, `0x10`, `0x20`, `0x40`) have guessed names such as save and
delete and should never be sent.

## Sending

- Write one packet per change to 0003. The bridge repeats it to the group.
- Send each packet three times about 200 ms apart with the same counter, since
  the radio drops packets.
- Send at most one new packet per group every 50 ms; a newer state replaces a
  pending one.

## Groups and counters

- Props listen to a 16-bit group id. There is no broadcast id; to reach
  several groups, send one packet to each.
- Every group has one counter shared by its props and all remotes. A prop
  ignores a packet unless its counter is higher than the last it saw. Learn
  the current counter from packets the bridge notifies, then send counter + 1
  and keep counting from there.
- A host learns groups only by hearing them. Pressing a prop's button five
  times quickly selects page 5 mode 1 and makes the prop announce its group.

## Notifications

Each notification on 0002 is 22 bytes: one byte that varies (perhaps signal
strength), then a radio packet as above. A prop sends one when its mode is
changed on the prop itself; in those packets the override mask is 0 and the
LFO bytes hold other data. Ignore notifications of any other length.

## Firmware updater

[FlowtoysUpdater](https://github.com/flowtoys-inc/FlowtoysUpdater) (GPL-3.0,
desktop, JUCE) talks to props over USB HID, vendor `0xF107`, product `0x1000`
for Capsules and `0x1001` for clubs. It switches the prop into its bootloader
and writes a firmware file chosen by pixel count. It has no pattern or image
upload. Our code must never open these USB devices or send anything that
enters the bootloader.

## Other references

These GPL-3.0 projects were used only to confirm facts, and none of their code
is copied here: [FlowtoysConnectBridge](https://github.com/benkuper/FlowtoysConnectBridge)
(an ESP32 bridge driven by OSC or serial) and
[FlowtoysConnect](https://github.com/benkuper/FlowtoysConnect) (a Flutter
client).
