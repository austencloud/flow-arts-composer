# Ignis iPixel HD USB Protocol

How the Ignis Pixel Utility talks to iPixel HD poi over USB, decoded from the
Utility's machine code with Ghidra (October 2026). Our implementation lives in
`src/lib/features/poi/services/ignis/`, and its tests pin the byte layouts
below.

Not yet confirmed on hardware: which end of the staff LED 0 sits at, the
battery field format, and the ack codes the poi actually returns. A USBPcap
capture of one Utility upload, compared with our encoder's bytes, settles
those before the first real write.

## Transport

- The poi enumerate as STM32 virtual COM ports (USB vendor `0x0483`). Web
  Serial in Chrome and Edge opens them at 115200 baud.
- The Utility has no Bluetooth code. The poi's radio links poi to poi, so a
  browser can reach them only over USB.

## Framing

A frame is `FF`, the escaped message, then `FF FF`. Inside the message each
`FF` byte is sent as `FF FE`. The first message byte is at most `FD`, and a
frame holds at most `0x2800` bytes.

A message is `01`, the CRC-16/XMODEM of the TLV body (little-endian), then the
TLV body.

CRC-32 (used for data) is the reflected `0xEDB88320` table with initial value
0 and no final XOR. It is not the common zlib CRC-32.

## TLV encoding

- Tag: under `0x40` takes one byte; under `0x2000` takes two,
  `[(t >> 7) | 0x80, t & 0x7F]`; larger tags take three. A container sets
  `0x40` on its first tag byte.
- Length: leaves use the shortest width. A container's width comes from a size
  hint the sender picks: under `0x80` one byte, under `0x4000` two, otherwise
  three. When the hint exceeds the real size, the length is written wider than
  needed (`80 03` for 3).

### Tags in use

| Container          | Tag    | Leaf              | Tag    |
| ------------------ | ------ | ----------------- | ------ |
| ROOT               | `0x01` | ACK_CODE          | `0x01` |
| ACK                | `0x0A` | REQ_ID            | `0x03` |
| WAIT               | `0x0B` | WAIT_TIME         | `0x04` |
| REQ_INFO           | `0x14` | ACTION            | `0x05` |
| DEV_INFO           | `0x1F` | DATA              | `0x06` |
| MODE               | `0x32` | DATA_CRC          | `0x07` |
| MODE_INFO          | `0x33` | REQ_TYPE          | `0x0A` |
| MODE_IMG_INFO      | `0x34` | REQ_LEVEL         | `0x0B` |
| MODE_SEQ_INFO      | `0x35` | MODE_TYPE         | `0x32` |
| MODE_SEQ_ITEM_INFO | `0x36` | MODE_INDEX (u16)  | `0x33` |
| MODE_DATA          | `0x37` | MODE_OFFSET (u32) | `0x34` |
|                    |        | MODE_WIDTH        | `0x48` |
|                    |        | MODE_HEIGHT       | `0x49` |
|                    |        | ITEM_DRAWSTYLE    | `0x4D` |
|                    |        | ITEM_SCALE        | `0x4E` |
|                    |        | ITEM_GAP_SIZE     | `0x4F` |
|                    |        | IMG_COLSIZE       | `0x51` |

DEV_INFO leaves: FAMILY `0x82` (u16), FW_VER `0x83` and BL_VER `0x84` (u32
packed `major<<24 | minor<<16 | patch<<8 | build`), BAT_V `0x85`, BAT_LEVEL
`0x86`, UID `0x87` (12 bytes), MAC `0x88`, RSSI `0x89`, NAME `0x8A`.

## Requests

Device info, TLV body:

```text
41 08 54 06 0a 01 1f 0b 01 02
```

Erase image slot 3 (ACTION 0 = erase, MODE_TYPE 1 = image):

```text
41 0e 72 0c 05 01 00 73 07 32 01 01 33 02 03 00
```

Write one 2048-byte chunk (ACTION 1 = write):

```text
ROOT {
  MODE {
    ACTION = 1
    MODE_INFO { MODE_TYPE = 1, MODE_INDEX = slot, MODE_OFFSET = 2048 * n }
    MODE_IMG_INFO { WIDTH, HEIGHT, COLSIZE, DRAWSTYLE = 0, GAP = 0, SCALE, DATA_CRC }   first chunk only
    MODE_DATA { DATA = chunk, DATA_CRC = crc32(chunk) }
  }
}
```

The slot index counts within its type: image 0 is the first image slot. HD
firmware 3.x has 80 image slots.

Replies carry `ROOT { ACK { ACK_CODE, REQ_ID, ACTION } }`; code 0 is success
and REQ_ID is `0x32` for MODE requests. `ROOT { WAIT { WAIT_TIME } }` means the
poi is busy and wants that many more milliseconds.

Upload sequence: erase the slot, then send each chunk and wait for its ack,
retrying a chunk up to ten times. Our timeouts: info 2.5 s, erase 15 s, chunk
2.5 s, extended by any WAIT.

## Image format (SK9822)

- The Utility turns the picture 90° clockwise, so LED 0 is the picture's
  bottom row. Our patterns put LED 0 on the top row, so the encoder reads LEDs
  bottom-up.
- A column is 4 zero bytes, then `[0xE0 | ledBright, B, G, R]` per LED, then 4
  zero bytes: 808 bytes for 200 LEDs.
- Channel value: `trunc(min(1, (c << 4) / 4095) * 255)`, so 255 becomes 254.
- `ledBright` limits power. Average each LED row over the whole image, take
  the brightest window of 8 adjacent rows (minimum 0.001), then
  `clamp(trunc(0.226 / avg * maxBright), 1, maxBright)` with `maxBright` 21.
  The Utility stops one window short and wraps the result in a byte; we keep
  the first quirk and drop the wrap.
- Header: width (columns), height (LEDs), column size, draw style 0, gap 0,
  scale `trunc(clamp(s, 0.001, 1000) * 4194304)`, and the CRC-32 of the
  unpadded data. Data is zero-padded to whole 2048-byte chunks.
- A slot holds `(3 * 0x40000 - 0x200) / colSize` columns: 972 on the 200 HD.

## Models

FAMILY `0x0100` means the real type comes from the name prefix:

| Type    | Model         | LEDs |
| ------- | ------------- | ---- |
| `0x10D` | iPixel 104 HD | 104  |
| `0x10A` | iPixel 144 HD | 144  |
| `0x10B` | iPixel 200 HD | 200  |
| `0x10C` | iPixel 256 HD | 256  |

Uploads are enabled for the 200 HD only until another model is checked.

## Safety

`assertSafeRequest` refuses any request that holds a container other than
ROOT, REQ_INFO, MODE, MODE_INFO, MODE_IMG_INFO or MODE_DATA, any unlisted leaf,
or an ACTION other than erase (0) or write (1). Control (`0x3C`, which carries
go-to-bootloader, firmware erase and firmware write) and every bootloader tag
are therefore unreachable. The worst a bad upload can do is leave a broken
picture in one slot, which the Utility or a second upload overwrites.

## Austen's hardware

| Field      | Value                        |
| ---------- | ---------------------------- |
| Model      | iPixel 200 HD (type `0x10B`) |
| Firmware   | 3.0.11.10                    |
| Bootloader | 3.0.2                        |
| LEDs       | 200 × SK9822                 |
