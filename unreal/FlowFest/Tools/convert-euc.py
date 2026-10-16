"""Bake the source FlowFestElectricUnicycle geometry into two native meshes.

Dimensions and colors are from FlowFestElectricUnicycle.svelte. The wheel is
separate so native motion rotates the tire without rotating pedals or rider.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

OUT = Path(__file__).resolve().parent / 'staged' / 'EUC'
OUT.mkdir(parents=True, exist_ok=True)
MATERIALS = {}


def material(name, color, roughness, metallic=0, emission=0):
    rgb = tuple(int(color[i:i+2], 16) / 255 for i in (1, 3, 5))
    # Source colors are CSS sRGB; Blender material factors are scene linear.
    linear = tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*linear, 1)
    m.use_nodes = True
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metallic
    MATERIALS[name] = dict(color=linear, roughness=roughness, metallic=metallic, emission=emission)
    return m


rubber = material('EUC_Tire', '#171c21', .88, .05)
rim = material('EUC_Rim', '#4b5a67', .32, .72)
hub = material('EUC_Hub', '#6d7782', .22, .9)
spokes = material('EUC_Spokes', '#aeb8c0', .26, .82)
shell = material('EUC_Shell', '#2d3a49', .24, .48)
pad = material('EUC_Pads', '#26323d', .68, .18)
pedal = material('EUC_Pedals', '#20252b', .72, .45)
grip = material('EUC_Grip', '#8f9aa3', .4, .8)
head = material('EUC_Headlight', '#e8f5ff', .15, emission=3)
tail = material('EUC_Taillight', '#ff4f48', .2, emission=3)
blue = material('EUC_Accent', '#1f99ff', .28, .4, emission=1.8)
handle = material('EUC_Handle', '#07090c', .6, .22)


def xyz(v):
    return (v[0], -v[2], v[1])


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def box(name, center, dimensions, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz(center))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, center, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=xyz(center), rotation=(0, math.pi / 2, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.fbx(filepath=str(OUT / (name + '.fbx')), use_selection=True, object_types={'MESH'},
        apply_unit_scale=True, axis_forward='-Y', axis_up='Z', add_leaf_bones=False)


clear()
bpy.ops.mesh.primitive_torus_add(major_radius=.285, minor_radius=.078, major_segments=48, minor_segments=18, rotation=(0, math.pi / 2, 0))
bpy.context.object.data.materials.append(rubber)
cylinder('Motor housing', (0, 0, 0), .238, .23, rim)
for x in [-.101, .101]:
    cylinder('Axle cap', (x, 0, 0), .14, .018, hub)
for i in range(8):
    angle = i * math.tau / 8
    obj = box('Spoke', (0, .115 * math.cos(angle), .115 * math.sin(angle)), (.026, .225, .026), spokes)
    obj.rotation_euler.x = angle
export('SM_EUC_Wheel')

clear()
# Capsule shell, source radius .205, straight length .22, scale .88/.86/.9.
vertices, faces = [], []
segments, rings = 24, 18
for ring in range(rings + 1):
    polar = math.pi * ring / rings
    y = .58 + (.205 * math.cos(polar) + (.11 if polar <= math.pi / 2 else -.11)) * .86
    for i in range(segments):
        azimuth = i * math.tau / segments
        vertices.append(xyz((.205 * math.sin(polar) * math.cos(azimuth) * .88, y,
            .035 + .205 * math.sin(polar) * math.sin(azimuth) * .9)))
for ring in range(rings):
    for i in range(segments):
        a = ring * segments + i
        b = ring * segments + (i + 1) % segments
        faces.append((a, b, b + segments, a + segments))
mesh = bpy.data.meshes.new('EUC capsule shell')
mesh.from_pydata(vertices, [], faces)
mesh.update()
obj = bpy.data.objects.new('EUC shell', mesh)
bpy.context.collection.objects.link(obj)
obj.data.materials.append(shell)
for polygon in mesh.polygons:
    polygon.use_smooth = True
for x in [-.19, .19]:
    box('Leg pad', (x, .64, .015), (.045, .24, .18), pad)
for x in [-.23, .23]:
    box('Pedal', (x, .25, .015), (.27, .035, .25), pedal)
    for z in [-.05, .02, .09]:
        box('Pedal grip', (x, .272, z), (.2, .01, .014), grip)
box('Headlight', (0, .73, .182), (.21, .075, .035), head).rotation_euler.x = .22
box('Taillight', (0, .67, -.17), (.18, .055, .03), tail).rotation_euler.x = -.12
box('Blue light', (0, .48, .197), (.12, .26, .024), blue)
box('Handle', (0, .875, .01), (.2, .035, .18), handle)
export('SM_EUC_Body')
(OUT / 'materials.json').write_text(json.dumps(MATERIALS, indent=2))
print('FLOWFEST_EUC_EXPORT_OK: source body and rotating wheel; pedal surface 27.7 cm')
