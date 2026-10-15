"""Draw the pen prop and publish its measurements.

A capped felt-tip pen spun as a double staff: the cap end is the thumb end.
Writes static/images/props/pictograph/pen.svg, the identical picker tile at
static/images/props/buttons/pen.svg, and scripts/pen-stations.json, which
scripts/build-pen-model.py reads so the drawing and the 3D are one object.

Measured, not estimated. The reference is a pair of fine-point felt-tip pens
photographed flat on a desk, one red and one blue (Austen, 2026-10-14). The red
pen spans 984 px end to end; at the common 142 mm length of this pen class that
resolves to 0.1443 mm/px, and every station below comes off that photo's row
widths:
  end plug   0    -> 8.4 mm, 8.2 mm across, rounded back face
  body       8.4  -> 101.3 mm, 10.0 mm across, 9.7 mm at the cap
  band       9.2  -> 11.5 mm, printed in the pen's ink color, a gray tab on it
  cap        101.3 -> 142 mm, 10.1 mm across, a lip at the mouth, flat-domed end
  clip       free end curled at the cap's mouth, root at the closed end,
             standing 2.4 mm proud of the cap (0.8 gap, 1.6 thick)

Geometry:
  viewBox 252.8 x 30, hand pivot at (126.4, 15). The span matches staff so the
  mandala radius and beta spacing stay on the staff family's numbers. The box
  is taller than the fire staff's because the clip stands off the cap. The
  pen's ends are its tracked tips (+/-126.4), the staff's own reach.

  Nothing is exaggerated. A pen is 14 times as long as it is wide, so at staff
  length it already reads as a solid object; the staff family's thin tubes
  needed 1.15x, this does not.

  Back end (pinky) at x = 0, cap (thumb) at x = 252.8. TKA's staff family puts
  the thumb end at +x; prop-classification.ts carries the same contract.

Color contract (packages/render-core/src/svg-color.ts, selective mode):
  Selective mode keeps a fill that is dark (luminance below 0.4) or tinted
  (saturation above 0.05) and repaints everything else to the motion color.
    Takes the motion color (neutral #B4B4B4): the cap, the clip and the printed
    band. That is the pen's ink color, which is exactly how the real pair reads:
    a red pen and a blue pen, black bodies, colored caps.
    Stays as drawn: the black plug and body (dark), and the gray tab, which is
    a gradient. Gradient fills cannot match the recolor regex, so every shading
    layer is immune and shades whatever color its base became.
  Every id is prefixed `pen` and the loader suffixes it per motion color when
  both props share one document. Nothing is <use>d.

Usage:
  python scripts/build-pen-svg.py
"""

from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]

# -- Measurements (mm, from the back end) ------------------------------------
LENGTH_MM = 142.0
PLUG_END_MM = 8.4
PLUG_D_MM = 8.2
PLUG_ROUND_MM = 1.4             # radius of the back face's rounded corner
BODY_D_MM = 10.0                # at the plug
BODY_D_AT_CAP_MM = 9.7          # the barrel narrows slightly toward the cap
BAND_START_MM = 9.2
BAND_END_MM = 11.5
CAP_START_MM = 101.3
CAP_D_MM = 10.1
CAP_LIP_MM = 1.6                # how long the mouth's lip runs
CAP_LIP_D_MM = 10.5
CAP_END_ROUND_MM = 3.0          # corner radius of the closed end
CAP_END_FACE_D_MM = 5.6         # the flat part of the end face
CLIP_FREE_MM = 103.0            # curl at the cap's mouth
CLIP_ROOT_MM = 137.5            # where it joins the closed end
CLIP_GAP_MM = 0.8
CLIP_THICK_MM = 1.6
CLIP_RIDGES = 3                 # grip ridges near the root

# -- Drawing decisions -------------------------------------------------------
SPAN = 252.8
VB_H = 30.0
CY = VB_H / 2
U = SPAN / LENGTH_MM            # units per mm

NEUTRAL = "#B4B4B4"             # repainted to the motion color
PLUG = "#17181B"
BODY = "#26272B"


def x(mm: float) -> float:
    return round(mm * U, 2)


def r(mm_diameter: float) -> float:
    return round(mm_diameter / 2 * U, 2)


def f(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


PLUG_X = x(PLUG_END_MM)
PLUG_R = r(PLUG_D_MM)
PLUG_ROUND = x(PLUG_ROUND_MM)
BODY_R0 = r(BODY_D_MM)
BODY_R1 = r(BODY_D_AT_CAP_MM)
BAND_X0, BAND_X1 = x(BAND_START_MM), x(BAND_END_MM)
CAP_X = x(CAP_START_MM)
CAP_R = r(CAP_D_MM)
CAP_LIP_X = x(CAP_START_MM + CAP_LIP_MM)
CAP_LIP_R = r(CAP_LIP_D_MM)
CAP_ROUND = x(CAP_END_ROUND_MM)
CAP_FACE_R = r(CAP_END_FACE_D_MM)
CLIP_X0 = x(CLIP_FREE_MM)
CLIP_X1 = x(CLIP_ROOT_MM)
CLIP_INNER = round(CY - CAP_R - CLIP_GAP_MM * U, 2)
CLIP_OUTER = round(CLIP_INNER - CLIP_THICK_MM * U, 2)


def body_half(at_x: float) -> float:
    t = (at_x - PLUG_X) / (CAP_X - PLUG_X)
    return BODY_R0 + (BODY_R1 - BODY_R0) * t


def plug_path() -> str:
    top, bottom = CY - PLUG_R, CY + PLUG_R
    # Overlaps the body by a unit so no seam of background shows between them.
    return (
        f"M{f(PLUG_X + 1)} {f(top)} L{f(PLUG_ROUND)} {f(top)} "
        f"Q0 {f(top)} 0 {f(top + PLUG_ROUND)} "
        f"L0 {f(bottom - PLUG_ROUND)} Q0 {f(bottom)} {f(PLUG_ROUND)} {f(bottom)} "
        f"L{f(PLUG_X + 1)} {f(bottom)} Z"
    )


def body_path() -> str:
    # The body runs a little way into the cap, as the real barrel does.
    end = CAP_X + 2
    r0, r1 = BODY_R0, body_half(end)
    shoulder = 0.9
    return (
        f"M{f(PLUG_X)} {f(CY - PLUG_R)} "
        f"Q{f(PLUG_X)} {f(CY - r0)} {f(PLUG_X + shoulder)} {f(CY - r0)} "
        f"L{f(end)} {f(CY - r1)} L{f(end)} {f(CY + r1)} "
        f"L{f(PLUG_X + shoulder)} {f(CY + r0)} "
        f"Q{f(PLUG_X)} {f(CY + r0)} {f(PLUG_X)} {f(CY + PLUG_R)} Z"
    )


def band_path() -> str:
    h0, h1 = body_half(BAND_X0), body_half(BAND_X1)
    return (
        f"M{f(BAND_X0)} {f(CY - h0)} L{f(BAND_X1)} {f(CY - h1)} "
        f"L{f(BAND_X1)} {f(CY + h1)} L{f(BAND_X0)} {f(CY + h0)} Z"
    )


def cap_path() -> str:
    end = SPAN
    knee = end - CAP_ROUND
    return (
        f"M{f(CAP_X)} {f(CY - CAP_LIP_R)} "
        f"L{f(CAP_LIP_X - 0.6)} {f(CY - CAP_LIP_R)} "
        f"Q{f(CAP_LIP_X)} {f(CY - CAP_LIP_R)} {f(CAP_LIP_X + 0.5)} {f(CY - CAP_R)} "
        f"L{f(knee)} {f(CY - CAP_R)} "
        f"C{f(end - 1.2)} {f(CY - CAP_R)} {f(end)} {f(CY - CAP_FACE_R - 1.4)} "
        f"{f(end)} {f(CY - CAP_FACE_R)} "
        f"Q{f(end + 0.5)} {f(CY)} {f(end)} {f(CY + CAP_FACE_R)} "
        f"C{f(end)} {f(CY + CAP_FACE_R + 1.4)} {f(end - 1.2)} {f(CY + CAP_R)} "
        f"{f(knee)} {f(CY + CAP_R)} "
        f"L{f(CAP_LIP_X + 0.5)} {f(CY + CAP_R)} "
        f"Q{f(CAP_LIP_X)} {f(CY + CAP_LIP_R)} {f(CAP_LIP_X - 0.6)} {f(CY + CAP_LIP_R)} "
        f"L{f(CAP_X)} {f(CY + CAP_LIP_R)} Z"
    )


def clip_path() -> str:
    """Side view of the clip: a strip standing off the cap on a curl at its
    free end, sloping down into the cap at its root."""
    cap_top = CY - CAP_R
    inner, outer = CLIP_INNER, CLIP_OUTER
    curl = CLIP_X0
    root = CLIP_X1
    # The root slopes into the cap over the last few millimetres.
    slope_start = root - x(6.0)
    parts = [
        # The curl: a rounded hook whose tip nearly touches the cap.
        f"M{f(curl + 1.6)} {f(cap_top - 0.35)}",
        f"C{f(curl + 0.2)} {f(cap_top - 0.35)} {f(curl - 0.3)} {f(outer + 0.3)} "
        f"{f(curl + 1.6)} {f(outer - 0.15)}",
        f"Q{f(curl + 3.4)} {f(outer - 0.3)} {f(curl + 5.2)} {f(outer)}",
        f"L{f(slope_start)} {f(outer)}",
    ]
    # Grip ridges on the outer face near the root.
    ridge_pitch = x(1.5)
    ridge_x = slope_start - ridge_pitch * (CLIP_RIDGES + 0.5)
    parts[-1] = f"L{f(ridge_x)} {f(outer)}"
    for _ in range(CLIP_RIDGES):
        parts.append(
            f"Q{f(ridge_x + ridge_pitch / 2)} {f(outer - 0.55)} "
            f"{f(ridge_x + ridge_pitch)} {f(outer)}"
        )
        ridge_x += ridge_pitch
    parts += [
        f"L{f(slope_start)} {f(outer)}",
        f"C{f(root - 2)} {f(outer)} {f(root)} {f(cap_top - 0.8)} "
        f"{f(root + 2.5)} {f(cap_top + 0.3)}",
        f"L{f(slope_start + 1.5)} {f(cap_top + 0.3)}",
        f"C{f(slope_start)} {f(cap_top)} {f(slope_start - 1)} {f(inner)} "
        f"{f(slope_start - 3)} {f(inner)}",
        f"L{f(curl + 3.6)} {f(inner)}",
        f"Q{f(curl + 2.2)} {f(inner)} {f(curl + 1.9)} {f(cap_top - 0.9)}",
        "Z",
    ]
    return " ".join(parts)


def shade(id_: str, y0: float, y1: float, stops: list[tuple[float, str, float]]) -> str:
    rows = "\n".join(
        f'      <stop offset="{f(o)}" stop-color="{c}" stop-opacity="{f(a)}"/>'
        for o, c, a in stops
    )
    return (
        f'    <linearGradient id="{id_}" x1="0" y1="{f(y0)}" x2="0" y2="{f(y1)}" '
        f'gradientUnits="userSpaceOnUse">\n{rows}\n    </linearGradient>'
    )


def build_svg() -> str:
    body_top, body_bottom = CY - BODY_R0, CY + BODY_R0
    cap_top, cap_bottom = CY - CAP_LIP_R, CY + CAP_LIP_R
    defs = "\n".join(
        [
            # Matte barrel: a soft sheen high up, falling to a dark underside.
            shade("penSatin", body_top, body_bottom, [
                (0, "#000000", 0.4),
                (0.16, "#FFFFFF", 0.2),
                (0.34, "#FFFFFF", 0.05),
                (0.7, "#000000", 0.18),
                (1, "#000000", 0.5),
            ]),
            # The plug is glossier than the barrel.
            shade("penPlugGloss", CY - PLUG_R, CY + PLUG_R, [
                (0, "#000000", 0.3),
                (0.18, "#FFFFFF", 0.32),
                (0.3, "#FFFFFF", 0.06),
                (0.75, "#000000", 0.2),
                (1, "#000000", 0.55),
            ]),
            # Molded cap plastic: a hard highlight line and a dark underside, over
            # the recolored base.
            shade("penCapGloss", cap_top, cap_bottom, [
                (0, "#000000", 0.3),
                (0.14, "#FFFFFF", 0.42),
                (0.26, "#FFFFFF", 0.1),
                (0.62, "#000000", 0.14),
                (1, "#000000", 0.5),
            ]),
            shade("penClipGloss", CLIP_OUTER - 0.8, CY - CAP_R + 0.4, [
                (0, "#FFFFFF", 0.45),
                (0.45, "#FFFFFF", 0.08),
                (1, "#000000", 0.4),
            ]),
            # The gray tab printed on the band. A gradient, so it is never
            # repainted.
            shade("penTab", CY - BODY_R0, CY + BODY_R0, [
                (0, "#9EA3A8", 1),
                (0.5, "#C9CDD1", 1),
                (1, "#7E8388", 1),
            ]),
            # The cap's shade under the clip.
            shade("penShadow", CLIP_INNER, CY - CAP_R + 1.6, [
                (0, "#000000", 0),
                (0.55, "#000000", 0.35),
                (1, "#000000", 0),
            ]),
        ]
    )
    band_top = CY - body_half(BAND_X0)
    tab_h = round(BODY_R0 * 2 * 0.17, 2)
    cap_seam_x = CAP_LIP_X + 0.5
    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<!--",
        "  Pen - a capped felt-tip pen spun as a double staff. Staff family; the",
        "  cap end is the thumb end.",
        "",
        "  GENERATED by scripts/build-pen-svg.py. Edit the measurements there and",
        "  re-run it. scripts/build-pen-model.py builds the 3D from",
        "  scripts/pen-stations.json, which that script writes.",
        "",
        "  Cap, clip and band are neutral #B4B4B4 and take the motion color;",
        "  the black plug and body are preserved as dark. See the generator for",
        "  the full color contract.",
        "-->",
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(SPAN)} {f(VB_H)}">',
        "  <defs>",
        defs,
        "  </defs>",
        "",
        "  <!-- End plug, the pinky end. -->",
        f'  <path d="{plug_path()}" fill="{PLUG}"/>',
        f'  <path d="{plug_path()}" fill="url(#penPlugGloss)"/>',
        f'  <rect x="{f(x(3.2))}" y="{f(CY - PLUG_R)}" width="0.7" height="{f(PLUG_R * 2)}" '
        'fill="#000000" opacity="0.35"/>',
        "",
        "  <!-- Barrel, the printed band and its gray tab. -->",
        f'  <path d="{body_path()}" fill="{BODY}"/>',
        f'  <path d="{band_path()}" fill="{NEUTRAL}"/>',
        f'  <rect x="{f(BAND_X0)}" y="{f(band_top + 0.9)}" width="{f(BAND_X1 - BAND_X0)}" '
        f'height="{f(tab_h)}" fill="url(#penTab)"/>',
        f'  <path d="{body_path()}" fill="url(#penSatin)"/>',
        # A black pen on a near-black cell needs an edge to read at all: a
        # faint rim of reflected light, as a satin barrel shows against a dark
        # desk. Stroked, so the recolor never sees it.
        f'  <path d="{body_path()}" fill="none" stroke="#FFFFFF" stroke-width="0.45" '
        'stroke-opacity="0.16"/>',
        f'  <path d="{plug_path()}" fill="none" stroke="#FFFFFF" stroke-width="0.45" '
        'stroke-opacity="0.16"/>',
        "",
        "  <!-- Cap, the thumb end, and its clip. -->",
        f'  <path d="{cap_path()}" fill="{NEUTRAL}"/>',
        f'  <path d="{cap_path()}" fill="url(#penCapGloss)"/>',
        f'  <path d="M{f(cap_seam_x)} {f(CY - CAP_R + 0.2)} L{f(cap_seam_x)} {f(CY + CAP_R - 0.2)}" '
        'fill="none" stroke="#000000" stroke-width="0.45" opacity="0.28"/>',
        f'  <rect x="{f(CLIP_X0 + 2)}" y="{f(CY - CAP_R)}" width="{f(CLIP_X1 - CLIP_X0 - 4)}" '
        f'height="1.6" fill="url(#penShadow)"/>',
        f'  <path d="{clip_path()}" fill="{NEUTRAL}"/>',
        f'  <path d="{clip_path()}" fill="url(#penClipGloss)" stroke="#000000" '
        'stroke-width="0.35" stroke-opacity="0.35"/>',
        "</svg>",
        "",
    ]
    return "\n".join(lines)


def stations() -> dict:
    return {
        "_": "GENERATED by scripts/build-pen-svg.py. Do not edit.",
        "span_units": SPAN,
        "viewbox_height": VB_H,
        "units_per_mm": round(U, 6),
        "length_mm": LENGTH_MM,
        "plug_end_mm": PLUG_END_MM,
        "plug_d_mm": PLUG_D_MM,
        "plug_round_mm": PLUG_ROUND_MM,
        "body_d_mm": BODY_D_MM,
        "body_d_at_cap_mm": BODY_D_AT_CAP_MM,
        "band_mm": [BAND_START_MM, BAND_END_MM],
        "cap_start_mm": CAP_START_MM,
        "cap_d_mm": CAP_D_MM,
        "cap_lip_mm": CAP_LIP_MM,
        "cap_lip_d_mm": CAP_LIP_D_MM,
        "cap_end_round_mm": CAP_END_ROUND_MM,
        "cap_end_face_d_mm": CAP_END_FACE_D_MM,
        "clip_mm": [CLIP_FREE_MM, CLIP_ROOT_MM],
        "clip_gap_mm": CLIP_GAP_MM,
        "clip_thick_mm": CLIP_THICK_MM,
        "clip_ridges": CLIP_RIDGES,
        "colors": {"plug": PLUG, "body": BODY, "neutral": NEUTRAL},
    }


def main() -> None:
    svg = build_svg()
    for folder in ("pictograph", "buttons"):
        out = ROOT / "static" / "images" / "props" / folder / "pen.svg"
        out.write_text(svg, encoding="utf-8", newline="\n")
        print(f"wrote {out.relative_to(ROOT)}")
    table = ROOT / "scripts" / "pen-stations.json"
    table.write_text(json.dumps(stations(), indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {table.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
