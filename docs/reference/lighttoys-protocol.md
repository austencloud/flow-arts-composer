# Lighttoys Lumi Staff USB Protocol

How Lighttoys Composer 4.5 builds a show and uploads it to a Lumi Staff
(Lighttoys "FT2" hardware) over USB. Decoded in October 2026 from Composer's
logs and from its machine code with Ghidra (`LtComposer.exe`, C++ on Cinder;
the source paths in the binary name `Ft2Device.cpp` and `VpoiGenerator.cpp`).
The Flow Arts uploader (`src/lib/features/poi/services/lighttoys/`) follows
this page, but it has not been tried on a staff yet.

The show layout below is confirmed by size: compiling a Composer show script
with it gives exactly the 120,445 bytes Composer logged when it uploaded that
show (see "How the layout was checked"). Not yet confirmed: the byte-for-byte
contents, the exact `sd` reply format, and what bank 5 holds.

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

Composer's bank list comes from `sd`, which answers one line per used bank
starting with the bank number and a colon (`N:` then three fields and the
track name; parsed at `0x1401e02e0`). `fsem` and `fse` report flash totals;
the staff has 16,777,216 bytes.

Before an upload into an occupied bank, Composer deletes that bank's show with
an `fd` command for that bank. The Flow Arts uploader never sends `fd`: it
reads `sd`, refuses a bank that any `N:` line marks as used, and asks for an
empty one, so an existing show is never replaced. It rereads `sd` after the
upload and reports a failure unless the bank is now listed.

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
Any uploader must allow only the commands it needs and refuse every other
one, as the Ignis uploader's `assertSafeRequest` does. The Flow Arts uploader's
`assertSafeCommand` passes only `v`, `sd` and `fW e <uid> b<1-4> <size> <name>`,
plus data blocks built by `frameBlock`. Unexplained commands seen in the binary (`pp`,
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
| 3 × count  | literal pixels, H S V               |
| 1          | repeat count (0 ends the column)    |
| 3 if not 0 | the repeated pixel, H S V           |

Pixels are stored as hue, saturation and value, not RGB. Composer converts
each script colour with integer arithmetic (`max`, `min` of R, G, B;
`d = max - min`):

- `V = max`. If `max` or `d` is 0, the pixel is `0, 0, V`.
- `S = (255 × d + max / 2) / max`, rounded down.
- Hue runs 0 to 179 (two degrees per step). With `q(x) = (30 × x + d / 2) / d`
  rounded down: red largest gives `q(G - B)` when `G ≥ B`, else
  `180 - q(B - G)`; green largest gives `60 + q(B - R)`; blue largest gives
  `120 + q(R - G)`, negative differences subtracting. A result of 180 becomes 0.

Ties go to red before green before blue. Runs are found on the converted
values, so two script colours that convert alike merge into one run.

Composer writes a repeat for three or more equal pixels in a row, and also
for a run of two or more that reaches the end of the column. Repeats longer
than 255 are split. A column that ends in a repeat has no closing segment; one
that ends in literals closes with a repeat count of 0. When the compressed
form is longer than the plain one (`(LEDs + 1) × 3` bytes), Composer writes
the plain form instead: one segment with every pixel as a literal and a repeat
count of 0. Both decode the same way, so an encoder may always write the plain
form. A column holds exactly as many pixels as the image's LED count.

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

The image's play time is its displayed length times its column time. The staff
repeats an image's columns across its displayed length, so Composer stores each
logo image once (about 99 columns) and gives it a displayed length of 8147.
The Flow Arts uploader does the same: one image holding the pattern's columns,
displayed for the chosen play time.

### Trailer (128 bytes)

| Offset | Type     | Value                                                    |
| ------ | -------- | -------------------------------------------------------- |
| 0x00   | `u32`    | file offset of the trailer (bytes before it)             |
| 0x04   | `u32`    | total show time, whole ms                                |
| 0x08   | `u32`    | total displayed columns                                  |
| 0x0C   | `u32`    | colour summary, see below                                |
| 0x10   | `u16`    | loop setting from `*J` (`0xFFFF` when `*J0`)             |
| 0x12   | `u16`    | flags; bit 1 set when the overflow table is present      |
| 0x14   | `u16`    | fractional part of the total show time                   |
| 0x18   | 8 × 12 B | first 8 image tables: `u32` offset, `u32` ms, `u16` frac |
| 0x78   | `u16`    | `0x8008`                                                 |
| 0x7A   | `u16`    | image count                                              |
| 0x7C   | 4 bytes  | `sIOP`                                                   |

The colour summary averages every stored pixel's H, S and V (32-bit sums,
rounded down) and packs them as
`((((Vavg × 255 / 100) | 0x4000) << 8 | Savg × 255 / 100) << 8) | (Havg >> 1)`,
each division rounded down.

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
| `*Y n`         | image width in columns, seen in per-image exports       |
| `*E`           | end of show; writes tables and trailer                  |

Pixel lines outside an image open an unnamed one. Composer's image encoder
emits each column top to bottom as runs of equal colours, at most 240 (or 136) pixels
per run, and starts a new column after LED-count pixels.

## How the layout was checked

Composer reads an optional `developer.cfg` (JSON) from its data folder,
`%LOCALAPPDATA%\LtComposer3`, at start-up. `"debugExport": true` adds
"Export vpoi…" (the whole show) and "Export vpoi2…" (one file per image) to
File → Export, and `"debugVpoiOutput": true` writes the same exports to a
`debugVpoi` folder while generating. All of these save the text script, not
the compiled binary; Composer only builds the binary in memory during an
upload.

The check therefore compiled an exported script with this page's layout and
compared the size with Composer's own log. On 2026-10-18, Austen's August
project (seven logo images and a black tail on one 85-LED track) exported to
a script whose images, widths and timings match the log of its 2026-08-24
upload. Compiled as described here it comes to 120,445 bytes, exactly the
`Data.ftv size` and bank size Composer logged. Storing RGB instead of HSV gives
120,844, and always writing a closing segment gives 122,257, so both rules
above are load-bearing.

## Where this came from

- Composer's logs in `%LOCALAPPDATA%\LtComposer3\logs` record every command
  and reply, including the block count and bank sizes after each upload.
- Ghidra 12.1.4 headless analysis of `LtComposer.exe`. The functions logged as
  `lt::Ft2Device::tImportVpoiSequenceBin` and `writeBlocksOfData` give the
  upload; `lt::VpoiCache::getFtvData` and the "iVPOI" compiler give the file.
  The colour conversion is the pixel-add routine at `0x140250050`, the column
  encoder is at `0x140250590`, and the column writer at `0x1402507d0`.
