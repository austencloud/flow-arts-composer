# Ignis Pixel Protocol — Reverse Engineering Notes

Everything we know about the wire protocol used by the **Ignis Pixel Utility 2.1.37** to talk to **iPixel HD** hardware (104 / 144 / 200 / 256). Source: static analysis of `PixelUtility2.exe`. Wire-level capture pending.

See also:

- Design spec: `docs/superpowers/specs/backlog/someday/2026-04-08-led-strip-pattern-engine-design.md`
- Implementation plan: `docs/superpowers/plans/backlog/someday/2026-04-10-led-strip-pattern-engine.md`
- Working adapter (reference pattern): `src/lib/features/poi/services/open-pixel-poi-adapter.ts`

---

## The Utility is a Qt 6 C++ app

- `PixelUtility2.exe` (1.9 MB) + Qt 6 runtime DLLs
- Uses `QSerialPort` (confirmed from exported symbols) — no Python, no PyInstaller
- NSIS installer bundles STM32 VCP and SiLabs CP210x drivers
- Version string: `Ignis Pixel Utility 2.1.37.0`, copyright "Ignis LCC"

**Implication:** we can't decompile Python. We get opcode values from either (a) USBPcap captures, or (b) Ghidra/IDA on the exe, or (c) Frida hooks on `QSerialPort::write` at runtime.

---

## Hardware models the Utility targets

```
iPixel            (legacy, single-ended)
iPixel 32 Tech
iPixel 104 HD
iPixel 144 HD
iPixel 200 HD     <-- Austen's hardware
iPixel 256 HD
```

Device family type tags (from `TAG_HW_INFO_PIXEL_TYPE`):

```
IPIXEL
IPIXEL_LITE
IPIXEL_JELLY
IPIXEL_HOOP
IPIXEL_FAN
IPIXEL_CTRL
```

---

## Three protocol generations

The Utility implements three distinct device classes:

| Class             | Meaning                                                | Used by                             |
| ----------------- | ------------------------------------------------------ | ----------------------------------- |
| `C_DEVICE_LEGACY` | Old ASCII/line-based protocol (`^iPixel$` regex match) | First-gen iPixel                    |
| `C_DEVICE_PACK`   | "packed" binary protocol (middle generation)           | Tech / intermediate models          |
| `C_DEVICE_TLV`    | "packed tlv" — TLV (Tag-Length-Value) binary protocol  | **All HD models (104/144/200/256)** |

**iPixel 200 HD uses `C_DEVICE_TLV`.** This is the one we care about.

---

## TLV protocol structure (from strings)

The protocol is fundamentally a nested TLV tree. The Utility has code paths for:

- `parseRootNode()` — parses the top-level message
- `parseWithSchema()` — schema-driven tag interpretation (has `bad schema for tag %1` errors)
- `CnvToTlvFmt` — converts images into TLV frames

Messages wrap in a `CTAG_ROOT` node. Reliable requests use `CTAG_ROOT_RED_REQ` / `CTAG_ROOT_RED_RESP`.

### Full tag vocabulary (extracted from string table)

**Root / framing:**

```
CTAG_ROOT
CTAG_ROOT_RED_REQ
CTAG_ROOT_RED_RESP
CTAG_ACK
CTAG_WAIT
```

**Request / capability / status (safe reads):**

```
CTAG_REQ_INFO           TAG_REQ_ID, TAG_REQ_TYPE, TAG_REQ_LEVEL
CTAG_DEV_CAP            TAG_DEV_CAP_MAX_NODES, TAG_DEV_CAP_MAX_SIZE,
                        TAG_DEV_CAP_MIN_DATA_SIZE, TAG_DEV_CAP_MAX_DATA_SIZE
CTAG_DEV_INFO           TAG_DEV_INFO_FAMILY, TAG_DEV_INFO_FW_VER, TAG_DEV_INFO_BL_VER,
                        TAG_DEV_INFO_BAT_V, TAG_DEV_INFO_BAT_LEVEL,
                        TAG_DEV_INFO_UID, TAG_DEV_INFO_MAC, TAG_DEV_INFO_RSSI,
                        TAG_DEV_INFO_NAME
CTAG_DEV_STATUS         TAG_DEV_STATUS_SYS, TAG_DEV_STATUS_IMU, TAG_DEV_STATUS_RF,
                        TAG_DEV_STATUS_FLASH, TAG_DEV_STATUS_BRIGHT,
                        TAG_DEV_STATUS_MODE, TAG_DEV_STATUS_MENU_TYPE,
                        TAG_DEV_STATUS_MENU_INDEX, TAG_DEV_STATUS_SEQ_DUR,
                        TAG_DEV_STATUS_SEQ_SEED
CTAG_HW_INFO            TAG_HW_INFO_MCU, TAG_HW_INFO_IMU, TAG_HW_INFO_RF,
                        TAG_HW_INFO_FLASH, TAG_HW_INFO_LED,
                        TAG_HW_INFO_PIXEL_TYPE, TAG_HW_INFO_PIXEL_COLOR,
                        TAG_HW_INFO_PIXEL_MAX_CURR, TAG_HW_INFO_PIXEL_MAX_CH_CURR,
                        TAG_HW_INFO_POWER_LIMIT_SHORT,
                        TAG_HW_INFO_POWER_LIMIT_SHORT_TIME,
                        TAG_HW_INFO_POWER_LIMIT_LONG
CTAG_MEM_INFO
CTAG_CONFIG_INFO        TAG_CONFIG_INFO_TAG, TAG_CONFIG_INFO_VER,
                        TAG_CONFIG_INFO_TIME, TAG_CONFIG_INFO_SCHEMA
CTAG_SYS_PARAM          TAG_SYS_PARAM_ACTION, TAG_SYS_PARAM_GROUP
CTAG_UPTIME             TAG_UPTIME_TIME, TAG_UPTIME_ACT_TIME,
                        TAG_UPTIME_ROT_TIME, TAG_UPTIME_ROT_COUNT
CTAG_JRNL               (activity journal — rotation counts, juggles, throws,
                        drops, flight times, speeds, avg/max rot speeds, etc.)
CTAG_JRNL_FLY
```

**Flash info (read) + mode data (read/write):**

```
CTAG_EXT_FLASH          TAG_FLASH_ID, TAG_FLASH_TOTAL_SIZE, TAG_FLASH_TOTAL_BLOCKS,
                        TAG_FLASH_FREE_SIZE, TAG_FLASH_FREE_BLOCKS
CTAG_INT_FLASH          (same tags for internal MCU flash)
CTAG_MODE               TAG_MODE_TYPE, TAG_MODE_INDEX, TAG_MODE_OFFSET,
                        TAG_MODE_PROGRESS, TAG_MODE_SIZE, TAG_MODE_BLOCKS,
                        TAG_MODE_WIDTH, TAG_MODE_HEIGHT
CTAG_MODE_INFO
CTAG_MODE_IMG_INFO      TAG_MODE_IMG_COLSIZE
CTAG_MODE_SEQ_INFO      TAG_MODE_SEQ_LOOP
CTAG_MODE_SEQ_ITEM_INFO TAG_MODE_ITEM_TYPE, TAG_MODE_ITEM_INDEX,
                        TAG_MODE_ITEM_DUR, TAG_MODE_ITEM_DRAWSTYLE,
                        TAG_MODE_ITEM_SCALE, TAG_MODE_ITEM_GAP_SIZE
CTAG_MODE_DATA          (actual pixel bytes go here; wrapped with TAG_DATA_CRC)
```

**Control & runtime:**

```
CTAG_CTRL               TAG_CTRL_CMD, TAG_CTRL_ARG, TAG_CTRL_TIME, TAG_CTRL_REBOOT
```

**Training / debug:**

```
CTAG_TRAIN
CTAG_DEBUG
```

**⚠️ DANGEROUS — NEVER SEND ⚠️**

```
CTAG_BL_FW_UPLOAD       (bootloader firmware upload — bricks firmware if malformed)
CTAG_BL_CONFIG          TAG_BL_CONFIG_TYPE
```

Commands / modes (state machine names from strings):

```
ERASE_MODE   — enter erase-pending state
ERASE_SEC    — erase one sector
ERASE_FW     — erase firmware    ⚠️ NEVER
WRITE_MODE   — enter write state
WRITE_MODE_DBL — double-buffered write variant
WRITE_PAGE   — write one page
WRITE_FW     — write firmware    ⚠️ NEVER
```

**Ack codes (responses):**

```
ACK_CMD_UNKNOW     — command code not recognized
ACK_MSG_UNKNOW     — message not recognized
ACK_DATA_INCORR    — data payload rejected
ACK_DATA_CRC       — data CRC mismatch
ACK_DATA_CRC_FW    — firmware CRC mismatch
ACK_FLASH_BUSY     — flash is busy, retry
ACK_FLASH_LOCK     — flash is locked
ACK_WRITE_DENY     — write rejected
ACK_WRITE_SEQ      — writes arrived out of sequence
```

---

## Upload flow (inferred from state names)

From strings like `> erase %1 sectors`, `> write data`, `> ack: %1 (%2), restart erase`, `> verify start error`, `> verify success, crc32: 0x%1`:

1. Client sends `CTAG_CTRL` with `TAG_CTRL_CMD = ERASE_MODE` + `TAG_MODE_INDEX`
2. Client sends `ERASE_SEC` commands per sector
3. Client sends `WRITE_MODE` to start writing
4. Client streams `CTAG_MODE_DATA` chunks; each chunk has `TAG_DATA_CRC` (CRC32)
5. Client requests verify; device responds with full-pattern CRC32
6. On CRC mismatch → `> ack: restart erase` loop re-runs the erase/write cycle

Chunk size: the Utility logs `chunk offset: %1 size: %2 crc32: 0x%3` — suggests variable chunk size, likely bounded by `TAG_DEV_CAP_MAX_DATA_SIZE`.

---

## What's NOT in strings (need capture or Ghidra)

1. **Numeric tag IDs.** The protocol uses small integer tag codes (1 byte or 2 bytes); the string names map to those in the binary. Need one USBPcap capture to reveal them.
2. **Length encoding.** TLV length fields can be 1/2/4 bytes LE or BE. Need capture.
3. **Outer framing bytes.** Some TLV protocols have a start-of-frame marker. Need capture.
4. **Baud rate.** The exe calls `QSerialPort::setBaudRate` — the value is inlined in machine code. Common candidates: 115200, 230400, 460800, 921600, 1 000 000, 2 000 000. Need capture or Ghidra.
5. **Numeric values of `ACTION`, `CTRL_CMD`, `REQ_TYPE`, `REQ_LEVEL` enums.** Same.

---

## Safety model

### Recovery paths (ordered by ease)

1. **Ignis Utility re-upload.** If we only touched mode flash (patterns), the Utility can always overwrite them. Zero risk.
2. **"Go to bootloader" command.** The Utility has a `> try go to bootloader...` command path. There's a "Universal bootloader" (also "Universal base", "Universal lite", "Universal Jelly", "Universal Fan" variants). The bootloader lives in protected flash and handles firmware updates. If we brick application firmware, the Ignis bootloader can receive a firmware update via the Utility — **we do not need to open the poi to recover**.
3. **Hardware DFU via STM32 ROM bootloader.** Absolute last resort. Requires opening the poi, pulling BOOT0 high, and reflashing via ST-Link or DFU-USB. Only reachable if we somehow brick the Ignis bootloader itself — which we can't do without sending `CTAG_BL_FW_UPLOAD`, which we will never send.

### Forbidden commands (must not appear in `IgnisPixelAdapter` source)

```
CTAG_BL_FW_UPLOAD      // firmware upload
CTAG_BL_CONFIG         // bootloader reconfigure
TAG_CTRL_CMD = ERASE_FW
TAG_CTRL_CMD = WRITE_FW
```

`IgnisPixelAdapter` must lint against these identifiers at build time. No code path should be capable of transmitting them.

### Current-limit enforcement

The device exposes `TAG_HW_INFO_PIXEL_MAX_CURR` and `TAG_HW_INFO_PIXEL_MAX_CH_CURR`. Any brightness setter we implement must clamp to values that respect these. The brightness formula already in our code
(`ledBright = min(maxBright=21, floor(maxPower=0.226 / avgBright))`, `groupSize=8`) matches the Utility's behavior and should stay — it's the only protection against overdriving the SK9822 strip and the LiPo.

---

## Hardware facts (Austen's poi)

|                |                                 |
| -------------- | ------------------------------- |
| Model          | iPixel 200 HD                   |
| Firmware       | 3.0.11.10                       |
| Bootloader     | 3.0.2                           |
| Type code      | 010B                            |
| LED type       | SK9822 (DotStar)                |
| LED count      | 200                             |
| Connection     | STM32 USB CDC VCP (COM3 + COM5) |
| BLE MAC        | `78:a5:88:05:ae:37`             |
| Serial 1       | `004F-0040-5109-3035-3338-3434` |
| Serial 2       | `0064-0048-5113-3037-3538-3636` |
| Max brightness | 21 (from brightness formula)    |
| Max power      | 0.226 (normalized)              |
| Group size     | 8 LEDs per power-group          |

---

## Next steps

1. Install Wireshark + USBPcap on Austen's Windows machine.
2. Capture one known-safe upload from Ignis Utility: small test pattern (4 LED × 4 frame solid color), one poi connected.
3. Diff the capture against the TAG/CTAG vocabulary above — derive numeric tag IDs, length encoding, framing, baud rate.
4. Proposed, not implemented: `IgnisPixelAdapter` (Web Serial API) in `src/lib/features/poi/services/implementations/IgnisPixelAdapter.ts` — read-only path first (scan → connect → query `CTAG_DEV_INFO` + `CTAG_HW_INFO`), then write path.
5. Verify against second poi before promoting "untouchable" poi to test role.
