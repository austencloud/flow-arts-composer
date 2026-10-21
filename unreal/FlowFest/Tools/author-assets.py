"""Run in background Blender. Preserve existing authored assets and create festival set pieces."""
import bpy, json, math, os, re
from pathlib import Path
from mathutils import Matrix, Vector
HERE = Path(__file__).resolve().parent
STAGED = HERE / 'staged'
def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
def material(name, color, roughness=.72, metallic=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=roughness; p.inputs['Metallic'].default_value=metallic
    return m
wood=material('Weathered cedar',(.23,.12,.055)); canvas=material('Warm canvas',(.48,.25,.10))
dark=material('Charcoal trim',(.045,.052,.05)); metal=material('Galvanized steel',(.28,.31,.30),.35,.8)
def cube(name,loc,scale,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name
    o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if bevel:
        m=o.modifiers.new('Worn edges','BEVEL'); m.width=bevel; m.segments=2
    return o
def beam(a,b,r,mat):
    a,b=Vector(a),Vector(b); d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);return o
def fabric(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.014
    return o
def export(name):
    bpy.ops.object.select_all(action='SELECT')
    # FBX joins meshes in Unreal while retaining material slots and the authored origin.
    path=STAGED/(name+'.fbx')
    bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},apply_unit_scale=True,
        axis_forward='-Y',axis_up='Z',use_mesh_modifiers=True,path_mode='COPY',embed_textures=True,add_leaf_bones=False)
WHEEL_NAME=re.compile(r'wheel|tire|tyre',re.I)
def world_box(objects):
    points=[o.matrix_world@v.co for o in objects for v in o.data.vertices]
    return (Vector((min(p.x for p in points),min(p.y for p in points),min(p.z for p in points))),
            Vector((max(p.x for p in points),max(p.y for p in points),max(p.z for p in points))))
def normalize_car(job):
    """Bake the web lot's computeFlowFestCarNormalization into the mesh: footprint
    centred, tyres on z = 0, nose on +X, one unit per metre at the catalogue length."""
    car=job['car'];bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.vertices)]
    low,high=world_box(meshes)
    # Underbody pans hang below the contact patch; named wheels own the road datum.
    wheels=[o for o in meshes if WHEEL_NAME.search(o.name) or WHEEL_NAME.search(o.data.name)]
    road=world_box(wheels)[0].z if wheels else low.z
    yaw=car['sourceYawRadians'];size=high-low
    # glTF +Y up becomes Blender +Z, so the web's yaw about Y is the same angle about Z.
    length=size.x if round(yaw/(math.pi/2))%2==0 else size.y
    scale=car['lengthMeters']/max(length,1e-3);centre=(low+high)/2
    matrix=(Matrix.Translation((0,0,-road*scale))@Matrix.Rotation(yaw,4,'Z')
            @Matrix.Scale(scale,4)@Matrix.Translation((-centre.x,-centre.y,0)))
    for o in bpy.context.scene.objects:
        if o.parent is None: o.matrix_world=matrix@o.matrix_world
    bpy.context.view_layer.update();low,high=world_box(meshes)
    print('FLOWFEST_CAR',job['id'],'wheels',len(wheels),'size',tuple(round(v,3) for v in high-low),'bottom',round(low.z,3))
for job in json.loads((STAGED/'imports.json').read_text()):
    out=STAGED/(job['id']+'.fbx')
    if out.exists(): continue
    clear();bpy.ops.import_scene.gltf(filepath=job['decoded'])
    if job.get('car'): normalize_car(job)
    # Textures become ordinary PNGs; the FBX importer does not depend on browser compression extensions.
    texture_dir=STAGED/'textures'/job['id'];texture_dir.mkdir(parents=True,exist_ok=True)
    for image in bpy.data.images:
        if image.packed_file:
            image.filepath_raw=str(texture_dir/(image.name.replace('/','_')+'.png'));image.file_format='PNG';image.save()
    export(job['id'])
clear()
fabric('Tent fly',[(-1.5,-1.2,.05),(1.5,-1.2,.05),(1.5,1.2,.05),(-1.5,1.2,.05),(0,-1.2,1.85),(0,1.2,1.85)],[(0,1,4),(0,4,5,3),(4,1,2,5),(3,5,2)],canvas)
for y in [-1.2,1.2]:
    beam((-1.5,y,.06),(0,y,1.85),.025,metal);beam((1.5,y,.06),(0,y,1.85),.025,metal)
cube('Groundsheet',(0,0,.045),(3,2.4,.025),dark,0)
export('Tent')
clear()
# A separate dome silhouette preserves the source campsite mix.
dome_vertices=[(0,0,1.65)]
dome_faces=[]
segments=24
rings=10
for ring in range(1,rings+1):
    polar=(math.pi*.5)*ring/rings
    for side in range(segments):
        angle=side*math.tau/segments
        dome_vertices.append((1.65*math.sin(polar)*math.cos(angle),1.4*math.sin(polar)*math.sin(angle),.05+1.6*math.cos(polar)))
for side in range(segments): dome_faces.append((0,1+side,1+(side+1)%segments))
for ring in range(rings-1):
    for side in range(segments):
        a=1+ring*segments+side;b=1+ring*segments+(side+1)%segments
        dome_faces.append((a,a+segments,b+segments,b))
fabric('Dome fly',dome_vertices,dome_faces,canvas)
for azimuth in [0,math.pi*.5]:
    for segment in range(20):
        a=math.pi*segment/20;b=math.pi*(segment+1)/20
        def arch(t):return (1.67*math.cos(t)*math.cos(azimuth),1.42*math.cos(t)*math.sin(azimuth),.06+1.62*math.sin(t))
        beam(arch(a),arch(b),.018,metal)
cube('Dome groundsheet',(0,0,.04),(3.1,2.5,.025),dark,0)
export('DomeTent')
clear()
for x in [-2.2,2.2]:
    for y in [-2.2,2.2]: beam((x,y,0),(x,y,2.35),.045,metal)
fabric('Canopy roof',[(-2.5,-2.5,2.35),(2.5,-2.5,2.35),(2.5,2.5,2.35),(-2.5,2.5,2.35),(0,0,3.4)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],canvas)
export('Canopy')
clear()
for x in [-1.8,1.8]:
    for y in [-1.2,1.2]: cube('Porch post',(x,y,1.3),(.13,.13,2.6),wood)
for y in [-1.25,1.25]:
    for z in [.25,.5,.75,1.0]: cube('Board',(0,y,z),(3.7,.1,.2),wood)
cube('Counter',(0,-1.2,1.13),(3.9,.55,.12),wood)
fabric('Roof',[(-2.15,-1.6,2.55),(2.15,-1.6,2.55),(2.15,1.6,2.55),(-2.15,1.6,2.55),(0,-1.6,3.2),(0,1.6,3.2)],[(0,4,5,3),(4,1,2,5)],dark)
export('Gatehouse')
clear()
for i in range(16):
    a=i*math.tau/16; o=cube('Fire stone',(math.cos(a)*1.35,math.sin(a)*1.35,.18),(.48,.34,.32),dark,.07);o.rotation_euler.z=a
for i in range(5):
    a=i*math.tau/5;beam((-.7*math.cos(a),-.7*math.sin(a),.2),(.7*math.cos(a),.7*math.sin(a),.4),.13,wood)
export('Firepit')
clear()
for y in [-.38,0,.38]:cube('Bench plank',(0,y,.5),(2.4,.29,.09),wood)
for x in [-.8,.8]:cube('Bench leg',(x,0,.25),(.12,.9,.5),wood)
export('Bench')
clear();cube('Sign pole',(0,0,1.1),(.12,.12,2.2),wood)
cube('Signboard',(0,0,1.8),(1.65,.09,.48),wood);export('Signpost')
print('FLOWFEST_ASSETS_AUTHORED')
