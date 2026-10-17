# Lighttoys Lumi Staff USB Protocol

How Lighttoys Composer 4.5 builds a show and uploads it to a Lumi Staff
(Lighttoys "FT2" hardware) over USB. Decoded in October 2026 from Composer's
logs and from its machine code with Ghidra (`LtComposer.exe`, C++ on Cinder;
the source paths in the binary name `Ft2Device.cpp` and `VpoiGenerator.cpp`).
Nothing here has been sent to a staff by our code yet.

Not yet confirmed: the exact bytes of a Composer-built show next to our
reading of them (see "Checking this without a staff" below), the meaning of
the brightness summary in the trailer, and what bank 5 holds.

## Transport

- The staff is a USB CDC serial port, vendor `0x1669`, product `0x1026`, at
  115200 baud. Web Serial in Chrome and Edge can open it.
- Commands are ASCII lines ending in `\r\n`. Replies end with `OK\r\n` on
  success.
- `v` identifies the device. A staff answers
  `HW:FT2module-1.0.0;FW:v1.0;DT:20240701112107;PI:3`; the Composer remote
  answers `HW:LTC-2.0.0;...;PI:6`.

## Banks

The staff has five banks. Composer reads their sizes with `fse` and logs them,
for example `Bank sizes: 546122 -1 -1 -1 2742` (`-1` is empty). Shows go to
banks 1 to 4. Bank 5 always holds a small file Composer does not upload
through this path; leave it alone.

Before an upload into an occupied bank, Composer deletes that bank's show with
an `fd` command for that bank.

## Uploading a show

1. Send `fW e <uid> b<bank> <size> <name>\r\n`, where `<uid>` is the show's
   first four bytes as a little-endian number in lowercase hex, `<bank>` is
   1 to 4, `<size>` is the show length in bytes, and `<name>` is the track
   name. Example: `fW e 006d0c29 b1 546122 Lumi Staff 1`.
2. The staff echoes a line such as
   `* wr (b0) FID 0 : - UID = 006D0C29, node = 40 , sz = 0 , @ E,0 (nm='4C','75',...)`
   and then `OK`. Composer continues only when a reply line is exactly `OK`.
3. Send the show in blocks of up to 1024 bytes. Each block is framed as

   | Bytes | Value                                   |
   | ----- | --------------------------------------- |
   | 3     | `fW ` (`66 57 20`)                      |
   | 1     | `7F`                                    |
   | 2     | data length, big-endian                 |
   | n     | data                                    |
   | 2     | Fletcher-16 of the data: `sum2`, `sum1` |
   | 1     | `0A`                                    |

   `sum1` is the running byte sum mod 256 and `sum2` the running sum of
   `sum1` mod 256, both starting at 0, over the data bytes only.

4. After each block, wait for `OK\r\n`. Composer polls for about 100 ms
   (500 reads 200 µs apart) and abandons the upload if it never arrives.
5. Composer then rereads the bank sizes to confirm.

A 546122-byte show takes 534 blocks.

A hex variant (`fw e`, `Data.ftvHex`) exists for older devices; the Lumi Staff
uses the binary path above (Composer logs `TRUE BIN UPLOAD`).

## Commands to never send

The same serial link carries firmware and bootloader updates (Composer's
"bouper" and `*-app-*.lbc` files in `%LOCALAPPDATA%\LtComposer3\firmware`).
Any uploader must allow only `v`, `fse`, `fd <1-4>` and `fW e ... b<1-4> ...`
plus data blocks, and refuse every other command, as the Ignis uploader's
`assertSafeRequest` does. Unexplained commands seen in the binary (`pp`,
`sm `, `tsn `, `si e `, ` o`) stay blocked.

## Show file (`Data.ftv`)

Composer renders each image on the track to a short text script and compiles
the script with a built-in C library that calls itself "iVPOI". The compiled
binary is the show file. All numbers are little-endian.

### Layout

1. Header, 8 bytes:
   - `u32` show UID. Bits 0 to 3 are `9`, bits 4 to 15 are `0xC2`, so the low
     16 bits always read `0x0C29`. Bits 16 to 25 come from the clock's
     milliseconds, bits 26 to 30 are random, and bit 31 makes the parity of
     the UID and timestamp words together odd. Composer writes a fresh UID
     before every upload.
   - `u32` creation time, Unix seconds.
2. For each image: its column records, then a 2-byte end mark (the last
   column record's length).
3. After every 128 images, and at the end of the show, an image table of
   32 bytes per image.
4. If the show has more than 8 image tables, a 1536-byte overflow table.
5. Trailer, 128 bytes, ending in the ASCII magic `sIOP`.

### Column record

| Bytes | Value                                |
| ----- | ------------------------------------ |
| 2     | length of the previous column record |
| 2     | length of this record (payload + 4)  |
| n     | column payload                       |

The first record of an image stores 0 as the previous length. The pair of
lengths lets the firmware walk columns in both directions.

The payload is a run of segments, each

| Bytes      | Value                               |
| ---------- | ----------------------------------- |
| 2          | count of literal pixels that follow |
| 3 × count  | literal pixels, R G B               |
| 1          | repeat count (0 ends the column)    |
| 3 if not 0 | the repeated pixel, R G B           |

Composer uses a repeat only for three or more equal pixels in a row and
splits repeats longer than 255. When the compressed form would be larger than
the plain one, it writes the plain form instead: one segment with every pixel
as a literal and a repeat count of 0. Both decode the same way, so an encoder
may always write the plain form. A column holds exactly as many pixels as the
image's LED count.

### Image table entry (32 bytes)

| Offset | Type  | Value                                                      |
| ------ | ----- | ---------------------------------------------------------- |
| 0x00   | `u32` | file offset of the image's first column record             |
| 0x04   | `u16` | LED count per column (`*X`, default 80; 85 for the staff)  |
| 0x06   | `u16` | number of columns                                          |
| 0x08   | `u32` | column time in µs × 256 (`*P n` stores `n << 8`)           |
| 0x0C   | `u32` | show time when the image starts, whole ms                  |
| 0x10   | `u16` | fractional part of that time                               |
| 0x12   | `u8`  | `0xA9` once the image is closed                            |
| 0x14   | `u32` | spacing (blank columns, `*S`)                              |
| 0x18   | `u32` | displayed length in columns (columns + spacing if not set) |

The image's play time is its displayed length times its column time.

### Trailer (128 bytes)

| Offset | Type     | Value                                                    |
| ------ | -------- | -------------------------------------------------------- |
| 0x00   | `u32`    | file offset of the trailer (bytes before it)             |
| 0x04   | `u32`    | total show time, whole ms                                |
| 0x08   | `u32`    | total displayed columns                                  |
| 0x0C   | `u32`    | brightness summary (averaged channel levels; unclear)    |
| 0x10   | `u16`    | loop setting from `*J` (`0xFFFF` when `*J0`)             |
| 0x12   | `u16`    | flags; bit 1 set when the overflow table is present      |
| 0x14   | `u16`    | fractional part of the total show time                   |
| 0x18   | 8 × 12 B | first 8 image tables: `u32` offset, `u32` ms, `u16` frac |
| 0x78   | `u16`    | `0x8008`                                                 |
| 0x7A   | `u16`    | image count                                              |
| 0x7C   | 4 bytes  | `sIOP`                                                   |

### The text script

Composer's generator writes one command per line. The compiler understands:

| Line           | Meaning                                                 |
| -------------- | ------------------------------------------------------- |
| `*N,0xRRGGBB`  | N pixels (1 to 3 digits) of one colour, down the column |
| `*Z n`         | start an image                                          |
| `*K`           | end an image                                            |
| `*X n`         | LED count per column                                    |
| `*P n`         | column time in µs                                       |
| `*p n`         | column time already × 256                               |
| `*S n`         | spacing for the current image                           |
| `*J n`         | loop setting                                            |
| `*G n`, `*L n` | stored by the compiler but not written to the file      |
| `*E`           | end of show; writes tables and trailer                  |

Pixel lines outside an image open an unnamed one. Composer's image encoder
emits each column top to bottom as runs of equal colours, at most 240 (or 136) pixels
per run, and starts a new column after LED-count pixels.

## Checking this without a staff

Composer reads an optional `developer.cfg` (JSON) from its data folder,
`%LOCALAPPDATA%\LtComposer3`. With `"debugVpoiOutput": true`, it saves every
show it generates to a `debugVpoi` folder there; `"debugExport": true` adds
"Export vpoi…" and "Export vpoi2…" menu items. Comparing one saved show with a
decoder written from this page confirms the layout before the first upload.
Composer reads the file at start-up, so it must be restarted afterwards.

## Where this came from

- Composer's logs in `%LOCALAPPDATA%\LtComposer3\logs` record every command
  and reply, including the block count and bank sizes after each upload.
- Ghidra 12.1.4 headless analysis of `LtComposer.exe`. The functions logged as
  `lt::Ft2Device::tImportVpoiSequenceBin` and `writeBlocksOfData` give the
  upload; `lt::VpoiCache::getFtvData` and the "iVPOI" compiler give the file.
