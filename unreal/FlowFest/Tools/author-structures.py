"""Run in background Blender. Author the real festival structures from Austen's site interview.

Every piece is plain beams, boxes and sheets. Its origin is the middle of its footprint on the
ground and its front faces +X; Unreal turns each one to its facing and sets it on the terrain.
Material names are the Unreal material names (`import-structures.py` builds those graphs), and
wood carries a per-board grey in vertex colour so weathered boards do not read as one slab.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
STAGED = HERE / 'staged' / 'structures'
STAGED.mkdir(parents=True, exist_ok=True)
rng = random.Random(41)

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        if not mesh.users: bpy.data.meshes.remove(mesh)

MATS = {}
def mat(name, color=(.5, .5, .5)):
    """A Blender stand-in; Unreal replaces it by name with the M_Structures_ graph."""
    name = 'M_Structures_' + name
    if name not in MATS:
        m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); MATS[name] = m
    return MATS[name]

WOOD = mat('Wood', (.30, .28, .25)); MOSS = mat('WoodMoss', (.10, .11, .07)); WARM = mat('WoodWarm', (.42, .30, .18))
TEAL = mat('RoofTeal', (.05, .32, .33)); GALV = mat('Galvanized', (.55, .56, .55)); ROOFGREY = mat('RoofGrey', (.25, .26, .27))
ROOFGREEN = mat('RoofGreen', (.08, .2, .1)); ROOFPINK = mat('RoofPink', (.62, .3, .33)); ROOFDARK = mat('RoofCharcoal', (.1, .1, .11))
PALE = mat('WallPale', (.62, .6, .54)); WHITE = mat('PaintWhite', (.78, .78, .75)); LOG = mat('LogWall', (.3, .18, .09))
CONCRETE = mat('Concrete', (.42, .41, .38)); CANVAS = mat('Canvas', (.8, .79, .74)); FABRIC = mat('Fabric', (.8, .8, .78))
PAINTED = mat('InstancePaint', (.8, .8, .78)); BLACK = mat('BlackCloth', (.02, .02, .022)); STEEL = mat('Steel', (.55, .56, .57))
DARKMETAL = mat('DarkMetal', (.05, .05, .05)); GLASS = mat('Window', (.02, .025, .03)); TOILET = mat('PlasticBlue', (.18, .28, .36))
TOILETTOP = mat('PlasticWhite', (.85, .85, .82)); RED = mat('Red', (.55, .04, .03)); BLUE = mat('BarrelBlue', (.04, .14, .45))
PAINT = mat('SignPaint', (.85, .8, .65)); CHALK = mat('Chalkboard', (.04, .05, .045)); HAY = mat('Hay', (.62, .5, .24))
BRIGHT = mat('Wristbands', (.95, .35, .05)); LIME = mat('Lime', (.5, .85, .1)); CONE = mat('ConeOrange', (.9, .28, .02))
PANEL = mat('ArtPanel', (.8, .4, .2)); ROPE = mat('Rope', (.45, .38, .26)); BULB = mat('Bulb', (.7, .65, .5))
CHAIRS = [mat('ChairGreen', (.05, .16, .08)), mat('ChairNavy', (.04, .06, .16)), mat('ChairRust', (.3, .08, .04))]
TABLE = mat('TableTop', (.72, .71, .67)); WATER = mat('WaterFlat', (.35, .5, .65))

def shade(o, value=1.):
    """Every corner of the object takes one grey in the 'Col' vertex colour."""
    mesh = o.data
    layer = mesh.color_attributes.get('Col') or mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for item in layer.data: item.color = (value, value, value, 1)
    return o

def grain(o, low=.72, high=1.):
    return shade(o, rng.uniform(low, high))

def box(name, loc, size, m, bevel=.012, tone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = name
    o.dimensions = size; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('Worn edges', 'BEVEL'); b.width = bevel; b.segments = 1
    shade(o, rng.uniform(.72, 1.) if tone is None else tone)
    return o

def turned(o, yaw=0., pitch=0., roll=0.):
    o.rotation_euler = (roll, pitch, yaw); return o

def beam(a, b, r, m, sides=8, tone=1.):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=r, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); o.data.materials.append(m)
    return shade(o, tone)

def plank(a, b, width, thick, m, up=(0, 0, 1), tone=None):
    """A square-section timber from a to b; `up` orients its wide face."""
    a, b = Vector(a), Vector(b); d = (b - a); length = d.length; d.normalize()
    side = d.cross(Vector(up)); side = side.normalized() if side.length > 1e-4 else Vector((0, 1, 0))
    normal = side.cross(d)
    o = box('Timber', (a + b) / 2, (length, width, thick), m, .006, tone)
    o.rotation_euler = Matrix((d, side, normal)).transposed().to_euler()
    return o

def mesh_object(name, verts, faces, m, thickness=0., smooth=False, tone=1.):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata([tuple(v) for v in verts], [], faces); mesh.update()
    o = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(o); o.data.materials.append(m)
    for p in mesh.polygons: p.use_smooth = smooth
    if thickness:
        s = o.modifiers.new('Thickness', 'SOLIDIFY'); s.thickness = thickness; s.offset = 0
    return shade(o, tone)

def sheet(name, point, nu, nv, m, thickness=.012, tone=1.):
    verts = [point(i / nu, j / nv) for j in range(nv + 1) for i in range(nu + 1)]
    faces = [(j * (nu + 1) + i, j * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i + 1, (j + 1) * (nu + 1) + i) for j in range(nv) for i in range(nu)]
    return mesh_object(name, verts, faces, m, thickness, True, tone)

def text(body, size, loc, m, yaw=0., depth=.006):
    """Painted letters standing in the YZ plane, readable from +X (then turned by yaw)."""
    bpy.ops.object.text_add(location=(0, 0, 0)); o = bpy.context.object
    o.data.body = body; o.data.size = size; o.data.extrude = depth; o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    o.rotation_euler = (math.pi / 2, 0, math.pi / 2 + yaw); o.location = loc
    bpy.ops.object.convert(target='MESH'); o.data.materials.clear(); o.data.materials.append(m)
    return shade(o, 1.)

def export(name):
    bpy.ops.object.select_all(action='SELECT')
    for o in bpy.context.selected_objects:
        if o.type == 'MESH' and not o.data.color_attributes.get('Col'): shade(o, 1.)
    bpy.ops.export_scene.fbx(filepath=str(STAGED / (name + '.fbx')), use_selection=True, object_types={'MESH'},
        apply_unit_scale=True, axis_forward='-Y', axis_up='Z', use_mesh_modifiers=True, mesh_smooth_type='FACE',
        colors_type='LINEAR', add_leaf_bones=False)
    print('FLOWFEST_STRUCTURE', name, len(bpy.context.selected_objects))

# ---- shared furniture --------------------------------------------------------------

def folding_table(at=(0, 0), yaw=0., length=1.83, width=.76):
    r = Matrix.Rotation(yaw, 3, 'Z'); c = Vector((*at, 0))
    turned(box('Table top', c + Vector((0, 0, .73)), (length, width, .04), TABLE, .01, 1.), yaw)
    for s in (-1, 1):
        a = c + r @ Vector((s * (length / 2 - .15), -width / 2 + .06, 0)); b = c + r @ Vector((s * (length / 2 - .15), width / 2 - .06, 0))
        beam(a, b + Vector((0, 0, .71)), .012, STEEL); beam(b, a + Vector((0, 0, .71)), .012, STEEL)

def folding_chair(at=(0, 0), yaw=0., m=DARKMETAL):
    r = Matrix.Rotation(yaw, 3, 'Z'); c = Vector((*at, 0)); p = lambda x, y, z: c + r @ Vector((x, y, z))
    for y in (-.2, .2):
        beam(p(.2, y, 0), p(.2, y, .45), .01, STEEL); beam(p(-.2, y, 0), p(-.22, y, .86), .01, STEEL)
    turned(box('Seat', p(0, 0, .46), (.42, .42, .03), m, .005), yaw)
    turned(box('Back', p(-.21, 0, .72), (.03, .42, .22), m, .005), yaw, .1)

def camp_chair(at=(0, 0), yaw=0., m=CHAIRS[0]):
    """The web camp's folding camp chair; yaw turns the seat to face +X rotated."""
    r = Matrix.Rotation(yaw, 3, 'Z'); c = Vector((*at, 0)); p = lambda x, y, z: tuple(c + r @ Vector((x, y, z)))
    for y in (-.24, .24):
        beam(p(-.22, y, 0), p(.2, y, .46), .011, STEEL); beam(p(.2, y, 0), p(-.22, y, .46), .011, STEEL)
    mesh_object('Chair seat', [p(.22, -.25, .45), p(.22, .25, .45), p(-.2, .25, .4), p(-.2, -.25, .4)], [(0, 1, 2, 3)], m, .012)
    mesh_object('Chair back', [p(-.2, -.25, .4), p(-.2, .25, .4), p(-.3, .25, .88), p(-.3, -.25, .88)], [(0, 1, 2, 3)], m, .012)
    for y in (-.27, .27): beam(p(-.22, y, .62), p(.22, y, .62), .012, STEEL)

def popup(half, eave, rise, drop, cloth=FABRIC):
    """A pop-up shade: square legs, scissor truss under the valance, a sagging peaked top."""
    leg = half - .06
    for x in (-leg, leg):
        for y in (-leg, leg):
            box('Leg', (x, y, .62), (.05, .05, 1.34), STEEL, .006, 1.); box('Leg upper', (x, y, (1.24 + eave) / 2), (.038, .038, eave - 1.24), STEEL, .006, 1.)
            box('Foot', (x, y, .006), (.13, .13, .012), STEEL, 0, 1.)
    corners = [(-leg, -leg), (leg, -leg), (leg, leg), (-leg, leg)]
    for (x0, y0), (x1, y1) in zip(corners, corners[1:] + corners[:1]):
        n = max(2, round(half * 2))
        for k in range(n):
            a = (x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); b = (x0 + (x1 - x0) * (k + 1) / n, y0 + (y1 - y0) * (k + 1) / n)
            beam((*a, eave - .02), (*b, eave - .36), .012, STEEL); beam((*a, eave - .36), (*b, eave - .02), .012, STEEL)
    peak = Vector((0, 0, eave + rise))
    edges = [(-half, -half), (half, -half), (half, half), (-half, half)]
    for (x0, y0), (x1, y1) in zip(edges, edges[1:] + edges[:1]):
        def roof(u, v, x0=x0, y0=y0, x1=x1, y1=y1):
            e = Vector((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, eave)); p = e.lerp(peak, v)
            return (p.x, p.y, p.z - .05 * half * math.sin(math.pi * u) * math.sin(math.pi * min(v * 1.4, 1)))
        sheet('Canopy top', roof, 10, 6, cloth, .01)
        mesh_object('Valance', [(x0, y0, eave), (x1, y1, eave), (x1, y1, eave - drop), (x0, y0, eave - drop)], [(0, 1, 2, 3)], cloth, .012)
        beam((x0 * .97, y0 * .97, eave + .01), tuple(peak - Vector((0, 0, .03))), .012, STEEL)

def gable(length, depth, eave, ridge, overhang, m, thick=.05, along='Y'):
    """A two-slope roof with its ridge along Y (or X), overhanging every wall."""
    hl, hd = length / 2 + overhang, depth / 2 + overhang
    slope = (ridge - eave) / (depth / 2); low = eave - slope * overhang
    for s in (-1, 1):
        pts = [(-hl, s * hd, low), (hl, s * hd, low), (hl, 0, ridge), (-hl, 0, ridge)] if along == 'Y' else \
              [(s * hd, -hl, low), (s * hd, hl, low), (0, hl, ridge), (0, -hl, ridge)]
        if along == 'Y': pts = [(p[1], p[0], p[2]) for p in pts]
        mesh_object('Roof slope', pts, [(0, 1, 2, 3)], m, thick)

def gable_ends(length, depth, eave, ridge, m, along='Y'):
    """Closed triangular gables between the wall tops and the ridge."""
    for s in (-1, 1):
        if along == 'Y': pts = [(-depth / 2, s * length / 2, eave), (depth / 2, s * length / 2, eave), (0, s * length / 2, ridge)]
        else: pts = [(s * length / 2, -depth / 2, eave), (s * length / 2, depth / 2, eave), (s * length / 2, 0, ridge)]
        mesh_object('Gable', pts, [(0, 1, 2)], m, .16)

def foundation(depth, width, below, top, m=CONCRETE):
    """A plinth from `below` up to `top`, so a slope buries it instead of showing a gap."""
    box('Foundation', (0, 0, (top + below) / 2), (depth, width, top - below), m, .02, .9)

# ---- Middle Earth --------------------------------------------------------------------

def showcase_stage():
    """Deck 6 deep (X) by 8 wide (Y) at 0.8 m, teal roof overhanging 1 m, backdrop at the back."""
    clear()
    box('Deck skirt', (0, 0, .1), (6, 8, 1.4), BLACK, .01, 1.)
    for i in range(16):
        y = -4 + .25 + i * .5
        box('Deck board', (0, y, .83), (6.04, .48, .06), WOOD, .008)
    for x in (-2.85, 2.85):
        for y in (-3.85, 3.85): box('Post', (x, y, 2.4), (.15, .15, 3.4), WOOD, .01)
    for x in (-2.85, 2.85): box('Beam', (x, 0, 4.05), (.18, 8.1, .3), WOOD, .01)
    for y in (-3.85, 3.85): box('Tie', (0, y, 4.05), (5.9, .14, .24), WOOD, .01)
    gable(8, 6, 4.2, 5.4, 1., TEAL, .05)
    gable_ends(8, 6, 4.2, 5.4, TEAL)
    # Backdrop hangs from the back beam, a little slack at the bottom.
    sheet('Backdrop', lambda u, v: (-2.72 + .04 * math.sin(u * 23), -3.75 + 7.5 * u, .9 + 3.0 * v), 24, 4, BLACK, .01)
    for y in (-3.9, 3.9):
        for z in (.25, .6): box('Skirt rail', (3.02, 0, z), (.04, 8, .06), WOOD, 0)
        # Speakers on tripods at the front corners, on the grass in front of the deck.
        c = Vector((3.7, y * 1.02, 0))
        for k in range(3):
            a = k * math.tau / 3; beam(c + Vector((.45 * math.cos(a), .45 * math.sin(a), 0)), c + Vector((0, 0, 1.25)), .014, DARKMETAL)
        beam(c, c + Vector((0, 0, 1.9)), .02, DARKMETAL)
        turned(box('Speaker', c + Vector((0, 0, 2.2)), (.45, .52, .7), DARKMETAL, .02, 1.), -.15 * (1 if y > 0 else -1))
        box('Grille', c + Vector((.235, 0, 2.2)), (.012, .44, .6), BLACK, 0, 1.)
    # A short ramp off the back corner, beside the tree behind the stage.
    ramp = [(-3, 2.2, .86), (-3, 3.4, .86), (-6.2, 3.4, -.05), (-6.2, 2.2, -.05)]
    mesh_object('Ramp', ramp, [(0, 1, 2, 3)], WOOD, .08, tone=.8)
    for x in (-3.8, -5.0): box('Ramp leg', (x, 2.8, .2), (.1, 1.1, .5), WOOD, 0)
    # Front steps at the north end of the front edge.
    for k in range(3): box('Step', (3.2 + .3 * (2 - k), -3.2, .14 + .27 * k), (.3, 1.0, .06), WOOD, .005)
    export('ShowcaseStage')

def juggling_tent():
    """A 10 m frame tent: aluminium frame, white hip roof (3.5 m eaves, 5 m peak), walls rolled up."""
    clear()
    h, eave, peak = 5., 3.5, 5.
    posts = [(x, y) for x in (-h, 0, h) for y in (-h, 0, h) if (x, y) != (0, 0)]
    for x, y in posts:
        box('Upright', (x * .99, y * .99, eave / 2), (.08, .08, eave), STEEL, .006, 1.)
        box('Base plate', (x * .99, y * .99, .01), (.25, .25, .02), STEEL, 0, 1.)
    corners = [(-h, -h), (h, -h), (h, h), (-h, h)]
    for (x0, y0), (x1, y1) in zip(corners, corners[1:] + corners[:1]):
        beam((x0 * .99, y0 * .99, eave), (x1 * .99, y1 * .99, eave), .04, STEEL)
        beam((x0 * .99, y0 * .99, eave), (0, 0, peak), .035, STEEL)
        def roof(u, v, x0=x0, y0=y0, x1=x1, y1=y1):
            e = Vector((x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, eave)); p = e.lerp(Vector((0, 0, peak)), v)
            sag = .12 * math.sin(math.pi * u) * math.sin(math.pi * v)
            return (p.x * 1.02, p.y * 1.02, p.z - sag)
        sheet('Tent top', roof, 16, 8, CANVAS, .012)
        mesh_object('Valance', [(x0 * 1.02, y0 * 1.02, eave), (x1 * 1.02, y1 * 1.02, eave), (x1 * 1.02, y1 * 1.02, eave - .35), (x0 * 1.02, y0 * 1.02, eave - .35)], [(0, 1, 2, 3)], CANVAS, .012)
        # The side wall rolled and tied up under the valance.
        beam((x0 * 1.0, y0 * 1.0, eave - .5), (x1 * 1.0, y1 * 1.0, eave - .5), .1, CANVAS, 10)
    for x in (-h, h):
        beam((x * .99, 0, eave), (0, 0, peak), .03, STEEL)
    for y in (-h, h):
        beam((0, y * .99, eave), (0, 0, peak), .03, STEEL)
    for x, y in corners:
        s = Vector((x, y, 0)).normalized() * 2.2
        beam((x, y, eave - .1), (x + s.x, y + s.y, 0), .006, ROPE)
        beam((x + s.x, y + s.y, -.1), (x + s.x, y + s.y, .15), .02, STEEL)
    export('JugglingTent')

def food_pavilion():
    """White gable pavilion, 8 deep (X) by 12 long (Y), on posts over a concrete pad."""
    clear()
    box('Pad', (0, 0, -.25), (9, 13, .74), CONCRETE, .03, .95)
    for y in (-5.7, -1.9, 1.9, 5.7):
        for x in (-3.8, 3.8): box('Post', (x, y, 1.62), (.16, .16, 3.0), WHITE, .01)
    for x in (-3.8, 3.8): box('Plate', (x, 0, 3.15), (.2, 11.8, .3), WHITE, .01)
    for y in (-5.7, -1.9, 1.9, 5.7):
        beam((-3.8, y, 3.05), (0, y, 4.4), .06, WHITE); beam((3.8, y, 3.05), (0, y, 4.4), .06, WHITE)
        box('Tie', (0, y, 3.15), (7.6, .12, .16), WHITE, .005)
    gable(12, 8, 3.3, 4.6, .7, WHITE, .05)
    for i, (x, y) in enumerate([(-1.6, -3.8), (1.6, -3.8), (-1.6, 3.8), (1.6, 3.8)]):
        picnic_table((x, y), (i % 2) * .08)
    export('FoodPavilion')

def picnic_table(at, yaw):
    r = Matrix.Rotation(yaw, 3, 'Z'); c = Vector((*at, .12)); p = lambda x, y, z: c + r @ Vector((x, y, z))
    for k in range(4): turned(box('Table board', p(-.27 + .18 * k, 0, .74), (.16, 1.85, .04), WARM, .006), yaw)
    for s in (-1, 1):
        for k in range(2): turned(box('Bench board', p(s * (.64 + .12 * k), 0, .44), (.11, 1.85, .04), WARM, .006), yaw)
        for y in (-.7, .7):
            beam(p(-.75 * s, y, 0), p(.15 * s, y, .74), .025, WARM, 6)
    for y in (-.7, .7): turned(box('Seat rail', p(0, y, .4), (1.6, .06, .08), WARM, 0), yaw)

def food_booth():
    """A food trailer: a painted box on wheels, serving window and awning on +X, a chalkboard."""
    clear()
    box('Body', (0, 0, 1.75), (2.3, 4.4, 2.3), PAINTED, .06, 1.)
    box('Roof cap', (0, 0, 2.93), (2.36, 4.46, .06), WHITE, .02, 1.)
    box('Window', (1.16, .3, 1.75), (.04, 2.4, 1.0), GLASS, 0, 1.)
    box('Counter', (1.32, .3, 1.24), (.34, 2.6, .05), STEEL, .005, 1.)
    mesh_object('Awning', [(1.16, -1.05, 2.4), (1.16, 1.65, 2.4), (2.0, 1.65, 2.15), (2.0, -1.05, 2.15)], [(0, 1, 2, 3)], FABRIC, .02)
    for y in (-1.05, 1.65): beam((1.16, y, 2.4), (2.0, y, 2.15), .015, STEEL)
    for y in (-1.3, 1.3):
        for s in (-1, 1): turned(beam((s * .95, y, .38), (s * 1.25, y, .38), .36, DARKMETAL, 14), 0, 0, 0)
    box('Tongue', (0, 2.7, .55), (.14, 1.1, .1), STEEL, 0, 1.); box('Jack', (0, 3.15, .27), (.1, .1, .55), STEEL, 0, 1.)
    box('Skirt', (0, 0, .6), (2.2, 4.3, .1), DARKMETAL, 0, 1.)
    for k in range(2): box('Step', (1.45 + .25 * k, -1.7, .4 - .18 * k), (.3, .7, .05), STEEL, 0, 1.)
    # Chalkboard A-frame by the counter, chalked lines and no fake menu.
    a_frame((2.6, 1.9), [], CHALK, PAINT, scribble=True)
    export('FoodBooth')

def canopy3():
    """A 3 m pop-up shade over a folding table. The fabric takes each instance's colour."""
    clear()
    popup(1.5, 2.05, .7, .22)
    folding_table((.3, 0), math.pi / 2)
    export('Canopy3')

def chair_piece():
    clear(); folding_chair((0, 0), 0.); export('FoldingChair')

def workshop_canopy():
    """A 6 m pop-up over a loose circle of six camp chairs, two of them out in the sun."""
    clear()
    popup(3., 2.4, 1.0, .28)
    for k in range(6):
        a = k * math.tau / 6 + .3 + rng.uniform(-.15, .15); r = 2.0 + (1.6 if k in (1, 4) else 0) + rng.uniform(-.2, .2)
        camp_chair((r * math.cos(a), r * math.sin(a)), a + math.pi + rng.uniform(-.3, .3), CHAIRS[k % 3])
    export('WorkshopCanopy')

def hq_kit():
    """Volunteer HQ under its canopy: two chairs, a whiteboard on an easel, water flats."""
    clear()
    folding_chair((-.5, -.6), .3); folding_chair((-.6, .5), -.4)
    c = Vector((-.9, -1.2, 0))
    for s in (-1, 1): beam(c + Vector((.25, s * .45, 0)), c + Vector((0, s * .4, 1.7)), .015, WARM)
    beam(c + Vector((-.35, 0, 0)), c + Vector((0, 0, 1.6)), .015, WARM)
    o = box('Whiteboard', c + Vector((.06, 0, 1.25)), (.03, .9, .65), WHITE, .005, 1.); o.rotation_euler = (0, -.15, .3)
    for k in range(3):
        box('Water flat', (.9, 1.0, .14 + .27 * k), (.4, .27, .27), WATER, .01, 1.)
        box('Flat wrap', (.9, 1.0, .275 + .27 * k), (.41, .28, .01), TOILETTOP, 0, 1.)
    box('Water flat', (.45, 1.05, .14), (.4, .27, .27), WATER, .01, 1.)
    box('Cooler', (.9, -1.0, .2), (.72, .42, .4), BLUE, .03, 1.); box('Cooler lid', (.9, -1.0, .43), (.74, .44, .06), TOILETTOP, .02, 1.)
    export('HqKit')

def first_aid_flag():
    """A pole beside the first-aid canopy with a white flag and a red cross on it."""
    clear()
    beam((0, 0, -.3), (0, 0, 3.4), .025, STEEL)
    sheet('Flag', lambda u, v: (.06 * math.sin(u * 5), .05 + .9 * u, 2.7 + .6 * v), 8, 2, WHITE, .01)
    box('Cross', (.0, .5, 3.0), (.04, .5, .14), RED, 0, 1.); box('Cross', (.0, .5, 3.0), (.04, .14, .46), RED, 0, 1.)
    folding_chair((-.8, -1.0), .2); folding_chair((-.9, .1), -.2)
    box('Kit box', (.4, -.3, .9), (.45, .3, .25), RED, .02, 1.)
    export('FirstAidKit')

def dip_station():
    """Fuel cans, steel dip bucket, spin-off barrel, extinguisher, rope line on four stanchions."""
    clear()
    for k, (x, y) in enumerate([(.55, -.45), (.55, -.05), (.15, -.5)]):
        box('Fuel can', (x, y, .93), (.3, .18, .38), RED if k != 1 else GALV, .02, 1.)
        beam((x, y - .05, 1.12), (x, y + .03, 1.18), .015, DARKMETAL)
    c = Vector((1.3, .9, 0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.2, depth=.42, location=c + Vector((0, 0, .21))); o = bpy.context.object
    o.data.materials.append(GALV); shade(o)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.3, depth=.88, location=(-1.0, 1.0, .44)); o = bpy.context.object
    o.data.materials.append(BLUE); shade(o)
    beam((-1.0, 1.0, .88), (-1.0, 1.0, .9), .31, DARKMETAL, 20)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=.08, depth=.5, location=(.9, -1.2, .25)); o = bpy.context.object
    o.data.materials.append(RED); shade(o)
    beam((.9, -1.2, .5), (.95, -1.15, .6), .02, DARKMETAL)
    # The rope line: four stanchions round the shade, open on the field side (+X).
    posts = [(2.3, -2.3), (-2.3, -2.3), (-2.3, 2.3), (2.3, 2.3)]
    for x, y in posts:
        beam((x, y, 0), (x, y, 1.0), .025, STEEL); beam((x, y, 0), (x, y, .03), .15, STEEL, 12)
    for a, b in zip(posts, posts[1:]):
        for k in range(6):
            t0, t1 = k / 6, (k + 1) / 6
            p = lambda t: (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, .95 - .18 * math.sin(math.pi * t))
            beam(p(t0), p(t1), .012, ROPE)
    export('DipStation')

def archway():
    """Two posts 3 m apart and 3.5 m tall with a curved top, wrapped in fabric and unlit string lights,
    a painted board over it. The way through faces +X."""
    clear()
    for y in (-1.5, 1.5):
        box('Post', (0, y, 1.6), (.16, .16, 3.4), WOOD, .01)
        # Fabric wound up each post in overlapping, slightly tilted bands.
        for k in range(15):
            z = .15 + k * .21; tilt = .12 * (1 if k % 2 else -1)
            beam((-.0, y - .02 * tilt, z - .12), (0, y + .02 * tilt, z + .12), .1, CHAIRS[k % 3] if k % 2 else PAINT, 12)
    arc = [(0, 1.5 * math.cos(math.pi * t / 12), 3.2 + .55 * math.sin(math.pi * t / 12)) for t in range(13)]
    for a, b in zip(arc, arc[1:]): plank(a, b, .16, .14, WOOD, (1, 0, 0))
    # Lights hang a little below the arch on a wire, bulbs every 25 cm.
    wire = [(.1, 1.45 * math.cos(math.pi * t / 24), 3.1 + .5 * math.sin(math.pi * t / 24) - .06 * math.sin(math.pi * t / 4) ** 2) for t in range(25)]
    for a, b in zip(wire, wire[1:]): beam(a, b, .004, BLACK)
    for p in wire[1:-1]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=.03, location=(p[0], p[1], p[2] - .04)); o = bpy.context.object
        o.data.materials.append(BULB); shade(o)
    for y in (-1.5, 1.5):
        for k in range(10):
            z = .5 + k * .28; a = k * 1.4
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=.028, location=(.11 * math.cos(a), y + .11 * math.sin(a), z)); o = bpy.context.object
            o.data.materials.append(BULB); shade(o)
    # Painted board: a dark ground with a simple flame and swirl, no words.
    box('Sign board', (.06, 0, 3.95), (.05, 1.9, .5), WARM, .01, .8)
    flame = [(0, -.12), (.09, .02), (.03, .0), (.07, .16), (0, .06), (-.06, .2), (-.03, .02), (-.1, .04)]
    for s in (-.6, 0, .6):
        mesh_object('Flame', [(.09, s + y * 1.3, 3.84 + z * 1.3) for y, z in flame], [tuple(range(len(flame)))], RED if s == 0 else PAINT, .004)
    for k in range(9):
        a = k * .7; r = .06 + k * .012
        box('Swirl', (.09, -.32 + r * math.cos(a), 3.95 + r * math.sin(a)), (.01, .04, .04), PAINT, 0, 1.)
        box('Swirl', (.09, .32 + r * math.cos(-a), 3.95 + r * math.sin(-a)), (.01, .04, .04), PAINT, 0, 1.)
    export('Archway')

def a_frame(at, lines, board, ink, arrow=False, scribble=False):
    """An A-frame sign: two boards hinged at the top, the same painting on both faces."""
    lean = .22
    for s in (1, -1):
        made = [box('Board', (0, 0, .55), (.03, .62, 1.05), board, .005, 1.), box('Frame', (-.005, 0, .55), (.02, .68, 1.1), WARM, 0)]
        for k, line in enumerate(lines):
            made.append(text(line, .16 if len(line) < 9 else .11, (.02, 0, .78 - k * .22), ink))
        if arrow:
            z = .5 - .22 * (len(lines) - 1)
            made.append(box('Arrow shaft', (.02, .04, z), (.012, .3, .05), ink, 0, 1.))
            made.append(mesh_object('Arrow head', [(.02, -.22, z), (.02, -.1, z + .09), (.02, -.1, z - .09)], [(0, 1, 2)], ink, .012))
        if scribble:
            for k in range(5):
                made.append(box('Chalk line', (.02, rng.uniform(-.06, .06), .85 - k * .14), (.006, rng.uniform(.25, .45), .025), PAINT, 0, .8))
        bpy.context.view_layer.update()
        M = (Matrix.Translation((at[0] + s * .2, at[1], .55)) @ Matrix.Rotation(-s * lean, 4, 'Y')
             @ (Matrix.Rotation(math.pi, 4, 'Z') if s < 0 else Matrix.Identity(4)) @ Matrix.Translation((0, 0, -.55)))
        for o in made: o.matrix_world = M @ o.matrix_world

def sandwich_board(name, lines, arrow=False):
    clear()
    a_frame((0, 0), lines, WHITE if name == 'CheckInBoard' else CHALK, RED if name == 'CheckInBoard' else PAINT, arrow)
    export(name)

def one_way_sign():
    """A hand-painted board on a stake at the junction: an arrow and ONE WAY, COUNTER-CLOCKWISE."""
    clear()
    box('Stake', (0, 0, .75), (.08, .08, 1.9), WOOD, .005)
    box('Board', (.06, 0, 1.45), (.04, 1.3, .62), WHITE, .01, .92)
    text('ONE WAY', .2, (.085, 0, 1.6), RED)
    text('COUNTER-CLOCKWISE', .085, (.085, 0, 1.4), BLACK)
    box('Arrow shaft', (.085, .05, 1.25), (.01, .7, .06), BLACK, 0, 1.)
    mesh_object('Arrow head', [(.085, -.45, 1.25), (.085, -.27, 1.36), (.085, -.27, 1.14)], [(0, 1, 2)], BLACK, .01)
    export('OneWaySign')

def cone():
    clear()
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=.15, radius2=.025, depth=.7, location=(0, 0, .37)); o = bpy.context.object
    o.data.materials.append(CONE); shade(o)
    box('Cone base', (0, 0, .02), (.36, .36, .04), CONE, .01, .8)
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=.105, depth=.1, location=(0, 0, .45)); o = bpy.context.object
    o.data.materials.append(WHITE); shade(o)
    export('Cone')

def workshop_board(label):
    clear()
    box('Stake', (0, 0, .55), (.06, .06, 1.4), WOOD, .005)
    o = box('Board', (.04, 0, 1.05), (.03, .5, .36), WARM, .01, .85); o.rotation_euler = (.04 * (hash(label) % 3 - 1), 0, 0)
    text(label, .22, (.06, 0, 1.04), PAINT)
    export('WorkshopBoard' + label)

def toilet_row():
    """Four portable toilets in a row along Y, doors facing +X: blue-grey shells, white roofs."""
    clear()
    for k in range(4):
        y = (k - 1.5) * 1.28
        box('Shell', (0, y, 1.1), (1.2, 1.2, 2.2), TOILET, .03, 1.)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=.72, location=(0, y, 2.15)); o = bpy.context.object
        o.scale = (1, 1, .25); o.data.materials.append(TOILETTOP); shade(o)
        box('Door', (.61, y, 1.05), (.03, .82, 1.95), TOILET, .01, .85)
        box('Latch', (.635, y - .3, 1.1), (.02, .1, .05), RED if k % 2 else LIME, 0, 1.)
        box('Vent', (-.4, y + .4, 2.2), (.08, .08, .5), DARKMETAL, 0, 1.)
        box('Skid', (0, y, .04), (1.3, 1.3, .08), DARKMETAL, 0, 1.)
    export('ToiletRow')

def shower_trailer():
    """A 6 m shower trailer with three doors on +X, a water tank on the back end."""
    clear()
    box('Body', (0, 0, 1.75), (2.4, 6.0, 2.3), TOILETTOP, .05, 1.)
    box('Roof', (0, 0, 2.93), (2.46, 6.06, .06), STEEL, .02, 1.)
    for k in range(3):
        y = -1.8 + k * 1.8
        box('Door', (1.21, y, 1.7), (.03, .8, 1.9), TOILET, .01, 1.)
        for j in range(2): box('Step', (1.4 + .2 * j, y, .45 - .17 * j), (.25, .7, .05), STEEL, 0, 1.)
    box('Skirt', (0, 0, .55), (2.3, 5.9, .1), DARKMETAL, 0, 1.)
    for s in (-1, 1): beam((s * 1.0, .2, .38), (s * 1.3, .2, .38), .36, DARKMETAL, 14)
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=.55, depth=1.6, location=(0, -3.9, .8)); o = bpy.context.object
    o.data.materials.append(TOILETTOP); shade(o)
    beam((0, -3.3, .8), (0, -3.0, 1.0), .03, DARKMETAL)
    export('ShowerTrailer')

# ---- The lower campground -------------------------------------------------------------

def building(depth, width, wall, ridge, roof, walls=PALE, overhang=.5, below=-1.6, floor=.3, along='Y'):
    """A closed one-storey building: plinth, walls, a pitched metal roof overhanging every wall."""
    foundation(depth + .2, width + .2, below, floor, CONCRETE)
    box('Walls', (0, 0, floor + wall / 2), (depth, width, wall), walls, .02, .95)
    top = floor + wall
    gable(width if along == 'Y' else depth, depth if along == 'Y' else width, top, floor + ridge, overhang, roof, .05, along)
    gable_ends(width if along == 'Y' else depth, depth if along == 'Y' else width, top - .02, floor + ridge - .05, walls, along)
    return top

def main_building():
    """The year-round building: 10 deep (X) by 12 (Y), grey pitched roof, door and two windows on +X."""
    clear()
    building(10, 12, 2.8, 4.6, ROOFGREY, PALE)
    box('Door', (5.02, -.8, 1.35), (.06, 1.0, 2.1), WARM, .01, .7)
    box('Door frame', (5.01, -.8, 1.4), (.04, 1.2, 2.25), WHITE, 0, 1.)
    for y in (-3.8, 2.6):
        box('Window', (5.02, y, 1.75), (.05, 1.4, 1.1), GLASS, 0, 1.)
        box('Window frame', (5.01, y, 1.75), (.04, 1.56, 1.26), WHITE, 0, 1.)
    for y in (-3.5, 3.5): box('Back window', (-5.02, y, 1.75), (.05, 1.2, 1.0), GLASS, 0, 1.)
    box('Porch step', (5.5, -.8, .2), (1.0, 1.8, .4), CONCRETE, .02, .9)
    box('Porch step', (5.9, -.8, .05), (.6, 1.8, .3), CONCRETE, .02, .9)
    box('Gutter', (5.55, 0, 3.0), (.1, 13, .1), ROOFGREY, 0, 1.)
    box('Gutter', (-5.55, 0, 3.0), (.1, 13, .1), ROOFGREY, 0, 1.)
    box('Downpipe', (5.55, 6.4, 1.6), (.08, .08, 2.8), ROOFGREY, 0, 1.)
    export('MainBuilding')

def checkin_kit():
    """The check-in table's load: cash box, a bright pile of wristbands, clipboard, two chairs, a cooler."""
    clear()
    box('Cash box', (.25, -.55, .82), (.25, .3, .12), DARKMETAL, .01, 1.)
    for k in range(18):
        a = rng.random() * math.tau; r = rng.random() * .12
        o = box('Wristband', (.2 + r * math.cos(a), .25 + r * math.sin(a), .77 + .008 * (k % 4)), (.2, .025, .006), BRIGHT if k % 3 else LIME, 0, 1.)
        o.rotation_euler = (0, 0, rng.random() * math.pi)
    box('Clipboard', (.35, .7, .76), (.23, .32, .012), WARM, 0, 1.); box('Paper', (.35, .7, .768), (.21, .27, .004), WHITE, 0, 1.)
    folding_chair((-.4, -.45), 0.); folding_chair((-.45, .55), .25)
    box('Cooler', (-1.05, -1.0, .2), (.72, .42, .4), RED, .03, 1.); box('Cooler lid', (-1.05, -1.0, .43), (.74, .44, .06), TOILETTOP, .02, 1.)
    export('CheckInKit')

# ---- Vendor Village, the barn and the abandoned stage --------------------------------

def gambrel(length, depth, eave, knee, ridge, overhang, m):
    """A barn roof: steep lower slopes to a knee, shallow upper slopes to the ridge, along Y."""
    hd = depth / 2; hl = length / 2 + overhang
    profile = [(-hd - overhang * .6, eave - overhang * .9), (-hd * .55, knee), (0, ridge), (hd * .55, knee), (hd + overhang * .6, eave - overhang * .9)]
    for (x0, z0), (x1, z1) in zip(profile, profile[1:]):
        mesh_object('Roof', [(x0, -hl, z0), (x1, -hl, z1), (x1, hl, z1), (x0, hl, z0)], [(0, 1, 2, 3)], m, .05)
    return profile

def barn():
    """A gambrel pole barn 12 deep (X) by 18 (Y), 7 m to the ridge, weathered grey boards,
    galvanised roof, a wide sliding door open on +X. Rain shelter: hay bales and folding tables."""
    clear()
    d, l, eave = 12., 18., 4.0
    foundation(d + .2, l + .2, -2.0, .12, CONCRETE)
    box('Floor', (0, 0, .1), (d - .3, l - .3, .06), CONCRETE, 0, .75)
    door_lo, door_hi = -3.0, 3.0
    # Vertical boards on all four walls; the +X wall leaves the door opening.
    for side in (-1, 1):
        for i in range(int(l / .3)):
            y = -l / 2 + .15 + i * .3
            if side == 1 and door_lo < y < door_hi: continue
            box('Board', (side * d / 2, y, .1 + eave / 2), (.06, .29, eave), WOOD, 0)
        box('Wall back', (side * (d / 2 - .06), 0, .1 + eave / 2), (.04, l, eave), WOOD, 0, .45)
    for side in (-1, 1):
        for i in range(int(d / .3)):
            x = -d / 2 + .15 + i * .3
            box('Board', (x, side * l / 2, .1 + eave / 2), (.29, .06, eave), WOOD, 0)
        box('Wall back', (0, side * (l / 2 - .06), .1 + eave / 2), (d, .04, eave), WOOD, 0, .45)
    # The door header and the slid-open door on its track.
    box('Header', (d / 2, 0, eave - .3), (.08, door_hi - door_lo, .6), WOOD, 0, .8)
    box('Track', (d / 2 + .1, door_lo - 1.5, eave - .55), (.06, 9, .08), DARKMETAL, 0, 1.)
    for i in range(10): box('Door board', (d / 2 + .14, door_hi + .15 + i * .3, .1 + (eave - .6) / 2), (.05, .29, eave - .6), WOOD, 0)
    for z in (1.0, 2.6): box('Door brace', (d / 2 + .18, door_hi + 1.5, z), (.04, 3.0, .14), WOOD, 0, .7)
    # Gambrel gables: boards up the triangle-ish ends.
    prof = gambrel(l, d, eave + .1, 5.6, 7.0, .5, GALV)
    for side in (-1, 1):
        pts = [(-d / 2, side * l / 2, eave + .1), (-d / 2 * .55, side * l / 2, 5.6), (0, side * l / 2, 7.0), (d / 2 * .55, side * l / 2, 5.6), (d / 2, side * l / 2, eave + .1)]
        mesh_object('Gable', pts, [tuple(range(5))], WOOD, .14, tone=.8)
        box('Hay door', (0, side * (l / 2 + .08), 5.0), (1.2, .04, 1.1), WOOD, 0, .55)
    for y in (-6, -2, 2, 6):
        for x in (-5.8, 5.8): box('Pole', (x, y, .1 + eave / 2), (.2, .2, eave), WOOD, 0, .6)
    for k, (x, y, z) in enumerate([(-4.5, -7.5, 0), (-3.4, -7.5, 0), (-4.0, -7.5, 1), (-4.5, -6.3, 0), (4.6, 7.6, 0), (4.6, 6.4, 0)]):
        o = box('Hay bale', (x, y, .36 + z * .46), (1.05, .46, .46), HAY, .04); o.rotation_euler = (0, 0, rng.uniform(-.08, .08))
    folding_table((-2.0, 3.5), 0.); folding_table((-2.0, 5.6), .05); folding_table((1.5, -5.0), math.pi / 2)
    export('Barn')

def abandoned_stage():
    """The old stage: an 8 x 5 deck at 0.6 m, moss-dark boards with gaps, a leaning frame, half its roof."""
    clear()
    box('Skirt', (0, 0, .05), (4.9, 7.9, 1.1), MOSS, .02, .6)
    for i in range(16):
        if i in (3, 11): continue
        y = -3.75 + i * .5
        o = box('Deck board', (0, y, .63), (5.02, .46, .05), MOSS, .006); o.rotation_euler = (rng.uniform(-.015, .015), 0, rng.uniform(-.006, .006))
    o = box('Loose board', (2.9, 1.2, .1), (2.4, .46, .05), MOSS, .006); o.rotation_euler = (.2, -.15, .6)
    lean = .07
    for x in (-2.35, 2.35):
        for y in (-3.85, 3.85):
            o = box('Post', (x + lean * 1.4, y, 2.0), (.15, .15, 3.0), MOSS, .01); o.rotation_euler = (0, lean, 0)
    for x in (-2.35, 2.35): box('Beam', (x + lean * 2.8, 0, 3.45), (.18, 8.1, .26), MOSS, .01).rotation_euler = (.03, 0, 0)
    for k in range(6):
        y = -3.6 + k * 1.44
        if k in (2, 3, 5): continue
        o = box('Rafter', (lean * 2.8, y, 3.75), (5.6, .1, .14), MOSS, 0); o.rotation_euler = (0, .1, 0)
    for k in range(8):
        if k in (1, 4, 5, 6): continue
        y = -3.6 + k * 1.0
        o = box('Roof sheet', (lean * 2.8, y, 3.9), (5.4, .98, .03), GALV, 0, .45); o.rotation_euler = (rng.uniform(-.04, .04), .1, 0)
    o = box('Hanging sheet', (2.9, 1.9, 2.6), (2.4, .98, .03), GALV, 0, .4); o.rotation_euler = (0, 1.2, .1)
    export('AbandonedStage')

def art_panel():
    """A 1 x 1.5 m fabric panel with a pole at the top; Unreal paints the colours and motif."""
    clear()
    mesh = bpy.data.meshes.new('Panel'); verts = []; faces = []
    nu, nv = 4, 6
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            verts.append((.04 * math.sin(u * 3 + v * 2), -.5 + u, -1.5 * v - .04))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    mesh.from_pydata(verts, [], faces); mesh.update()
    uv = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        x, y, z = verts[loop.vertex_index]; uv.data[loop.index].uv = (y + .5, 1 + z / 1.5)
    o = bpy.data.objects.new('Panel', mesh); bpy.context.collection.objects.link(o); o.data.materials.append(PANEL); shade(o)
    beam((0, -.55, 0), (0, .55, 0), .012, WARM)
    for y in (-.5, .5): beam((0, y, 0), (0, y, .25), .003, ROPE)
    export('ArtPanel')

def ring_streamers():
    """A wooden hoop hanging flat-ish with six fabric streamers below it."""
    clear()
    bpy.ops.mesh.primitive_torus_add(major_radius=.35, minor_radius=.015, major_segments=24, minor_segments=6, location=(0, 0, -.3))
    o = bpy.context.object; o.rotation_euler = (math.pi / 2, 0, 0); o.data.materials.append(WARM); shade(o)
    beam((0, 0, 0), (0, 0, -.3 + .35), .003, ROPE)
    for k in range(6):
        a = k * math.tau / 6
        top = Vector((0, .35 * math.cos(a), -.3 + .35 * math.sin(a)))
        if top.z > -.3: top = Vector((0, .35 * math.cos(a), -.3 - .35 * abs(math.sin(a))))
        length = rng.uniform(.8, 1.4)
        sheet('Streamer', lambda u, v, top=top, length=length: (top.x + .05 * math.sin(v * 6 + u), top.y + (u - .5) * .07, top.z - length * v), 1, 6, FABRIC, .004)
    export('RingStreamers')

def paper_lantern():
    clear()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=.16, location=(0, 0, -.2)); o = bpy.context.object
    o.scale = (1, 1, .85); o.data.materials.append(FABRIC); shade(o)
    for z in (-.07, -.33): beam((0, 0, z - .015), (0, 0, z + .015), .07, DARKMETAL, 10)
    beam((0, 0, 0), (0, 0, -.06), .003, BLACK)
    export('PaperLantern')

def vendor_rack():
    """A vendor's clothing rack of hanging fabric under the booth canopy."""
    clear()
    for y in (-.7, .7):
        beam((-.3, y, 0), (0, y, 1.6), .015, STEEL); beam((.3, y, 0), (0, y, 1.6), .015, STEEL)
    beam((0, -.75, 1.6), (0, .75, 1.6), .015, STEEL)
    for k in range(9):
        y = -.6 + k * .15
        m = CHAIRS[k % 3] if k % 2 else [BRIGHT, LIME, PANEL, WHITE][k % 4]
        sheet('Garment', lambda u, v, y=y: (-.25 + .5 * u, y + .02 * math.sin(u * 4), 1.58 - (.8 + .25 * (k % 3)) * v), 3, 4, m, .01)
    for k in range(2):
        box('Tapestry', (-.95, -.4 + .8 * k, .9), (.02, .7, 1.2), PANEL if k else CHAIRS[1], 0, 1.)
    folding_chair((.9, -.9), 2.3)
    export('VendorRack')

def vendor_hoops():
    """A vendor's display: hoops leaning on a frame, poi hanging from its top bar, a chair."""
    clear()
    for y in (-.8, .8): beam((0, y, 0), (0, y, 1.7), .02, WARM)
    beam((0, -.85, 1.65), (0, .85, 1.65), .02, WARM)
    for k in range(5):
        bpy.ops.mesh.primitive_torus_add(major_radius=.45 + .03 * k, minor_radius=.012, major_segments=28, minor_segments=5, location=(.18 + .05 * k, -.4 + .2 * k, .5))
        o = bpy.context.object; o.rotation_euler = (math.pi / 2, -.2, math.pi / 2); o.data.materials.append([BRIGHT, LIME, CHAIRS[1], WHITE, CHAIRS[2]][k]); shade(o)
    for k in range(6):
        y = -.7 + k * .28
        beam((0, y, 1.64), (0, y, 1.1), .003, BLACK)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=.05, location=(0, y, 1.06)); o = bpy.context.object
        o.data.materials.append([BRIGHT, LIME, CHAIRS[0]][k % 3]); shade(o)
    folding_chair((-.9, .9), -.6)
    export('VendorHoops')

# ---- The upper section ------------------------------------------------------------------

def porch(depth, width, x0, roof, floor=.4, post=WOOD):
    """A covered porch along the +X wall: deck, posts and a lean-to roof."""
    box('Porch deck', (x0 + depth / 2, 0, floor - .2), (depth, width, .5), WOOD, .01, .8)
    for y in [(-width / 2 + .2) + k * (width - .4) / max(1, round(width / 3)) for k in range(round(width / 3) + 1)]:
        box('Porch post', (x0 + depth - .2, y, floor + 1.25), (.14, .14, 2.5), post, .01)
    mesh_object('Porch roof', [(x0 - .1, -width / 2 - .3, floor + 3.0), (x0 - .1, width / 2 + .3, floor + 3.0),
                               (x0 + depth + .4, width / 2 + .3, floor + 2.45), (x0 + depth + .4, -width / 2 - .3, floor + 2.45)], [(0, 1, 2, 3)], roof, .05)

def windows(depth, width, z, glass_w=1.2, glass_h=1.0, every=3.5, sides=(1, -1)):
    for s in sides:
        n = max(1, int(width / every))
        for k in range(n):
            y = -width / 2 + width * (k + .5) / n
            box('Window', (s * (depth / 2 + .02), y, z), (.05, glass_w, glass_h), GLASS, 0, 1.)
            box('Window frame', (s * (depth / 2 + .01), y, z), (.04, glass_w + .14, glass_h + .14), WHITE, 0, 1.)

def pink_cabin():
    """W6, the pink workshop cabin: 11 deep (X) by 14 (Y), rose roof, pale walls, porch on +X."""
    clear()
    building(9, 14, 3.0, 5.0, ROOFPINK, PALE, .6, -1.8, .4)
    windows(9, 14, 2.0)
    box('Door', (4.52, 0, 1.5), (.06, 1.1, 2.1), WARM, .01, .7)
    porch(2.0, 10, 4.5, ROOFPINK)
    export('PinkCabin')

def grey_building():
    """The building west of the cabin that Austen has never been inside: closed, dark grey roof."""
    clear()
    building(11, 15, 3.2, 5.4, ROOFDARK, mat('WallTan', (.45, .42, .36)), .5, -1.8, .3)
    windows(11, 15, 2.1, 1.0, .9, 5.)
    box('Door', (5.52, 3.0, 1.35), (.06, 1.0, 2.1), DARKMETAL, .01, 1.)
    export('GreyBuilding')

def lodge():
    """A long low lodge, 7 deep (X) by 22 (Y), shared porch on +X built separately."""
    clear()
    building(7, 22, 2.7, 4.2, ROOFGREEN, mat('WallBrown', (.32, .22, .14)), .5, -1.6, .35)
    windows(7, 22, 1.8, 1.0, .9, 3.)
    for y in (-7, 0, 7): box('Door', (3.52, y + 1.2, 1.4), (.06, .9, 2.0), WARM, .01, .6)
    export('Lodge')

def lodge_porch():
    clear()
    porch(3.0, 22, 0, ROOFGREEN)
    for k in range(5): folding_chair((1.2 + .4 * (k % 2), -8 + k * 4), math.pi * .5 + .4 * (k - 2))
    export('LodgePorch')

def main_cabin():
    """The main cabin: a large log-sided lodge with a green metal roof. Not part of the festival."""
    clear()
    foundation(14.2, 24.2, -5.0, .6, mat('Stone', (.33, .31, .28)))
    for k in range(13):
        z = .8 + k * .26
        for s in (-1, 1):
            beam((s * 7, -12.1, z), (s * 7, 12.1, z), .14, LOG, 10, rng.uniform(.75, 1.))
            beam((-7.1, s * 12, z), (7.1, s * 12, z), .14, LOG, 10, rng.uniform(.75, 1.))
    box('Walls', (0, 0, .6 + 1.75), (13.8, 23.8, 3.5), LOG, 0, .6)
    gable(24, 14, 4.0, 6.6, .9, ROOFGREEN, .06)
    gable_ends(24, 14, 3.95, 6.55, LOG)
    windows(14, 24, 2.4, 1.4, 1.2, 4.)
    porch(3.0, 16, 7, ROOFGREEN, .8)
    box('Chimney', (-3, 6, 5.5), (1.0, 1.0, 4.0), mat('Stone', (.33, .31, .28)), .02)
    export('MainCabin')

showcase_stage(); juggling_tent(); food_pavilion(); food_booth(); canopy3(); chair_piece(); workshop_canopy()
hq_kit(); first_aid_flag(); dip_station(); archway(); sandwich_board('CheckInBoard', ['CHECK IN']); sandwich_board('WalkInBoard', ['WALK IN'], True)
one_way_sign(); cone()
for k in range(1, 8): workshop_board('W%d' % k)
toilet_row(); shower_trailer(); main_building(); checkin_kit()
barn(); abandoned_stage(); art_panel(); ring_streamers(); paper_lantern(); vendor_rack(); vendor_hoops()
pink_cabin(); grey_building(); lodge(); lodge_porch(); main_cabin()
