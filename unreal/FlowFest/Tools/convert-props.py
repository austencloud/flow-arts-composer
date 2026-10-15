"""Run in Blender: turn the staged Prop3D catalog into dedicated native FBX meshes.

The generated meshes use the same pivot convention as Prop3D: the hand is at
the origin, prop reach points along +Y, and one Blender metre becomes 100 UE cm.
"""
import bpy
import json
import math
import re
import sys
from pathlib import Path
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
STAGED = HERE / 'staged' / 'Props'
PROJECT = HERE.parent
CATALOG = json.loads((STAGED / 'catalog.json').read_text())
EXACT_PLATES = json.loads((STAGED / 'exact-plates.json').read_text())

def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def mat(name, rgba, emission=0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*rgba, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgba, 1)
    bsdf.inputs['Metallic'].default_value = .65 if name in ('Steel', 'Chrome') else .05
    bsdf.inputs['Roughness'].default_value = .32 if name in ('Steel', 'Chrome') else .7
    bsdf.inputs['Emission Color'].default_value = (*rgba, 1)
    bsdf.inputs['Emission Strength'].default_value = emission
    return material

BLUE = mat('Hand_Recolor', (.07, .24, .95))
RED = mat('Hand_Recolor_Red', (.93, .075, .11))
STEEL = mat('Steel', (.48, .53, .58))
CHROME = mat('Chrome', (.75, .77, .82))
BLACK = mat('Black_Hardware', (.018, .022, .028))
WICK = mat('Kevlar_Wick', (.44, .35, .22))
LED = mat('LED_Head', (.07, .6, 1), 3)
FIRE = mat('Fire_Emissive', (1, .20, .025), 6)
WOOD = mat('Wood', (.30, .16, .08))

def assign(obj, material):
    obj.data.materials.append(material)
    return obj

def cylinder(name, a, b, radius, material, vertices=16):
    a, b = Vector(a), Vector(b)
    direction = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(a+b)/2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return assign(obj, material)

def sphere(name, center, radius, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    return assign(obj, material)

def tube(name, points, radius, material, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for point, coords in zip(spline.points, points): point.co = (*coords, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj

def circle(name, radius, tube_radius, material, center=(0,0,0), count=64):
    return tube(name, [(center[0]+radius*math.cos(i*2*math.pi/count),
                        center[1]+radius*math.sin(i*2*math.pi/count), center[2])
                       for i in range(count)], tube_radius, material, True)

def rod(name, length=.9, radius=.009, material=BLUE):
    return cylinder(name, (0,-length/2,0), (0,length/2,0), radius, material)

def lathe_band(name, stops, material, factor=1):
    segments=24
    vertices=[]
    for at,radius in stops:
        for i in range(segments):
            angle=i*2*math.pi/segments
            vertices.append((radius*factor*math.cos(angle),at*factor,radius*factor*math.sin(angle)))
    faces=[]
    for ring in range(len(stops)-1):
        for i in range(segments):
            a=ring*segments+i
            b=ring*segments+(i+1)%segments
            faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj,material)

def source_lathe(name, factor):
    profile = Path(__file__).resolve().parents[3]/'node_modules/@austencloud/scene-3d/src/lib/components/props'/f'{name}-profile.ts'
    if not profile.exists():
        # A task worktree may share node_modules through the primary checkout.
        profile=Path('E:/tka-platform/node_modules/@austencloud/scene-3d/src/lib/components/props')/f'{name}-profile.ts'
    text=profile.read_text()
    bands=re.findall(r'id:\s*"([^"]+)"\s*,\s*stops:\s*\[(.*?)\]',text,re.S)
    if len(bands)<5: raise RuntimeError(f'Missing {name} profile bands in {profile}')
    colors={'knob':BLACK,'handle':WOOD,'marker':BLACK,'body':BLUE,'cap':BLACK,
            'pommel':CHROME,'grip':BLACK,'band':CHROME,'flare':BLUE,
            'ferrule':CHROME,'shaft':STEEL,'wick':WICK}
    for id,body in bands:
        stops=[(float(a),float(r)) for a,r in re.findall(r'\{\s*at:\s*([-\d.]+),\s*radius:\s*([-\d.]+)\s*\}',body)]
        if len(stops)<2: raise RuntimeError(f'Empty {name} band {id}')
        lathe_band(f'{name}_{id}',stops,colors[id],factor)

def exact_plate(name, scale):
    source = EXACT_PLATES[name]
    coords = source['positions']
    vertices = [(coords[i]*scale,coords[i+1]*scale,coords[i+2]*scale) for i in range(0,len(coords),3)]
    faces = [(i,i+1,i+2) for i in range(0,len(vertices),3)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.materials.append(BLUE)
    mesh.materials.append(BLACK)
    mesh.update()
    for group in source['groups']:
        start=group['start']//3
        end=(group['start']+group['count'])//3
        for polygon in mesh.polygons[start:end]: polygon.material_index=group['materialIndex']
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    return obj

def frame(id, variant):
    finish = variant.get('finish', 'fire')
    arm_count = 4 if id == 'quiad' else 3
    arm = (.43202 if id == 'quiad' else .44707) * .9 * (1.4 if id == 'bigtriad' else 1)
    day = finish == 'day'
    ring_radius, ring_tube = ((.108, .03) if day else (.085, .016))
    circle('Finger_Ring', ring_radius*arm, ring_tube*arm, BLACK if day else CHROME)
    sections = ([(.128,.34,.052,BLACK),(.32,.39,.032,BLACK),(.33,.85,.026,BLUE),(.79,.86,.032,BLACK),(.85,1.104,.06,LED)] if day else
                [(.095,.26,.026,CHROME),(.24,.36,.02,CHROME),(.24,.92,.013,STEEL),(.9,1.104,.048,WICK)])
    for i in range(arm_count):
        theta = i*2*math.pi/arm_count
        for j,(start,end,radius,material) in enumerate(sections):
            cylinder(f'Arm_{i}_{j}', (math.sin(theta)*start*arm,math.cos(theta)*start*arm,0),
                     (math.sin(theta)*end*arm,math.cos(theta)*end*arm,0),radius*arm,material)

def triangle(grip):
    chord, sag = .5588, .02235
    height = chord*math.sqrt(3)/2
    verts = ([(-chord/2,sag),(chord/2,sag),(0,sag+height)] if grip == 'side' else
             [(0,0),(chord/2,height),(-chord/2,height)])
    centroid = (sum(p[0] for p in verts)/3,sum(p[1] for p in verts)/3)
    for i in range(3):
        p,q = verts[i],verts[(i+1)%3]
        mid = ((p[0]+q[0])/2,(p[1]+q[1])/2)
        out = Vector((mid[0]-centroid[0],mid[1]-centroid[1])).normalized()
        path = []
        for n in range(65):
            t=n/64
            x=p[0]*(1-t)+q[0]*t+out.x*4*sag*t*(1-t)
            y=p[1]*(1-t)+q[1]*t+out.y*4*sag*t*(1-t)
            path.append((x,y,0))
        tube(f'Bowed_Tube_{i}',path,.0079375,BLUE)
        sphere(f'Printed_Elbow_{i}',(p[0],p[1],0),.0103,BLACK)

def fan(variant, scale):
    build = variant.get('fanBuild','pictograph')
    length = .9*scale
    if build == 'pictograph':
        exact_plate('fan',scale)
    else:
        circle('Finger_Ring', .041*length,.010*length,BLACK, (0,.077*length,0))
        wick = build in ('fire','lotus')
        frame_mat = CHROME if wick else (CHROME if variant.get('fanFrameColor')=='white' else BLACK)
        for i in range(5):
            theta=(-.77+i*.385)
            end=(math.sin(theta)*.45*length,math.cos(theta)*.5*length,0)
            tube(f'Spoke_{i}',[(0,.07*length,0),end],.006*length,frame_mat)
            if wick: cylinder(f'Wick_{i}',end,(end[0],end[1]+.055*length,0),.015*length,WICK)
        tube('Outer_Rim',[(math.sin(-.77+i*1.54/48)*.45*length,
                           math.cos(-.77+i*1.54/48)*.5*length,0) for i in range(49)],.009*length,frame_mat)
        if variant.get('fanCover')=='covered':
            for i in range(5): sphere(f'Cover_{i}',(math.sin(-.77+i*.385)*.45*length,
                                               math.cos(-.77+i*.385)*.5*length,0),.023*length,BLUE)

def procedural(id, variant, scale):
    base = id[3:] if id.startswith('big') else id
    if base == 'hoop': base = 'minihoop'
    if base in ('staff','simple_staff','staff_v2'):
        rod('Staff_Tube',.9*scale,.009,BLUE)
        for side in (-1,1): cylinder(f'End_{side}',(0,side*.39*scale,0),(0,side*.45*scale,0),.012,BLACK)
    elif base == 'club':
        source_lathe('club',scale)
    elif base == 'fan': fan(variant,scale)
    elif base in ('triad','quiad'): frame(id,variant)
    elif base == 'minihoop':
        radius=(.4699/2-.015875/2)*scale
        circle('Hoop_Tube',radius,.015875/2*scale,BLUE,(0,radius,0),128)
        # The two gaffer wraps and push button are distinct from the tube.
        for label,angle,arc in (('Join_Tape',math.pi/2,.045/radius),('Grip_Tape',-math.pi/2,.15/radius)):
            points=[(radius*math.cos(angle-arc/2+i*arc/24),
                     radius+radius*math.sin(angle-arc/2+i*arc/24),0) for i in range(25)]
            tube(label,points,.015875/2*1.3*scale,BLACK)
        sphere('Push_Button',(0,2*radius+.015875/2*1.3*scale,0),.003*scale,CHROME)
    elif base == 'triangle': triangle(variant.get('triangleGrip','corner'))
    elif base == 'torch':
        source_lathe('torch',.9*scale)
    elif base == 'poi':
        length=.9*.65*scale
        staff_radius=.009*scale
        handle=length*.08
        leash=length*.70
        swivel=staff_radius*.4
        ball=staff_radius*3.5
        cylinder('Poi_Handle',(0,-handle,0),(0,0,0),staff_radius*.8,CHROME,12)
        cylinder('Poi_Leash',(0,0,0),(0,leash,0),staff_radius*.15,BLACK,8)
        sphere('Poi_Swivel',(0,leash+swivel,0),swivel,STEEL)
        sphere('Poi_Head',(0,leash+2*swivel+ball,0),ball,BLUE)
    elif base in ('contactball','doublecontactball'):
        sphere('Contact_Ball',(0,0,0),.036*scale,BLUE)
        if base == 'doublecontactball': sphere('Second_Contact_Ball',(0,-.28*scale,0),.036*scale,BLUE)
    elif base == 'eightrings':
        exact_plate('eightrings',scale)
    elif base in ('triquetra','triquetra2'):
        exact_plate(base,scale)
    elif base == 'chicken':
        rod('Chicken_Shaft',.65*scale,.006,BLUE)
        sphere('Chicken_Head',(0,.34*scale,0),.025*scale,BLUE)
        sphere('Chicken_Tail',(0,-.34*scale,0),.025*scale,BLUE)
    elif base == 'guitar':
        sphere('Guitar_Body',(0,-.20*scale,0),.15*scale,WOOD)
        cylinder('Guitar_Neck',(0,-.06*scale,0),(0,.48*scale,0),.022*scale,WOOD)
    elif base == 'sword':
        cylinder('Sword_Grip',(0,-.22*scale,0),(0,0,0),.014*scale,BLACK)
        cylinder('Sword_Blade',(0,0,0),(0,.65*scale,0),.023*scale,STEEL)
    elif base == 'fractalgeng':
        exact_plate('fractalgeng',scale)
    elif base == 'doublestar':
        for side in (-1,1):
            y=side*.26*scale
            for i in range(5):
                a=i*2*math.pi/5
                cylinder(f'Star_{side}_{i}',(0,y,0),(.12*math.sin(a)*scale,y+.12*math.cos(a)*scale,0),.023*scale,BLUE)
        rod('Bridge',.52*scale,.015,BLUE)
    else:
        raise RuntimeError(f'No dedicated geometry for {id}')

def import_model(id, variant):
    base = CATALOG_MODELS[id]
    file = STAGED / f'{base}.glb'
    bpy.ops.import_scene.gltf(filepath=str(file))
    if id == 'stick':
        pass
    if id in ('fan','bigfan'):
        build=variant.get('fanBuild')
        selected={'fire':'Fan_Fire','lotus':'Fan_Lotus','day':'Fan_Day','moon':'Fan_Moon'}.get(build)
        for obj in list(bpy.context.scene.objects):
            if obj.type != 'MESH': continue
            parents=[obj.name]
            ancestor=obj.parent
            while ancestor:
                parents.append(ancestor.name)
                ancestor=ancestor.parent
            if selected and selected not in parents and not (variant.get('fanCover')=='covered' and 'Fan_Cover' in parents):
                bpy.data.objects.remove(obj,do_unlink=True)

CATALOG_MODELS = {
    'buugeng':'buugeng','bigbuugeng':'buugeng','chicken':'chicken','bigchicken':'chicken',
    'guitar':'guitar','ukulele':'ukulele','sword':'sword','sickles':'sickles',
    'trigeng':'trigeng','doublestar':'doublestar','bigdoublestar':'doublestar',
    'doublecontactball':'double-contact-ball','bigdoublecontactball':'double-contact-ball',
    'capsule_baton':'capsule-baton','fire_double_staff':'fire-double-staff',
    'stick':'stick','pen':'pen',
}

def export_variant(prop, variant, right=False):
    clear()
    id=prop['id']
    key=f"{id}_{variant['id']}".replace('-','_') + ('_right' if right else '')
    model=CATALOG_MODELS.get(id)
    if model:
        # Stick has a separate authored red-hand model. Every other right-hand
        # prop retains its own physical geometry and changes only hand color.
        if right and id == 'stick': CATALOG_MODELS[id]='stick-right'
        import_model(id,variant)
        if right and id == 'stick': CATALOG_MODELS[id]=model
    elif id in ('fan','bigfan') and variant.get('fanBuild') not in (None,'pictograph'):
        source={'flat-grip':'fan-flat-grip','star':'fan-star'}.get(variant['fanBuild'],'fan')
        CATALOG_MODELS[id]=source
        import_model(id,variant)
        del CATALOG_MODELS[id]
    else: procedural(id,variant,prop['scale'])
    meshes=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    if not meshes: raise RuntimeError(f'{key}: empty geometry')
    if model or (id in ('fan','bigfan') and variant.get('fanBuild') not in (None,'pictograph')):
        # Blender's glTF importer maps the source's +Y prop axis to Blender +Z.
        # Restore the authored hand axis before taking dimensions and exporting.
        orientation=Matrix.Rotation(-math.pi/2,4,'X')
        if id == 'chicken':
            offset=.3810001*prop['scale']-.059*.52
            orientation=Matrix.Translation((0,offset,0)) @ Matrix.Rotation(math.pi,4,'X') @ orientation
        for obj in meshes:
            obj.matrix_world=orientation @ Matrix.Scale(prop['scale'],4) @ obj.matrix_world
    if id in ('buugeng','bigbuugeng') and variant['rightFlipped' if right else 'leftFlipped']:
        mirror=Matrix.Scale(-1,4,Vector((1,0,0)))
        for obj in meshes:
            obj.matrix_world=mirror @ obj.matrix_world
    if right:
        for obj in meshes:
            for index,material in enumerate(obj.data.materials):
                if material and (material == BLUE or 'Recolor' in material.name or 'recolor' in material.name):
                    obj.data.materials[index]=RED
    coords=[obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    lo=[min(v[axis] for v in coords) for axis in range(3)]
    hi=[max(v[axis] for v in coords) for axis in range(3)]
    bounds={'minCm':[round(x*100,3) for x in lo],'maxCm':[round(x*100,3) for x in hi]}
    if hi[1]-lo[1]<.01: raise RuntimeError(f'{key}: implausible long-axis bounds {bounds}')
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes: obj.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.export_scene.fbx(filepath=str(STAGED/f'{key}.fbx'),use_selection=True,
                             object_types={'MESH'},apply_unit_scale=True,
                             axis_forward='-Z',axis_up='Y',add_leaf_bones=False,
                             bake_space_transform=False,mesh_smooth_type='FACE',
                             path_mode='COPY',embed_textures=True)
    return bounds

for prop in CATALOG['props']:
    for variant in prop['variants']:
        variant['bounds']=export_variant(prop,variant)
        variant['rightBounds']=export_variant(prop,variant,True)
    if prop['authoredLengthCm'] is None:
        bounds=prop['variants'][0]['bounds']
        prop['authoredLengthCm']=round(bounds['maxCm'][1]-bounds['minCm'][1],3)
    if prop['id']=='pen':
        bounds=prop['variants'][0]['bounds']
        measured=bounds['maxCm'][1]-bounds['minCm'][1]
        if abs(measured-90)>2:
            raise RuntimeError(f'Performance pen GLB must preserve its giant 90 cm authored length; measured {measured}')

(PROJECT/'Content/Data').mkdir(parents=True,exist_ok=True)
(PROJECT/'Content/Data/props.json').write_text(json.dumps(CATALOG,indent=2))
print(f"FLOWFEST_PROPS_CONVERTED {len(CATALOG['props'])} physical IDs")
