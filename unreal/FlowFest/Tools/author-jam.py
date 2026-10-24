"""Run in background Blender 5.0. Author the Flow Fest jam prop kit, fully procedural.

    blender --factory-startup --background --threads 2 --python unreal/FlowFest/Tools/author-jam.py [-- only=CampChair,Cooler]

Nothing here is downloaded or generated: every piece is built from tubes, lathes, lofts and cloth
sheets in plain Python, so the same script always writes the same files. Per asset it writes

  Tools/staged/jam/SM_Jam_<Name>.fbx     one mesh, metres -> cm like author-structures.py (Unreal)
  static/models/flow-fest-sim/jam/<kebab>.glb   small flat-colour browser copy (Y up, +X front)
  Saved/Polish/Jam/assets/<kebab>.png    preview render

Axes while modelling: X is the front of the object, Y its left, Z up, origin on the ground at the
middle of the footprint (the club, the bulb and the towels say otherwise in their own notes).
Material names are the Unreal material names (`M_Jam_*`); the importer builds those graphs.
"""
import bpy, bmesh, math, json, sys, struct
from math import pi, tau, sin, cos, radians, sqrt
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
STAGED = HERE / 'staged' / 'jam'
GLB_DIR = REPO / 'static' / 'models' / 'flow-fest-sim' / 'jam'
PREVIEW = HERE.parent / 'Saved' / 'Polish' / 'Jam' / 'assets'
for _d in (STAGED, GLB_DIR, PREVIEW): _d.mkdir(parents=True, exist_ok=True)

ONLY = None
if '--' in sys.argv:
    for _a in sys.argv[sys.argv.index('--') + 1:]:
        if _a.startswith('only='): ONLY = set(_a[5:].split(','))

# ---- materials ---------------------------------------------------------------------------

# name: (base colour, metallic, roughness). Unreal swaps these for its own graphs by name.
MATDEF = {
    'Steel': ((.34, .35, .38), .9, .38), 'Aluminium': ((.66, .67, .70), .9, .3),
    'Fabric': ((.10, .24, .42), 0, .85), 'MeshBlack': ((.018, .018, .02), 0, .8),
    'Rubber': ((.03, .03, .033), 0, .7), 'Plastic': ((.10, .34, .62), 0, .45),
    'PlasticWhite': ((.78, .78, .75), 0, .4), 'Wood': ((.33, .21, .11), 0, .75),
    'Rope': ((.58, .47, .30), 0, .9), 'Nylon': ((.05, .46, .50), 0, .35),
    'Blanket': ((.62, .17, .11), 0, .95), 'Duvetyne': ((.014, .014, .016), 0, .95),
    'CanRed': ((.62, .04, .03), .35, .4), 'Wick': ((.60, .55, .40), 0, .95),
}
# name: (base colour, emission colour, emission strength)
GLOWDEF = {
    'LanternGlow': ((.9, .75, .5), (1.0, .56, .2), 1.5), 'ScreenGlow': ((.4, .6, .9), (.3, .55, 1.0), 1.2),
    'BulbGlow': ((.95, .75, .45), (1.0, .55, .16), 1.8), 'ClubStrip': ((.46, .48, .52), (.85, .96, 1.0), 4.0),
}
MATS = {}

def mat(name):
    """The Blender stand-in for `M_Jam_<name>`; flat colours only, nothing textured."""
    full = 'M_Jam_' + name
    if full in MATS: return MATS[full]
    m = bpy.data.materials.new(full)
    try: m.use_nodes = True
    except Exception: pass
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    def put(label, value):
        if bsdf is not None and label in bsdf.inputs: bsdf.inputs[label].default_value = value
    if name in MATDEF:
        col, metal, rough = MATDEF[name]; m.diffuse_color = (*col, 1)
        put('Base Color', (*col, 1)); put('Metallic', metal); put('Roughness', rough)
    elif name == 'ClubGlow':
        col, emit, strength = (.66, .76, .84), (.10, .50, 1.0), 1.0; m.diffuse_color = (*col, 1)
        put('Base Color', (*col, 1)); put('Roughness', .25); put('Alpha', .36)
        put('Emission Color', (*emit, 1)); put('Emission Strength', strength)
        for attr, val in (('surface_render_method', 'BLENDED'), ('blend_method', 'BLEND')):
            try: setattr(m, attr, val)
            except Exception: pass
    else:
        col, emit, strength = GLOWDEF[name]; m.diffuse_color = (*col, 1)
        put('Base Color', (*col, 1)); put('Roughness', .4)
        put('Emission Color', (*emit, 1)); put('Emission Strength', strength)
    MATS[full] = m
    return m

# ---- geometry accumulator ----------------------------------------------------------------

class Geo:
    """All parts of one asset, in world metres. Parts keep their own vertices, so smoothing is
    decided later by edge angle: tubes read round, caps and boxes keep their hard edges."""
    def __init__(s):
        s.v, s.f, s.m, s.fix, s.vuv, s.mats = [], [], [], [], [], []

    def add(s, verts, faces, m, fix=True, vuv=None, xf=None):
        name = m if isinstance(m, str) else m.name
        if name not in s.mats: s.mats.append(name)
        mi = s.mats.index(name); base = len(s.v)
        s.v += [(xf @ Vector(v)) if xf is not None else Vector(v) for v in verts]
        s.vuv += list(vuv) if vuv else [None] * len(verts)
        for f in faces:
            s.f.append(tuple(base + i for i in f)); s.m.append(mi); s.fix.append(fix)

G = Geo()
def begin():
    global G
    G = Geo()

def M(name): return 'M_Jam_' + name  # material slot name; mat() makes the Blender datablock on bake

def add_bm(bm, m, xf=None, fix=True):
    bm.verts.ensure_lookup_table()
    G.add([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces], M(m) if not m.startswith('M_') else m, fix, xf=xf)
    bm.free()

def box(c, size, m, bevel=0., seg=1, rot=None, fix=True):
    """Box centred on c; rot is a 3x3 Matrix, Euler tuple or None. Optional bevel for worn edges."""
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.)
    for v in bm.verts: v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    if bevel: bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type='OFFSET', segments=seg, profile=.5, affect='EDGES')
    if rot is None: R = Matrix.Identity(3)
    elif isinstance(rot, Matrix): R = rot.to_3x3()
    else: R = Matrix.Rotation(rot[2], 3, 'Z') @ Matrix.Rotation(rot[1], 3, 'Y') @ Matrix.Rotation(rot[0], 3, 'X')
    add_bm(bm, m, Matrix.Translation(Vector(c)) @ R.to_4x4(), fix)

def basis(x_axis, z_axis):
    """A 3x3 whose columns are the local X and Z axes, Y completing a right-handed frame."""
    x = Vector(x_axis).normalized(); z = Vector(z_axis); z = (z - x * z.dot(x)).normalized(); y = z.cross(x)
    return Matrix((x, y, z)).transposed()

def spline(pts, n=4, closed=False):
    """Catmull-Rom through pts, n samples per span."""
    P = [Vector(p) for p in pts]; N = len(P); out = []
    for i in range(N if closed else N - 1):
        p1, p2 = P[i], P[(i + 1) % N]
        p0 = P[(i - 1) % N] if (closed or i > 0) else p1 * 2 - p2
        p3 = P[(i + 2) % N] if (closed or i + 2 < N) else p2 * 2 - p1
        for k in range(n):
            t = k / n
            out.append((p1 * 2 + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t * t + (p1 * 3 - p0 - p2 * 3 + p3) * t ** 3) * .5)
    if not closed: out.append(P[-1].copy())
    return out

def fillet(pts, rad, seg=3, closed=False):
    """Round the corners of a polyline with quadratic arcs of at most `rad` setback."""
    P = [Vector(p) for p in pts]; N = len(P); out = []
    rng = range(N) if closed else range(1, N - 1)
    if not closed: out.append(P[0])
    for i in rng:
        a, b, c = P[(i - 1) % N], P[i], P[(i + 1) % N]
        d1, d2 = a - b, c - b; t = min(rad, d1.length * .45, d2.length * .45)
        p1, p2 = b + d1.normalized() * t, b + d2.normalized() * t
        for k in range(seg + 1):
            s = k / seg; out.append(p1 * (1 - s) ** 2 + b * (2 * s * (1 - s)) + p2 * s * s)
    if not closed: out.append(P[-1])
    return out

def sweep(path, rad, m, sides=8, closed=False, caps=True, up=(0, 0, 1), flat=1., start=0., fix=True):
    """A tube of radius rad (number or per-point list) along path, parallel-transport frames."""
    P = [Vector(p) for p in path]; n = len(P)
    R = list(rad) if isinstance(rad, (list, tuple)) else [rad] * n
    T = []
    for i in range(n):
        t = P[(i + 1) % n] - P[(i - 1) % n] if closed else P[min(i + 1, n - 1)] - P[max(i - 1, 0)]
        T.append(t.normalized())
    up = Vector(up); N0 = up - T[0] * up.dot(T[0])
    if N0.length < 1e-4: N0 = Vector((1, 0, 0)) - T[0] * T[0].x
    Ns = [N0.normalized()]
    for i in range(1, n):
        q = T[i - 1].rotation_difference(T[i]); nn = q @ Ns[-1]
        Ns.append((nn - T[i] * nn.dot(T[i])).normalized())
    verts, rings = [], []
    for i in range(n):
        B = T[i].cross(Ns[i]); ring = []
        for j in range(sides):
            th = start + tau * j / sides
            ring.append(len(verts)); verts.append(P[i] + Ns[i] * (R[i] * cos(th)) + B * (R[i] * sin(th) * flat))
        rings.append(ring)
    faces = []
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(sides):
            j2 = (j + 1) % sides; faces.append((a[j], a[j2], b[j2], b[j]))
    if caps and not closed:
        faces.append(tuple(reversed(rings[0]))); faces.append(tuple(rings[-1]))
    G.add(verts, faces, M(m), fix)

def tube(a, b, r, m, sides=8, caps=True):
    sweep([a, b], r if isinstance(r, (list, tuple)) else [r, r], m, sides, caps=caps, up=(0, 0, 1) if abs(Vector(b).z - Vector(a).z) < 0.999 * (Vector(b) - Vector(a)).length else (1, 0, 0))

def lathe(prof, sides, m, xf=None, start=0., fix=True):
    """Revolve a (radius, axial) profile about local Z. Trace it counter-clockwise (r right, z up),
    starting on the axis at the bottom, and the faces point outward. Repeat the first point at the
    end for a ring that closes on itself."""
    verts, rings = [], []
    for pi_, (r, z) in enumerate(prof):
        if pi_ == len(prof) - 1 and pi_ > 0 and prof[-1] == prof[0]: rings.append(rings[0]); continue
        if r <= 1e-9: rings.append(('p', len(verts))); verts.append(Vector((0, 0, z)))
        else:
            idx = []
            for j in range(sides):
                th = start + tau * j / sides; idx.append(len(verts)); verts.append(Vector((r * cos(th), r * sin(th), z)))
            rings.append(('r', idx))
    faces = []
    for k in range(len(prof) - 1):
        A, B = rings[k], rings[k + 1]
        if A[0] == 'p' and B[0] == 'p': continue
        if A[0] == 'r' and B[0] == 'r' and prof[k] == prof[k + 1]: continue
        for j in range(sides):
            j2 = (j + 1) % sides
            if A[0] == 'p': faces.append((A[1], B[1][j2], B[1][j]))
            elif B[0] == 'p': faces.append((A[1][j], A[1][j2], B[1]))
            else: faces.append((A[1][j], A[1][j2], B[1][j2], B[1][j]))
    G.add(verts, faces, M(m), fix, xf=xf)

def axis_xf(origin, axis):
    """Matrix carrying a lathe's local Z onto `axis`, local origin onto `origin`."""
    return Matrix.Translation(Vector(origin)) @ Vector(axis).to_track_quat('Z', 'Y').to_matrix().to_4x4()

def ball(c, r, m, sides=12, rings=6, sq=(1, 1, 1)):
    prof = [(r * sin(pi * k / rings), -r * cos(pi * k / rings)) for k in range(rings + 1)]
    prof[0] = (0, prof[0][1]); prof[-1] = (0, prof[-1][1])
    lathe(prof, sides, m, Matrix.Translation(Vector(c)) @ Matrix.Diagonal((sq[0], sq[1], sq[2], 1)))

def capsule(c, axis, length, r, m, sides=14, cap_rings=3, squash=1., pinch=0., pinches=()):
    """Inflated tube: a cylinder with domed ends, optionally pinched at welded seams."""
    Lc = max(length - 2 * r, 0.); h = Lc / 2; prof = [(0, -h - r)]
    for i in range(1, cap_rings + 1):
        a = radians(90 - 90 * i / cap_rings); prof.append((r * cos(a), -h - r * sin(a)))
    for p in pinches:  # seam positions along the straight run, -1..1
        z = p * h; prof += [(r, z - r * .22), (r * (1 - pinch), z), (r, z + r * .22)]
    for i in range(cap_rings - 1, -1, -1):
        a = radians(90 - 90 * i / cap_rings); prof.append((r * cos(a), h + r * sin(a)))
    prof[-1] = (0, prof[-1][1])
    ax = Vector(axis)
    lathe(prof, sides, m, axis_xf(c, ax) @ Matrix.Diagonal((1, squash, 1, 1)))

def rrect(hx, hy, r, cseg=3, ne=1, cx=0., cy=0.):
    """Counter-clockwise rounded-rectangle outline as 2D tuples."""
    pts = []; corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    arcs = []
    for k, (sx, sy) in enumerate(corners):
        arcs.append([(cx + sx * (hx - r) + r * cos(radians(k * 90 + 90 * s / cseg)), cy + sy * (hy - r) + r * sin(radians(k * 90 + 90 * s / cseg))) for s in range(cseg + 1)])
    for k in range(4):
        pts += arcs[k]; a, b = arcs[k][-1], arcs[(k + 1) % 4][0]
        for e in range(1, ne + 1): pts.append((a[0] + (b[0] - a[0]) * e / (ne + 1), a[1] + (b[1] - a[1]) * e / (ne + 1)))
    return pts

def loft(rings, m, cap0=True, cap1=True, closed=True, fix=True):
    """Skin between equal-length rings of Vectors."""
    n = len(rings[0]); verts, idx = [], []
    for ring in rings: idx.append(list(range(len(verts), len(verts) + n))); verts += [Vector(p) for p in ring]
    faces = []
    for i in range(len(rings) - 1):
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n; faces.append((idx[i][j], idx[i][j2], idx[i + 1][j2], idx[i + 1][j]))
    if cap0: faces.append(tuple(reversed(idx[0])))
    if cap1: faces.append(tuple(idx[-1]))
    G.add(verts, faces, M(m), fix)

def cloth(P, nu, nv, thick, m, closed_u=False, uv=None):
    """A closed cloth slab: surface P(u, v) -> Vector, thickened symmetrically along its normal.
    uv(u, v) -> (u, v) gives optional texture coordinates."""
    cols = nu if closed_u else nu + 1; e = 1e-3
    def at(i, j):
        u, v = i / nu, j / nv; p = P(u, v)
        du = P(min(u + e, 1.) if not closed_u else u + e, v) - P(max(u - e, 0.) if not closed_u else u - e, v)
        dv = P(u, min(v + e, 1.)) - P(u, max(v - e, 0.))
        nrm = du.cross(dv)
        return p, (nrm.normalized() if nrm.length > 1e-9 else Vector((0, 0, 1)))
    top, bot, tuv = {}, {}, {}
    verts, uvs = [], []
    for j in range(nv + 1):
        for i in range(cols):
            p, n = at(i, j); top[i, j] = len(verts); verts.append(p + n * (thick / 2)); uvs.append(uv(i / nu, j / nv) if uv else None)
    for j in range(nv + 1):
        for i in range(cols):
            p, n = at(i, j); bot[i, j] = len(verts); verts.append(p - n * (thick / 2)); uvs.append(uv(i / nu, j / nv) if uv else None)
    faces = []
    spans = nu if closed_u else nu
    for j in range(nv):
        for i in range(spans):
            i2 = (i + 1) % cols
            faces.append((top[i, j], top[i2, j], top[i2, j + 1], top[i, j + 1]))
            faces.append((bot[i, j], bot[i, j + 1], bot[i2, j + 1], bot[i2, j]))
    for j in range(nv):  # side rims along v
        if not closed_u:
            for i in (0, nu):
                faces.append((top[i, j], top[i, j + 1], bot[i, j + 1], bot[i, j]))
    for i in range(spans):
        i2 = (i + 1) % cols
        faces.append((top[i, 0], bot[i, 0], bot[i2, 0], top[i2, 0]))
        faces.append((top[i, nv], top[i2, nv], bot[i2, nv], bot[i, nv]))
    G.add(verts, faces, M(m), True, vuv=uvs)

def stitches(sampler, count, m=None, dash=.012, width=.003, lift=.0007, mat_name='MeshBlack', ratio=.55):
    """Dashed thread lying on a surface: sampler(t) -> (point, normal) for t in 0..1."""
    for k in range(count):
        t0, t1 = k / count, (k + ratio) / count
        pa, n = sampler(t0); pb, _ = sampler(t1)
        d = pb - pa
        if d.length < 1e-6: continue
        side = d.cross(n).normalized() * (width / 2); l = n * lift
        q = [pa - side + l, pb - side + l, pb + side + l, pa + side + l]
        f = (0, 1, 2, 3) if (q[1] - q[0]).cross(q[2] - q[0]).dot(n) > 0 else (3, 2, 1, 0)
        G.add(q, [f], M(mat_name), False)

def wob(x, y=0., seed=0.):
    """Deterministic smooth noise in about -1..1 from a few sines."""
    return (sin(x * 7.1 + y * 3.3 + seed) * .45 + sin(x * 12.7 - y * 8.1 + seed * 1.7 + 1.3) * .3 + sin(x * 3.1 + y * 11.9 - seed) * .25)

# ---- bake, export, render ----------------------------------------------------------------

SHARP = radians(52)

def bake(name):
    """Turn the accumulator into one mesh object: fix winding, smooth by angle, UV, materials."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in G.v], [], G.f)
    for n in G.mats: me.materials.append(mat(n[6:]))
    me.polygons.foreach_set('material_index', G.m)
    me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table(); bm.verts.ensure_lookup_table()
    todo = [f for f, fx in zip(bm.faces, G.fix) if fx]
    if todo: bmesh.ops.recalc_face_normals(bm, faces=todo)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        have = all(G.vuv[v.index] is not None for v in f.verts)
        n = f.normal; ax = max(range(3), key=lambda k: abs(n[k]))
        for l in f.loops:
            if have: l[uvl].uv = G.vuv[l.vert.index]
            else:
                p = l.vert.co; a, b = [(p.y, p.z), (p.x, p.z), (p.x, p.y)][ax]; l[uvl].uv = (a, b)
    for f in bm.faces: f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0) > SHARP)
    bm.to_mesh(me); bm.free(); me.update()
    obj = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(obj)
    return obj

def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)

def pick(obj):
    for o in bpy.context.scene.objects: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj

def export_fbx(obj, name):
    pick(obj)
    bpy.ops.export_scene.fbx(filepath=str(STAGED / (name + '.fbx')), use_selection=True, object_types={'MESH'},
        apply_unit_scale=True, axis_forward='-Y', axis_up='Z', use_mesh_modifiers=True, mesh_smooth_type='FACE',
        colors_type='LINEAR', add_leaf_bones=False)

def export_glb(obj, kebab, rename=None):
    """Browser copy. `rename` maps material name -> glTF name for the export only."""
    pick(obj); undo = []
    for old, new in (rename or {}).items():
        mt = bpy.data.materials.get(old)
        if mt: undo.append((mt, old)); mt.name = new
    try:
        bpy.ops.export_scene.gltf(filepath=str(GLB_DIR / (kebab + '.glb')), export_format='GLB', use_selection=True,
            export_apply=True, export_yup=True, export_materials='EXPORT', export_image_format='NONE',
            export_cameras=False, export_lights=False, export_texcoords=True, export_normals=True)
    finally:
        for mt, old in undo: mt.name = old

def clear_scene():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if not me.users: bpy.data.meshes.remove(me)

def scene_points(objs):
    pts = []
    for o in objs:
        for v in o.data.vertices: pts.append(o.matrix_world @ v.co)
    return pts

def box_blur(a, r, axis):
    import numpy as np
    pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
    hi = [slice(None)] * a.ndim; lo = [slice(None)] * a.ndim
    hi[axis] = slice(2 * r + 1, None); lo[axis] = slice(0, -(2 * r + 1))
    return (c[tuple(hi)] - c[tuple(lo)]) / (2 * r + 1)

def add_bloom(path, threshold=.72, strength=.35):
    """Soft glow around bright pixels; the render engine here has no bloom pass of its own."""
    import numpy as np
    img = bpy.data.images.load(str(path)); w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    rgb = px[..., :3]; lum = rgb.max(axis=2, keepdims=True)
    bright = rgb * np.clip((lum - threshold) / (1 - threshold + 1e-6), 0, 1)
    glow = np.zeros_like(bright)
    for r, wgt in ((3, .5), (9, .6), (24, .7), (60, .5)):
        b = bright
        for _ in range(2): b = box_blur(box_blur(b, r, 0), r, 1)
        glow += b * wgt
    px[..., :3] = np.clip(rgb + glow * strength, 0, 1)
    img.pixels.foreach_set(px.reshape(-1)); img.filepath_raw = str(path); img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)

def render(objs, path, res=(800, 600), az=35., el=22., roll=0., engine='EEVEE', ground=True, world=(.10, .11, .13),
           world_strength=1., key=4., fill=1.5, samples=40, margin=.86, floor_color=(.16, .17, .19), target=None,
           lights=None, bloom=False, dist_mult=1.):
    """Preview still: 3/4 view from the front, auto-framed to the objects' vertices."""
    sc = bpy.context.scene; made = []
    def keep(o): made.append(o); return o
    pts = scene_points(objs)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    tgt = Vector(target) if target is not None else (lo + hi) / 2
    # world
    wd = bpy.data.worlds.new('JamWorld'); wd.use_nodes = True
    bg = wd.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (*world, 1); bg.inputs['Strength'].default_value = world_strength
    sc.world = wd
    # camera
    az_r, el_r = radians(az), radians(el)
    dirn = Vector((cos(el_r) * cos(az_r), cos(el_r) * sin(az_r), sin(el_r)))  # from target toward camera
    cam = bpy.data.objects.new('JamCam', bpy.data.cameras.new('JamCam')); sc.collection.objects.link(cam); keep(cam)
    cam.data.lens = 50; cam.data.sensor_width = 36; cam.data.clip_end = 100
    q = (-dirn).to_track_quat('-Z', 'Y') @ Quaternion((0, 0, 1), radians(roll)); cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = q
    R = q.to_matrix(); right, upv, back = R.col[0], R.col[1], R.col[2]
    tx = 18. / cam.data.lens; ty = tx * res[1] / res[0]
    dist = 0.1
    for p in pts:
        d = p - tgt
        dist = max(dist, abs(d.dot(right)) / (margin * tx) + d.dot(back), abs(d.dot(upv)) / (margin * ty) + d.dot(back))
    cam.location = tgt + dirn * dist * dist_mult; sc.camera = cam
    # lights: key from camera-left above, cool rim from behind
    def sun(name, rot_az, rot_el, energy, color=(1, 1, 1), angle=.06):
        L = bpy.data.lights.new(name, 'SUN'); L.energy = energy; L.color = color; L.angle = angle
        o = bpy.data.objects.new(name, L); sc.collection.objects.link(o); keep(o)
        d = Vector((cos(radians(rot_el)) * cos(radians(rot_az)), cos(radians(rot_el)) * sin(radians(rot_az)), sin(radians(rot_el))))
        o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); return o
    if lights is None:
        sun('Key', az - 55, 52, key, (1, .96, .9), .09)
        sun('Rim', az + 150, 25, key * .45, (.7, .8, 1.), .2)
        sun('Fill', az + 70, 18, fill, (.9, .95, 1.), .4)
    else:
        for spec in lights: sun(*spec)
    if ground:
        gm = bpy.data.materials.new('JamFloor'); gm.use_nodes = True
        gb = gm.node_tree.nodes['Principled BSDF']; gb.inputs['Base Color'].default_value = (*floor_color, 1); gb.inputs['Roughness'].default_value = .9
        me = bpy.data.meshes.new('JamFloor')
        r = max(4., (hi - lo).length * 4)
        me.from_pydata([(-r, -r, 0), (r, -r, 0), (r, r, 0), (-r, r, 0)], [], [(0, 1, 2, 3)]); me.materials.append(gm)
        fl = bpy.data.objects.new('JamFloor', me); sc.collection.objects.link(fl); keep(fl)
    # engine
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.resolution_percentage = 100
    sc.render.film_transparent = False; sc.render.image_settings.file_format = 'PNG'
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    if engine == 'CYCLES':
        sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
        sc.cycles.max_bounces = 12; sc.cycles.transparent_max_bounces = 16; sc.cycles.volume_bounces = 0
        sc.cycles.use_adaptive_sampling = True
    else:
        ok = False
        for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
            try: sc.render.engine = eng; ok = True; break
            except Exception: pass
        if ok:
            try: sc.eevee.taa_render_samples = samples
            except Exception: pass
        else: sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.filepath = str(path)
    try: bpy.ops.render.render(write_still=True)
    except Exception as err:
        print('FLOWFEST_JAM render fell back to Workbench:', err)
        sc.render.engine = 'BLENDER_WORKBENCH'; bpy.ops.render.render(write_still=True)
    if bloom: add_bloom(path)
    datas = [(o.type, o.data.name) for o in made]
    for o in made: bpy.data.objects.remove(o, do_unlink=True)
    for kind, nm in datas:
        coll = {"CAMERA": bpy.data.cameras, "LIGHT": bpy.data.lights, "MESH": bpy.data.meshes}[kind]
        if nm in coll: coll.remove(coll[nm])
    bpy.data.worlds.remove(wd)

STATS = {}
EXTRA = {}  # asset name -> list of printed lines

def finish(name, kebab, glb_rename=None, ghost=None, render_fn=None, extra=None, pre_render=None, **look):
    """Bake the accumulator and write FBX, GLB and the preview."""
    global G
    mats = ','.join(m[6:] for m in G.mats)
    obj = bake('SM_Jam_' + name)
    tris = tri_count(obj); STATS[name] = tris
    export_fbx(obj, 'SM_Jam_' + name)
    export_glb(obj, kebab, glb_rename)
    glb_kb = (GLB_DIR / (kebab + '.glb')).stat().st_size / 1024
    objs = [obj]
    if ghost is not None:  # reference geometry that appears in the preview only
        G = Geo(); ghost(); objs.append(bake('ghost'))
    if pre_render: pre_render(objs)
    if render_fn: render_fn(objs)
    else: render(objs, PREVIEW / (kebab + ".png"), **look)
    for suffix, kw in (extra or []): render(objs, PREVIEW / (kebab + "-" + suffix + ".png"), **dict(look, **kw))
    print('FLOWFEST_JAM_ASSET %s tris=%d glb=%.0fKB mats=%s' % (name, tris, glb_kb, mats))
    for o in objs: bpy.data.objects.remove(o, do_unlink=True)

# ==== ASSETS ====

# ---- 1. camp chair ----------------------------------------------------------------------

def back_x(z):
    """Where the chair-back plane sits at height z: the back leans away from the seat."""
    return -.24 - .07 * (z - .45) / .45

SEAT_SAG = .03

def seat_point(u, v):
    """Seat sling: u across (0..1), v rear to front (0..1)."""
    y = (u - .5) * .495; x = -.24 + .48 * v
    sag = SEAT_SAG * sin(pi * v) ** 1.1 * (1 - .35 * (2 * u - 1) ** 2)
    return Vector((x, y, .45 - sag))

def back_point(u, v):
    z = .60 + .30 * v; y = (u - .5) * .495
    return Vector((back_x(z) - .016 * sin(pi * v) * (1 - .3 * (2 * u - 1) ** 2), y, z))

def build_chair():
    ya, yb = .2475, .2625
    for sy in (-1, 1):
        A = fillet([(.25, sy * ya, .02), (-.24, sy * ya, .45), (-.31, sy * ya, .90)], .07, 3)
        sweep(A, .0105, 'Steel', 8)
        B = fillet([(-.25, sy * yb, .02), (.24, sy * yb, .45), (.25, sy * yb, .66), (back_x(.66), sy * ya, .66)], .06, 3)
        sweep(B, .0105, 'Steel', 8)
        tube((-.24, sy * ya, .45), (.24, sy * yb, .45), .0105, 'Steel', 8)
        # pivot rivet and rubber feet
        tube((0, sy * (ya - .004), .23), (0, sy * (yb + .014), .23), .0075, 'Steel', 8)
        tube((0, sy * (yb + .012), .23), (0, sy * (yb + .0185), .23), .0165, 'Steel', 10)
        for x in (-.25, .25):
            yy = yb if x < 0 else ya
            tube((x, sy * yy, .0), (x, sy * yy, .028), .0145, 'Rubber', 8)
        # fabric sleeve over the arm
        tube((.25, sy * yb, .668), (back_x(.66) + .004, sy * ya, .668), .0215, 'Fabric', 10)
    tube((.24, -.2625, .45), (.24, .2625, .45), .0108, 'Steel', 8)
    tube((-.24, -.2475, .45), (-.24, .2475, .45), .0108, 'Steel', 8)
    tube((back_x(.60), -.2475, .60), (back_x(.60), .2475, .60), .0108, 'Steel', 8)
    tube((back_x(.90), -.2475, .90), (back_x(.90), .2475, .90), .0108, 'Steel', 8)
    # fabric sleeves where the sling wraps its tubes
    for x, z, y in ((.24, .45, .2495), (-.24, .45, .2495), (back_x(.60), .60, .2495), (back_x(.90), .90, .2495)):
        tube((x, -y, z), (x, y, z), .0165, 'Fabric', 12, caps=True)
    # the sling itself
    cloth(seat_point, 12, 8, .0045, 'Fabric')
    cloth(back_point, 12, 6, .0045, 'Fabric')
    def seat_edge(sy):
        return lambda t: (seat_point(.5 + sy * (.5 - .035 / .495), t), Vector((0, 0, 1)))
    for sy in (-1, 1):
        stitches(seat_edge(sy), 17, dash=.014, ratio=.55, width=.0042, lift=.0012)
        def bedge(t, sy=sy):
            p = back_point(.5 + sy * (.5 - .035 / .495), t); return p, Vector((1, 0, .15)).normalized()
        stitches(bedge, 11, dash=.014, ratio=.55, width=.0042, lift=.0012)
    # cup holder on the right arm: mesh pocket in a moulded ring, two small stays to the arm
    c = Vector((.04, -.205, 0))
    prof = [(0, .572), (.034, .572), (.040, .585), (.0425, .610), (.0435, .668), (.0462, .672), (.0462, .676), (.0405, .676), (.0395, .668), (.0385, .612),
            (.0365, .590), (.0310, .580), (0, .580)]
    lathe(prof, 16, 'MeshBlack', Matrix.Translation(c))
    box((.04, -.2395, .652), (.03, .034, .014), 'MeshBlack', .002)
    box((.04, -.1715, .652), (.03, .014, .012), 'MeshBlack', .002)

def camp_chair():
    build_chair()
    finish('CampChair', 'camp-chair', az=40, el=24)

# ---- 9. safety towel draped over the chair back ---------------------------------------------

TOWEL_W = .43
FRONT_HANG, REAR_HANG, BAR_R = .34, .42, .027

def towel_point(u, v):
    """Wet duvetyne over the chair's top bar, in the chair's frame. u across, v: front hem -> rear hem."""
    ly = (u - .5) * TOWEL_W
    arc = pi * BAR_R; L = FRONT_HANG + arc + REAR_HANG; s = v * L
    bx, bz = back_x(.90), .90 + .0
    tilt = -.1556  # dx/dz of the back plane
    w = wob(ly * 5.0, 0., 1.0)
    if s < FRONT_HANG:  # front hang, clings to the sling
        t = (FRONT_HANG - s) / FRONT_HANG  # 0 at hem, 1 at bar
        z = bz - (FRONT_HANG - s) + BAR_R * 0; hang = FRONT_HANG - (L and 0)
        x = back_x(z) + .025 + .013 * (1 - t) ** 1.2 * (.55 * sin(ly * 31 + 1.1 + 2 * t) + .45 * sin(ly * 17 + 4. - 3 * t)) + .004 * wob(ly * 9, z * 4, 2.)
        y = ly * (1 + .05 * (1 - t) ** 2)
        z += .014 * sin(ly * 22 + 1.3) * (1 - t) ** 2 + .009 * (1 - t) * wob(ly * 4, 0, 3.)
    elif s < FRONT_HANG + arc:  # over the bar
        a = (s - FRONT_HANG) / arc * pi  # 0 front .. pi rear
        x = bx + .0 + (BAR_R + .002) * cos(a) + .004 * tilt; z = bz + (BAR_R + .002) * sin(a); y = ly
        x += 0
    else:  # rear hang, falls straight down behind the back
        d = s - FRONT_HANG - arc; t = d / REAR_HANG
        x = bx - (BAR_R + .002) + .003 * tilt - .012 * t * (1 + .6 * wob(ly * 6, 0, 5.)) - .013 * t * (.5 + .5 * sin(ly * 26 + 1 + 3 * t)) - .006 * sin(ly * 17 + 2.) * t
        z = bz - d + .018 * sin(ly * 19 + .4) * t * t + .011 * wob(ly * 5, 1, 6.) * t
        y = ly * (1 - .08 * t * t) + .01 * sin(d * 21) * t * 0
    return Vector((x, y, z))

def towel_on_chair():
    cloth(towel_point, 20, 26, .0055, 'Duvetyne')
    finish('SafetyTowel', 'safety-towel', ghost=build_chair, az=40, el=24)

# ---- shared surface helper ------------------------------------------------------------------

def surface_sampler(P, curve, thick=0., e=1e-3):
    """t -> (point on the cloth's top face, normal); `curve(t)` gives the (u, v) to follow."""
    def f(t):
        u, v = curve(t); p = P(u, v)
        du = P(min(u + e, 1.), v) - P(max(u - e, 0.), v); dv = P(u, min(v + e, 1.)) - P(u, max(v - e, 0.))
        n = du.cross(dv); n = n.normalized() if n.length > 1e-9 else Vector((0, 0, 1))
        return p + n * (thick / 2), n
    return f

def smooth01(t):
    t = min(max(t, 0.), 1.); return t * t * (3 - 2 * t)

# ---- 2. folding wagon -------------------------------------------------------------------------

def wagon():
    zb, zt = .215, .55
    def dims(z):  # tub outer half sizes and corner radius at height z
        t = (z - zb) / (zt - zb); return .40 + .075 * t, .205 + .07 * t, .05 - .005 * t
    levels = [.215, .31, .43, .55]; thick = .004
    outer = [[Vector((x, y, z)) for x, y in rrect(dims(z)[0], dims(z)[1], dims(z)[2], 2, 1)] for z in levels]
    inner = [[Vector((x, y, z + (thick if z == levels[0] else 0))) for x, y in rrect(dims(z)[0] - thick, dims(z)[1] - thick, dims(z)[2], 2, 1)] for z in levels]
    loft(outer + inner[::-1], 'Fabric')
    # welted hem round the top, thread dashes below it
    hx, hy, rr = dims(zt)
    hem = [Vector((x, y, zt - .002)) for x, y in rrect(hx + .001, hy + .001, rr + .002, 2, 0)]
    sweep(hem, .0085, 'Fabric', 8, closed=True)
    poly = [Vector((x, y, zt - .038)) for x, y in rrect(hx + .001, hy + .001, rr, 4, 4)]
    def ring_sampler(t):
        n = len(poly); f = t * n; i = int(f) % n; a, b = poly[i], poly[(i + 1) % n]; p = a.lerp(b, f - int(f)); d = (b - a).normalized()
        return p, Vector((d.y, -d.x, 0))
    stitches(ring_sampler, 56, dash=.02, ratio=.5)
    # frame
    def post_xy(z, side_x, side_y):
        h_x, h_y, r = dims(z); k = .7071
        return Vector((side_x * (h_x - r + (r + .011) * k), side_y * (h_y - r + (r + .011) * k), z))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(post_xy(.205, sx, sy), post_xy(.57, sx, sy), .0095, 'Steel', 8)
    for sy in (-1, 1):
        tube(post_xy(.205, -1, sy), post_xy(.205, 1, sy), .011, 'Steel', 8)
    for sx in (-1, 1):
        tube(post_xy(.205, sx, -1), post_xy(.205, sx, 1), .011, 'Steel', 8)
    for sy in (-1, 1):  # scissor X on each long side, riding the sloped wall
        def wall(x, z, off, sy=sy): return Vector((x, sy * (dims(z)[1] + .0105 + off), z))
        tube(wall(-.30, .245, 0), wall(.30, .53, 0), .0075, 'Steel', 8)
        tube(wall(.30, .245, .019), wall(-.30, .53, .019), .0075, 'Steel', 8)
        mid = wall(0, .3875, .0095); tube(mid + Vector((0, sy * -.0125, 0)), mid + Vector((0, sy * .0215, 0)), .0135, 'Steel', 10)
    # axles, brackets, wheels
    for sx in (-1, 1):
        x = sx * .30
        tube((x, -.318, .115), (x, .318, .115), .009, 'Steel', 8)
        for sy in (-1, 1): box((x, sy * .19, .16), (.04, .03, .095), 'Steel', 0)
        for sy in (-1, 1):
            yc = sy * .285; xf = Matrix.Translation((x, yc, .115)) @ Matrix.Rotation(-pi / 2, 4, 'X')
            lathe([(0, -.032), (.06, -.032), (.108, -.027), (.115, -.012), (.115, .012), (.108, .027), (.06, .032), (0, .032)], 14, 'Rubber', xf)
            for s in (-1, 1): tube((x, yc + s * .032, .115), (x, yc + s * .0375, .115), .037, 'Plastic', 12)
    # pull handle with rubber grip
    hp = fillet([(.43, .15, .23), (.80, .15, .53), (.80, -.15, .53), (.43, -.15, .23)], .05, 3)
    sweep(hp, .0105, 'Steel', 10)
    for sy in (-1, 1): box((.43, sy * .15, .225), (.05, .024, .05), 'Steel', .003, 1)
    tube((.80, -.105, .53), (.80, .105, .53), .0175, 'Rubber', 12)
    finish('FoldingWagon', 'folding-wagon', az=38, el=22)

# ---- 3. inflatable couch ----------------------------------------------------------------------

def couch():
    R = .115                                   # seat: six tubes front to back, welded side by side
    for k in range(6):
        capsule((.13, (k - 2.5) * .233, R), (1, 0, 0), .70, R, 'Nylon', sides=10, cap_rings=3, pinch=.1, pinches=(0.,))
    for j in range(1, 6):
        box((.13, (j - 3) * .233, .115), (.62, .004, .06), 'Nylon', 0)
    for x, z, r in ((-.36, .115, .115), (-.375, .33, .11), (-.395, .54, .105), (-.425, .74, .10)):   # backrest: four tubes across
        capsule((x, 0, z), (0, 1, 0), 1.42, r, 'Nylon', sides=10, cap_rings=2, pinch=.1, pinches=(-.5, .5))
        if z > .2: box((x - r - .002, 0, z), (.014, 1.26, .004), 'Nylon', 0)
    for sy in (-1, 1):                         # arms: a fat base tube with a top roll
        capsule((.0, sy * .76, .14), (1, 0, 0), .94, .14, 'Nylon', sides=12, cap_rings=3, pinch=.08, pinches=(0.,))
        capsule((.0, sy * .76, .39), (1, 0, 0), .90, .11, 'Nylon', sides=12, cap_rings=3, pinch=.1, pinches=(0.,))
        box((.05, sy * (.76 + .14 + .003), .14), (.80, .016, .004), 'Nylon', 0)
    # inflation valve on the left arm's end dome
    tube((-.455, .76, .39), (-.495, .76, .39), .016, 'PlasticWhite', 10)
    tube((-.495, .76, .39), (-.503, .76, .39), .021, 'PlasticWhite', 10)
    finish('InflatableCouch', 'inflatable-couch', az=40, el=26)

# ---- 4. fuel can ------------------------------------------------------------------------------

SPOUT = Vector((0, .125, .418))

def fuel_can():
    box((0, 0, .1825), (.16, .34, .335), 'CanRed', .024, 3)
    box((0, 0, .0225), (.168, .348, .015), 'CanRed', .004, 1)          # rolled chime at the foot
    box((0, 0, .335), (.168, .348, .012), 'CanRed', .004, 1)           # shoulder seam
    # stamped panel border and X ribs on both broad faces
    for sx in (-1, 1):
        xo = sx * .0815
        for z in (.085, .285): box((xo, 0, z), (.005, .25, .011), 'CanRed', 0, 1)
        for y in (-.125, .125): box((xo, y, .185), (.005, .011, .211), 'CanRed', 0, 1)
        for d in (-1, 1):
            box((xo, 0, .185), (.004, .27, .012), 'CanRed', 0, 1, rot=basis((sx, 0, 0), (0, -.20 * sx, .22 * d * sx)))
    # carrying handle: two posts and a grip bar across the top
    for y in (-.145, -.015): box((0, y, .366), (.07, .03, .06), 'CanRed', .006, 1)
    box((0, -.08, .396), (.07, .17, .02), 'CanRed', .008, 2)
    # spout, collar and cap
    tube((0, .125, .335), (0, .125, .395), .0225, 'CanRed', 12)
    tube((0, .125, .385), (0, .125, .399), .0305, 'Steel', 14)
    tube((0, .125, .399), (0, .125, .418), .0285, 'Aluminium', 14)
    box((0, .125, .418), (.012, .052, .004), 'Aluminium', 0, 1)
    tube((0, .035, .335), (0, .035, .345), .017, 'Aluminium', 12)                # vent cap
    EXTRA['FuelCan'] = ['FLOWFEST_JAM_WICK_FUELCAN %.4f %.4f %.4f' % tuple(SPOUT)]
    finish('FuelCan', 'fuel-can', az=-38, el=24)

# ---- 5. cooler --------------------------------------------------------------------------------

def cooler():
    def hx_at(z): return .184 + .016 * (z - .03) / .31
    def hy_at(z): return .285 + .015 * (z - .03) / .31
    body = [(.012, .170, .272, .045), (.030, .184, .285, .05), (.34, .200, .300, .052)]
    loft([[Vector((x, y, z)) for x, y in rrect(a, b, r, 2, 1)] for z, a, b, r in body], 'Plastic')
    loft([[Vector((x, y, z)) for x, y in rrect(.1985, .2985, .052, 2, 1)] for z in (.338, .348)], 'Rubber')
    lid = [(.346, .205, .305, .054), (.385, .206, .306, .054), (.395, .200, .300, .05), (.400, .186, .286, .045)]
    loft([[Vector((x, y, z)) for x, y in rrect(a, b, r, 2, 1)] for z, a, b, r in lid], 'PlasticWhite')
    for y in (-.16, 0, .16): box((0, y, .4015), (.30, .016, .005), 'PlasticWhite', 0, 1)
    for y in (-.1, .1):
        lathe([(.028, .4), (.05, .4), (.05, .4065), (.028, .4065), (.028, .4)], 14, 'PlasticWhite', Matrix.Translation((.0, y, 0)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube((sx * .15, sy * .23, 0), (sx * .15, sy * .23, .014), .022, 'Rubber', 10)
    # hinges at the back, latches at the front
    tube((-.2085, -.215, .352), (-.2085, .215, .352), .005, 'Steel', 8)
    for sy in (-1, 1):
        box((-.208, sy * .17, .352), (.014, .07, .034), 'Steel', .002, 1)
        xl = hx_at(.3) + .004
        box((.2095, sy * .17, .376), (.016, .06, .03), 'Rubber', .002, 1)
        box((xl + .002, sy * .17, .30), (.01, .05, .09), 'Rubber', .002, 1)
        tube((xl + .008, sy * .17 - .028, .338), (xl + .008, sy * .17 + .028, .338), .0075, 'PlasticWhite', 8)
    # drain plug
    tube((hx_at(.07) - .002, -.2, .07), (hx_at(.07) + .012, -.2, .07), .016, 'PlasticWhite', 12)
    tube((hx_at(.07) + .012, -.2, .07), (hx_at(.07) + .018, -.2, .07), .021, 'Rubber', 12)
    # rope swing handles at each end
    for sy in (-1, 1):
        yw = sy * hy_at(.29)
        for x in (-.075, .075): box((x, yw + sy * .003, .29), (.034, .012, .05), 'Aluminium', .002, 1)
        p = fillet([(-.075, yw + sy * .008, .295), (-.075, yw + sy * .075, .30), (.075, yw + sy * .075, .30), (.075, yw + sy * .008, .295)], .035, 2)
        sweep(p, .0115, 'Rope', 8)
    finish('Cooler', 'cooler', az=38, el=24)

# ---- 6. led lantern -----------------------------------------------------------------------------

def lantern():
    lathe([(0, 0), (.056, 0), (.058, .004), (.058, .012), (.054, .014), (0, .014)], 16, 'Rubber')
    lathe([(0, .014), (.054, .014), (.0565, .030), (.0525, .042), (.0495, .044), (.044, .044), (0, .044)], 16, 'MeshBlack')
    tube((.0535, 0, .028), (.0665, 0, .028), .0125, 'PlasticWhite', 10)
    lathe([(0, .044), (.040, .044), (.049, .054), (.0535, .078), (.050, .105), (.040, .127), (.031, .137), (0, .137)], 24, 'LanternGlow')
    lathe([(0, .136), (.034, .136), (.040, .140), (.040, .150), (.032, .156), (.012, .160), (.0, .162)], 16, 'MeshBlack')
    tube((0, 0, .160), (0, 0, .172), .011, 'MeshBlack', 10)
    for sy in (-1, 1): box((0, sy * .058, .043), (.016, .012, .016), 'MeshBlack', .002, 1)
    arch = [Vector((0, .063 * cos(radians(a)), .043 + .177 * sin(radians(a)))) for a in range(0, 181, 15)]
    sweep(arch, .0035, 'Steel', 8)
    finish('LedLantern', 'led-lantern', az=38, el=18)

# ---- 7. blanket ---------------------------------------------------------------------------------

BL_X, BL_Y = 1.8, 1.4

def blanket_point(u, v):
    x, y = (u - .5) * BL_X, (v - .5) * BL_Y
    w = .0065 + .0055 * wob(x * 2.3 + y * .9, y * 3.1 - x * .8, 1.) + .0035 * wob(x * 5.1 - y * 2.2, y * 4.3 + x * 1.9, 4.)
    edge = min(u, 1 - u, v, 1 - v)
    w += .006 * max(0., 1 - edge * 9) * (.5 + .5 * wob(x * 6, y * 6, 2.))      # ruffled edge
    cx, cy = .9 - x, .7 - y; d = sqrt(cx * cx + cy * cy)                        # one corner folded up
    fade = smooth01(edge * 7)                                                    # soft ridges, strongest mid-cloth
    w += fade * (.022 + .017 * sin(x * 5.2 + y * 2.1 + 1.4 * wob(x, y, 3.)) + .012 * sin(y * 7.3 - x * 3.4 + 2. + wob(y, x, 8.)) + .008 * sin(x * 11. + y * 9. + wob(x, y, 5.)))
    w += .055 * smooth01(1 - d / .24) ** 2
    return Vector((x, y, max(w, .0035)))

def stripe_preview(objs):
    """Preview only: paint stripes from UV V, to show V runs across the stripes (the GLB keeps flat colour)."""
    m = MATS['M_Jam_Blanket']; nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = nodes['Principled BSDF']
    tc, sep = nodes.new('ShaderNodeTexCoord'), nodes.new('ShaderNodeSeparateXYZ')
    mul, fr, ramp = nodes.new('ShaderNodeMath'), nodes.new('ShaderNodeMath'), nodes.new('ShaderNodeValToRGB')
    mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 9.; fr.operation = 'FRACT'
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].color = (.62, .16, .12, 1); e = ramp.color_ramp.elements.new(.5); e.color = (.93, .78, .42, 1)
    links.new(tc.outputs['UV'], sep.inputs[0]); links.new(sep.outputs['Y'], mul.inputs[0]); links.new(mul.outputs[0], fr.inputs[0])
    links.new(fr.outputs[0], ramp.inputs['Fac']); links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])

def blanket():
    cloth(blanket_point, 34, 26, .006, 'Blanket', uv=lambda u, v: (u, v))
    inset = .03; du, dv = inset / BL_X, inset / BL_Y
    a, b = (1 - 2 * du) * BL_X, (1 - 2 * dv) * BL_Y; per = 2 * (a + b)
    def hem(t):  # walk the hemmed rectangle: perimeter fraction -> (u, v)
        s = t * per
        if s < a: return du + s / BL_X, dv
        s -= a
        if s < b: return 1 - du, dv + s / BL_Y
        s -= b
        if s < a: return 1 - du - s / BL_X, 1 - dv
        s -= a; return du, 1 - dv - s / BL_Y
    stitches(surface_sampler(blanket_point, hem, .006), 120, mat_name='PlasticWhite', dash=.03, ratio=.55, width=.004, lift=.0006)
    finish('Blanket', 'blanket', az=30, el=34, margin=.9, pre_render=stripe_preview)

# ---- 8. yoga mat --------------------------------------------------------------------------------

MAT_W, MAT_T, MAT_RHO, MAT_SHRINK, MAT_TURNS = .61, .006, .043, .019, 1.6
MAT_FLAT = 1.83 - tau * MAT_TURNS * (MAT_RHO - MAT_SHRINK / 2)      # flat run + spiral = 1.83 m of mat
MAT_X0 = -(MAT_FLAT + MAT_RHO) / 2
MAT_XC = MAT_X0 + MAT_FLAT

def yoga_point(u, v):
    u0 = .14; y = (v - .5) * MAT_W
    if u <= u0: return Vector((MAT_X0 + MAT_FLAT * (u / u0), y, MAT_T / 2))
    th = tau * MAT_TURNS; f = (u - u0) / (1 - u0); phi = -pi / 2 + th * f
    rho = MAT_RHO - MAT_SHRINK * f
    return Vector((MAT_XC + rho * cos(phi), y, MAT_RHO + MAT_T / 2 + rho * sin(phi)))

def yoga_mat():
    cloth(yoga_point, 44, 3, MAT_T, 'Plastic', uv=lambda u, v: (u, v))
    zc = MAT_RHO + MAT_T / 2; rb = MAT_RHO + MAT_T + .0025   # an elastic band round the roll
    circ = [Vector((MAT_XC + rb * cos(a), -.09, zc + rb * sin(a))) for a in [tau * k / 22 for k in range(22)]]
    sweep(circ, .0017, 'Rubber', 4, closed=True, flat=7., start=pi / 4)
    for k in range(int((MAT_FLAT - .2) / .2) + 1):                                  # printed alignment lines on the flat run
        box((MAT_X0 + .12 + k * .2, 0, MAT_T + .0004), (.005, .16, .0009), "Rubber", 0, 1)
    box((MAT_X0 + MAT_FLAT / 2, 0, MAT_T + .0004), (MAT_FLAT - .16, .005, .0009), "Rubber", 0, 1)
    finish('YogaMat', 'yoga-mat', az=32, el=32, margin=.9)

# ---- 10. safety towel, folded ---------------------------------------------------------------

def towel_folded():
    z = 0.
    layers = ((0, 0, 0, .205, .152), (.004, -.003, .02, .202, .150), (-.003, .004, -.026, .199, .153), (.003, .002, .014, .204, .148), (-.002, -.002, -.01, .200, .150))
    for k, (dx, dy, yaw, hx, hy) in enumerate(layers):
        h = .0105; rot = Matrix.Rotation(yaw, 2)
        rings = []
        for dz, inset in ((0., .006), (.0035, .0012), (h - .0035, .0012), (h, .006)):
            ring = []
            for x, y in rrect(hx - inset, hy - inset, .022, 3, 1):
                x += .0022 * wob(y * 24, (z + dz) * 40, 1. + k); y += .0022 * wob(x * 24, (z + dz) * 40, 7. + k)
                p = rot @ Vector((x, y)); ring.append(Vector((p.x + dx, p.y + dy, z + dz)))
            rings.append(ring)
        loft(rings, 'Duvetyne'); z += h - .0012
    top = z
    def flap(u, v):
        x, y = (u - .5) * .385, (v - .5) * .285
        w = .0045 + .0055 * wob(x * 9, y * 11, 2.) + .004 * wob(x * 4 + y * 5, y * 3, 5.)
        edge = min(u, 1 - u, v, 1 - v); w *= smooth01(edge * 14)
        cx, cy = .1925 - x, .1425 - y; d = sqrt(cx * cx + cy * cy)
        w += .036 * smooth01(1 - d / .11) ** 1.6                              # one corner turned up
        return Vector((x, y, top + .0028 + w))
    cloth(flap, 14, 10, .005, 'Duvetyne')
    finish('SafetyTowelFolded', 'safety-towel-folded', az=35, el=38, margin=.9)

# ---- 11, 14. stakes ---------------------------------------------------------------------------

def sq_ring(h, c, z):
    return [Vector(p) for p in ((h, -h + c, z), (h, h - c, z), (h - c, h, z), (-h + c, h, z), (-h, h - c, z), (-h, -h + c, z), (-h + c, -h, z), (h - c, -h, z))]

def rope_post():
    rings = [sq_ring(.004, .0015, 0.), sq_ring(.0215, .004, .16), sq_ring(.0215, .004, .70), sq_ring(.0185, .0045, .738), sq_ring(.0135, .004, .75)]
    loft(rings, 'Wood')
    loft([sq_ring(.0222, .0042, .58), sq_ring(.0222, .0042, .645)], 'PlasticWhite')   # hi-vis wrap
    tube((0, 0, .748), (0, 0, .772), .0045, 'Steel', 8)
    tube((0, 0, .75), (0, 0, .7545), .0165, 'Steel', 12)
    tube((0, 0, .7545), (0, 0, .7625), .0095, 'Steel', 8)
    cz = .772 + .0225
    ring = [Vector((.0225 * sin(a), 0, cz - .0225 * cos(a))) for a in [tau * k / 14 for k in range(14)]]
    sweep(ring, .0036, 'Steel', 8, closed=True)
    zr = cz - .0225 + .0036 + .0062                                           # rope resting in the eye
    rope = [Vector((0, y, zr - 1.4 * max(abs(y) - .02, 0) ** 2)) for y in (-.22, -.16, -.10, -.04, 0, .04, .10, .16, .22)]
    sweep(rope, .0062, 'Rope', 8)
    ball((0, .045, zr), .0105, 'Rope', 8, 4)
    finish('RopePost', 'rope-post', az=35, el=18)

def funnel_stake():
    loft([sq_ring(.0035, .0013, 0.), sq_ring(.0185, .0038, .12), sq_ring(.0185, .0038, .525), sq_ring(.0165, .0042, .543), sq_ring(.0125, .004, .553)], 'Wood')
    ring = rrect(.0215, .0215, .008, 1, 0)                                    # octagon-ish twine path around the stake
    pts = []
    turns, z0, pitch = 5, .415, .0105
    for k in range(turns):
        for j, (x, y) in enumerate(ring): pts.append(Vector((x, y, z0 + pitch * (k + j / len(ring)))))
    x, y = ring[0]; pts.append(Vector((x, y, z0 + pitch * turns)))
    sweep(pts, .0027, 'Rope', 6)
    last = pts[-1]
    tail = spline([last, last + Vector((.012, -.006, -.014)), last + Vector((.022, -.008, -.05)), last + Vector((.020, -.004, -.095))], 2)
    sweep(tail, .0027, 'Rope', 6)
    ball(last + Vector((.004, 0, 0)), .0068, 'Rope', 8, 4)
    finish('FunnelStake', 'funnel-stake', az=35, el=18)

# ---- 13. lighting flame stand -------------------------------------------------------------------

WICK_TOP = Vector((0, 0, .897))

def flame_stand():
    hub_z = .60; feet = []
    for a in (90, 210, 330):
        ca, sa = cos(radians(a)), sin(radians(a)); foot = Vector((.30 * ca, .30 * sa, .012)); feet.append((foot, ca, sa))
        top = Vector((.03 * ca, .03 * sa, hub_z)); tube(top, foot, .0125, 'Steel', 8)
        d = (top - foot).normalized(); tube(foot, foot + d * .035, .0165, 'Rubber', 8)
    for k in range(3):                                                          # ring brace between the legs
        a, b = feet[k][0], feet[(k + 1) % 3][0]; za = .30
        pa = Vector((a.x * .52 + .03 * feet[k][1] * .48, a.y * .52 + .03 * feet[k][2] * .48, hub_z - (hub_z - .012) * .52))
        kb = (k + 1) % 3
        pb = Vector((b.x * .52 + .03 * feet[kb][1] * .48, b.y * .52 + .03 * feet[kb][2] * .48, hub_z - (hub_z - .012) * .52))
        tube(pa, pb, .007, 'Steel', 8)
    lathe([(0, hub_z - .045), (.040, hub_z - .045), (.040, hub_z + .035), (0, hub_z + .035)], 12, 'Steel')
    tube((0, 0, hub_z + .03), (0, 0, .762), .0185, 'Steel', 12)
    # drip tray
    lathe([(0, .758), (.06, .758), (.15, .766), (.172, .783), (.172, .792), (.1645, .792), (.1645, .7835), (.147, .772), (.06, .766), (0, .766)], 20, 'Steel')
    for k in range(3):
        a = radians(90 + 120 * k); tube((.055 * cos(a), .055 * sin(a), .765), (.055 * cos(a), .055 * sin(a), .797), .0075, 'Steel', 8)
    for sy in (-1, 1): box((0, sy * .176, .787), (.04, .018, .012), 'Steel', .002, 1)  # tray lugs
    # wick bowl: spun steel, thick lip
    lathe([(0, .795), (.04, .795), (.065, .812), (.080, .846), (.0835, .854), (.0835, .858), (.077, .858), (.0745, .8465), (.0575, .815), (.036, .802), (0, .802)], 20, 'Steel')
    lathe([(0, .802), (.052, .802), (.0545, .83), (.0525, .86), (.044, .885), (.026, .894), (0, .897)], 16, 'Wick')
    for k in range(3):                                                          # wire wraps on the wick
        z = .825 + .02 * k
        ring = [Vector((.0545 * cos(a), .0545 * sin(a), z)) for a in [tau * j / 14 for j in range(14)]]
        sweep(ring, .0018, 'Steel', 6, closed=True)
    EXTRA['LightingFlameStand'] = ['FLOWFEST_JAM_WICK %.4f %.4f %.4f' % tuple(WICK_TOP)]
    finish('LightingFlameStand', 'lighting-flame-stand', az=35, el=20)

# ---- 15. dj table -------------------------------------------------------------------------------

def dj_table():
    TZ = .90
    box((0, 0, TZ - .02), (.75, 1.8, .04), 'PlasticWhite', .004, 1)
    box((0, 0, TZ + .0015), (.7735, 1.8235, .003), 'Duvetyne', 0)
    pts = [Vector((x, y, 0)) for x, y in rrect(.3865, .9115, .03, 4, 6)]; n = len(pts)
    seg = [(pts[(i + 1) % n] - pts[i]).length for i in range(n)]; tot = sum(seg)
    def at_u(u):
        s = (u % 1.) * tot; i = 0
        while i < n - 1 and s > seg[i]: s -= seg[i]; i += 1
        a, b = pts[i], pts[(i + 1) % n]; d = (b - a).normalized()
        return a.lerp(b, s / seg[i]), Vector((d.y, -d.x, 0))
    def skirt(u, v):
        p, nr = at_u(u); hem = .012 + .46 * smooth01((-.10 - p.x) / .22)
        z = TZ + .003 - (TZ + .003 - hem) * v
        ph = tau * 15 * u + .9 * sin(tau * 3 * u)
        off = .0035 + (.004 + .024 * v) * v * sin(ph) + .012 * v * v
        z += .010 * v * sin(tau * 29 * u + 1.)
        return Vector((p.x, p.y, z)) + nr * off
    cloth(skirt, 60, 2, .004, 'Duvetyne', closed_u=True)
    for sy in (-1, 1):                                                          # rear legs and brace show below the short hem
        tube((-.33, sy * .82, .012), (-.33, sy * .82, .88), .0165, 'Steel', 8)
        tube((-.33, sy * .82, 0), (-.33, sy * .82, .02), .021, 'Rubber', 8)
    tube((-.33, -.82, .15), (-.33, .82, .62), .007, 'Steel', 8)
    zt = TZ + .003
    def deck(cx, cy):
        box((cx, cy, zt + .045), (.40, .33, .09), 'MeshBlack', .005, 1)
        zp = zt + .09; jx = cx - .06
        lathe([(0, 0), (.092, 0), (.092, .007), (.078, .0105), (0, .0105)], 18, 'Rubber', Matrix.Translation((jx, cy, zp)))
        tube((jx, cy, zp + .0105), (jx, cy, zp + .0125), .066, 'Aluminium', 18)
        tube((jx, cy, zp + .0125), (jx, cy, zp + .0140), .022, 'Steel', 12)
        box((cx + .17, cy, zp + .0015), (.055, .30, .003), 'Aluminium', 0)                       # silver faceplate strip
        box((cx + .115, cy, zp + .0015), (.12, .075, .003), 'Aluminium', 0)
        box((cx + .115, cy, zp + .0035), (.105, .06, .002), 'MeshBlack', 0)
        for dy in (-.075, .075): box((cx - .175, cy + dy, zp + .0035), (.04, .03, .007), 'PlasticWhite', 0)
        for k in range(4): box((cx + .04, cy - .09 + k * .06, zp + .003), (.026, .026, .006), 'PlasticWhite', 0)
        box((cx, cy + .148, zp + .001), (.16, .01, .002), 'Aluminium', 0); box((cx + .02, cy + .148, zp + .006), (.018, .024, .012), 'PlasticWhite', 0)
    cx = .05
    deck(cx, -.36); deck(cx, .36)
    zm = zt + .07
    box((cx, 0, zt + .035), (.40, .32, .07), 'MeshBlack', .005, 1)
    box((cx + .17, 0, zm + .0015), (.055, .30, .003), 'Aluminium', 0)
    for k in range(4):
        y = -.105 + k * .07
        box((cx - .07, y, zm + .001), (.12, .007, .002), 'Aluminium', 0); box((cx - .07 + (k % 2) * .025 - .0125, y, zm + .006), (.016, .024, .012), 'PlasticWhite', 0)
        for x in (cx + .06, cx + .125): tube((x, y, zm), (x, y, zm + .016), .0105, 'Aluminium' if x > cx + .09 else 'PlasticWhite', 8)
    box((cx - .16, 0, zm + .001), (.007, .16, .002), 'Aluminium', 0); box((cx - .16, .03, zm + .006), (.022, .026, .012), 'PlasticWhite', 0)
    # laptop, screen turned toward the DJ at -X
    c = Vector((-.03, .70, zt)); yaw = -.22; R = Matrix.Rotation(yaw, 3, 'Z')
    def L(x, y, z): return c + R @ Vector((x, y, z))
    box(L(0, 0, .008), (.215, .31, .016), 'Aluminium', .003, 1, rot=R)
    for k in range(4): box(L(.04 - k * .027, 0, .0165), (.018, .27, .0016), 'MeshBlack', 0, 1, rot=R)
    box(L(-.082, 0, .0163), (.045, .10, .001), 'Steel', 0, 1, rot=R)
    tube(L(.1075, -.15, .016), L(.1075, .15, .016), .0065, 'Steel', 8)
    t = radians(15); dvec = R @ Vector((sin(t), 0, cos(t))); nvec = R @ Vector((-cos(t), 0, sin(t)))
    hinge = L(.1075, 0, .016); mid = hinge + dvec * .108
    lid = basis(nvec, dvec)
    box(mid + nvec * .004, (.008, .31, .215), 'Aluminium', .002, 1, rot=lid)
    box(mid + nvec * .0083, (.0012, .30, .205), 'MeshBlack', 0, 1, rot=lid)
    box(mid + nvec * .0092, (.0012, .282, .182), 'ScreenGlow', 0, 1, rot=lid)
    # cables: deck to mixer on the cloth, one snake dropping off the rear edge
    for sy in (-1, 1):
        cab = spline([(-.095, sy * .36, zt + .02), (-.14, sy * .29, zt + .006), (-.15, sy * .19, zt + .006), (-.092, sy * .12, zt + .02)], 2)
        sweep(cab, .004, 'Rubber', 6)
    snake = spline([(-.095, 0, zt + .03), (-.2, 0, zt + .012), (-.37, 0, zt + .01), (-.405, .02, zt - .06), (-.41, .06, zt - .25), (-.405, .08, zt - .36)], 2)
    sweep(snake, .0055, 'Rubber', 6)
    finish("DjTable", "dj-table", az=-38, el=30, margin=.9, extra=[("rear", dict(az=150, el=22))])

# ---- 16. pa speaker ---------------------------------------------------------------------------------

def pa_speaker():
    zc = 1.62
    def yz(x, hy, hz, r): return [Vector((x, a, zc + b)) for a, b in rrect(hy, hz, r, 2, 1)]
    loft([yz(-.15, .115, .245, .05), yz(0., .165, .272, .04), yz(.15, .175, .275, .035)], 'MeshBlack')
    for z in (-.255, .255): box((.1555, 0, zc + z), (.008, .33, .014), 'Steel', 0)         # grille frame
    for y in (-.1635, .1635): box((.1555, y, zc), (.008, .014, .51), 'Steel', 0)
    for k in range(25):
        box((.1535, 0, zc - .24 + k * .02), (.004, .32, .0038), 'MeshBlack', 0)               # fine wire grille, woofer shows through
    for k in range(11):
        box((.1535, -.150 + k * .03, zc), (.004, .0038, .50), 'MeshBlack', 0)
    lathe([(0, 0), (.1, .034), (.112, .040), (.118, .040), (.118, .046), (.106, .046), (.096, .044), (.022, .008), (0, .008)], 14, 'Rubber',
          axis_xf((.1, 0, zc - .06), (1, 0, 0)))
    box((.135, 0, zc + .2), (.05, .075, .05), 'Rubber', .003, 1)
    tube((.158, 0, zc + .2), (.1625, 0, zc + .2), .02, 'Rubber', 10)
    hp = fillet([(.05, -.07, zc + .2745), (.05, -.07, zc + .312), (.05, .07, zc + .312), (.05, .07, zc + .2745)], .03, 2)
    sweep(hp, .009, 'Rubber', 8)
    for sy in (-1, 1): box((-.02, sy * .1685, zc), (.14, .006, .04), 'Rubber', .002, 1)
    tube((0, 0, zc - .275 - .02), (0, 0, zc - .275 + .005), .03, 'Steel', 12)
    # tripod
    hub = .88; legs = []
    lathe([(0, hub - .05), (.042, hub - .05), (.042, hub + .05), (0, hub + .05)], 12, 'MeshBlack')
    for a in (180, 60, -60):
        ca, sa = cos(radians(a)), sin(radians(a)); foot = Vector((.56 * ca, .56 * sa, .012)); top = Vector((.035 * ca, .035 * sa, hub)); legs.append((top, foot))
        tube(top, foot, .012, 'Steel', 8)
        d = (top - foot).normalized(); tube(foot, foot + d * .04, .016, 'Rubber', 8)
    tube((0, 0, .58), (0, 0, 1.19), .0195, 'Steel', 12)
    lathe([(0, .59), (.029, .59), (.029, .635), (0, .635)], 12, 'MeshBlack')
    for top, foot in legs:
        p = top.lerp(foot, .52); tube(Vector((.029 * (foot.x / .56), .029 * (foot.y / .56), .615)), p, .0058, 'Steel', 8)
    lathe([(0, 1.165), (.028, 1.165), (.028, 1.205), (0, 1.205)], 12, 'Rubber')
    tube((0, -.028, 1.185), (0, -.062, 1.185), .011, 'Rubber', 8); ball((0, -.066, 1.185), .016, 'Rubber', 8, 4)
    tube((0, 0, 1.19), (0, 0, 1.36), .0175, 'Steel', 12)
    finish('PaSpeaker', 'pa-speaker', az=35, el=14)

# ---- 17. string bulb ----------------------------------------------------------------------------------

def string_bulb():
    lathe([(0, -.034), (.012, -.034), (.0135, -.030), (.0135, -.018), (.0155, -.015), (.0125, -.011), (.0115, 0), (0, 0)], 8, 'MeshBlack')
    lathe([(0, -.083), (.0135, -.078), (.0195, -.068), (.021, -.057), (.0165, -.045), (.010, -.037), (.0085, -.034), (0, -.034)], 12, 'BulbGlow')
    ring = [Vector((.0065 * sin(a), 0, -.0035 + .0065 - .0065 * cos(a))) for a in [tau * k / 8 for k in range(8)]]
    sweep(ring, .0017, "MeshBlack", 4, closed=True)
    finish('StringBulb', 'string-bulb', az=30, el=10, ground=False, margin=.8)

# ---- 12. led vision club ------------------------------------------------------------------------------

CLUB_BALANCE = .40            # balance point, as a fraction of the length from the knob end
CLUB_L = .52

def club():
    s0 = CLUB_BALANCE * CLUB_L
    xf = Matrix.Translation((-s0, 0, 0)) @ Matrix.Rotation(pi / 2, 4, 'Y')       # lathe axis -> +X; s = distance from the knob end
    # knob + grip: flared knob, slim neck, ten grip ridges, ends inside the body collar
    prof = [(0, 0), (.0085, .0012), (.0155, .0055), (.0192, .0115), (.0180, .0178), (.0138, .0232), (.0116, .030)]
    for k in range(9):
        s = .0345 + k * .0125
        prof += [(.0108, s), (.0123, s + .0062)]
    prof += [(.0108, .1555), (0, .1555)]
    lathe(prof, 12, 'Rubber', xf)
    # frosted body: slim neck widening to a 9 cm bulb, collar at the handle end, two raised bands
    ctrl = [(.162, .0148), (.185, .0166), (.21, .0206), (.24, .0263), (.28, .0340), (.32, .0400), (.36, .0438), (.395, .0450), (.43, .0440), (.46, .0412), (.482, .0366), (.4955, .0312)]
    sm = [(p[0], p[1]) for p in spline(ctrl, 2)]
    def r_at(s):
        for (a, ra), (b, rb) in zip(sm, sm[1:]):
            if a <= s <= b: return ra + (rb - ra) * (s - a) / max(b - a, 1e-6)
        return sm[-1][1]
    bands = [(.262, .0028, .0011), (.440, .0028, .0011)]
    pts = [(s, r) for s, r in sm if not any(abs(s - c) <= h for c, h, _ in bands)]
    for c, h, lift in bands:
        r0, r1 = r_at(c - h), r_at(c + h)
        pts += [(c - h, r0), (c - h, r0 + lift), (c + h, r1 + lift), (c + h, r1)]
    pts.sort(key=lambda p: p[0])
    out = [(0, .1455), (.0140, .1455), (.0168, .1478), (.0168, .1585), (.0150, .1625)] + [(r, s) for s, r in pts] + [(0, .4955)]
    lathe(out, 24, "ClubGlow", xf)
    # soft bumper cap on the body end
    lathe([(0, .489), (.0345, .489), (.0357, .497), (.0352, .505), (.0322, .5125), (.0252, .5177), (.0142, .5197), (0, .520)], 24, 'Rubber', xf)
    # moulded parting-line seams down both sides of the body
    for sy in (-1, 1):
        path = [Vector((p[0] - s0, sy * (p[1] + .0001), 0)) for p in sm[::2]]
        sweep(path, .0012, 'ClubGlow', 4, caps=True, start=pi / 4)
    # inside: diffuser tube, LED strip with 24 emitters, core spine, three ring formers
    lathe([(.0098, .19), (.0106, .19), (.0106, .47), (.0098, .47), (.0098, .19)], 12, 'ClubGlow', xf)
    box((.332 - s0, 0, 0), (.27, .0016, .0145), 'ClubStrip', 0)
    for k in range(24): box(((.2 + k * .0115) - s0, 0, 0), (.0058, .0046, .0075), 'ClubStrip', 0)
    tube((.17 - s0, 0, -.0078), (.485 - s0, 0, -.0078), .0027, 'ClubStrip', 8)
    for s in (.2, .33, .452):
        tube((s - s0, 0, 0), (s + .0025 - s0, 0, 0), .0096, 'ClubStrip', 12)
    finish('LedVisionClub', 'led-vision-club', glb_rename={'M_Jam_ClubGlow': 'led-body'}, render_fn=render_club)

def render_club(objs):
    glow, strip = MATS['M_Jam_ClubGlow'], MATS['M_Jam_ClubStrip']
    def emit(m, color, strength):
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = (*color, 1); b.inputs['Emission Strength'].default_value = strength
    common = dict(res=(960, 600), az=68, el=14, roll=-22, engine="CYCLES", samples=48, margin=.93, ground=False)
    emit(glow, (.03, .38, 1.0), 1.1); emit(strip, (.3, .68, 1.0), 5.)
    render(objs, PREVIEW / 'led-vision-club-lit.png', world=(0, 0, 0), world_strength=0., bloom=True,
           lights=[('Rim', 218, 25, .9, (.55, .7, 1.), .2), ('Key', 13, 40, .35, (1, .95, .9), .2)], **common)
    emit(glow, (.22, .62, 1.0), 0.); emit(strip, (.9, .97, 1.0), 0.)
    render(objs, PREVIEW / 'led-vision-club-unlit.png', world=(.62, .64, .67), world_strength=1., key=3.5, fill=1.2, **common)
    emit(glow, (.30, .62, 1.0), 1.0); emit(strip, (.9, .97, 1.0), 6.0)


def main():
    clear_scene()
    todo = [('CampChair', camp_chair), ('FoldingWagon', wagon), ('InflatableCouch', couch), ('FuelCan', fuel_can), ('Cooler', cooler),
            ('LedLantern', lantern), ('Blanket', blanket), ('YogaMat', yoga_mat), ('SafetyTowel', towel_on_chair), ('SafetyTowelFolded', towel_folded),
            ('RopePost', rope_post), ('LedVisionClub', club), ('LightingFlameStand', flame_stand), ('FunnelStake', funnel_stake), ('DjTable', dj_table),
            ('PaSpeaker', pa_speaker), ('StringBulb', string_bulb)]
    for name, fn in todo:
        if ONLY and name not in ONLY: continue
        begin(); fn()
    for lines in EXTRA.values():
        for ln in lines: print(ln)
    print('FLOWFEST_JAM_TRIS', json.dumps(STATS))

main()
