"""Run in background Blender. Preserve existing authored assets and create festival set pieces."""
import bpy, json, math, os, re, sys
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
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    bpy.ops.object.shade_smooth_by_angle();return o
def fabric(name,verts,faces,mat):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.014
    return o
SMOOTHING='OFF'
def export(name):
    bpy.ops.object.select_all(action='SELECT')
    # FBX joins meshes in Unreal while retaining material slots and the authored origin.
    path=STAGED/(name+'.fbx')
    bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},apply_unit_scale=True,
        axis_forward='-Y',axis_up='Z',use_mesh_modifiers=True,mesh_smooth_type=SMOOTHING,path_mode='COPY',embed_textures=True,add_leaf_bones=False)
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
# `-- --sets-only` rebuilds just the set pieces, without decoded source GLBs.
SETS_ONLY='--sets-only' in sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else False
for job in ([] if SETS_ONLY else json.loads((STAGED/'imports.json').read_text())):
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
SMOOTHING='FACE'  # set pieces carry smooth fabric and round poles
# Camp tents follow the web camp (flow-fest-production-geometry.ts): ridge and dome
# tents and a pop-up canopy, each with a dark door, poles and a groundsheet. Unreal
# paints the fly and canopy fabric per instance, so their base colour here is only
# the default a lone (non-instanced) piece shows.
fly=material('Tent fly nylon',(.78,.15,.07),.62); canopy_fabric=material('Canopy fabric',(.81,.79,.74),.7)
door=material('Tent doorway',(.022,.025,.028),.95); netting=material('Tent netting',(.05,.055,.06),.9)
floor=material('Tent bathtub floor',(.03,.034,.032),.8); cap=material('Rainfly cap',(.15,.16,.17),.6)
pole=material('Tent pole',(.07,.075,.08),.4,.6); cord=material('Guy line',(.78,.72,.52),.9)
zipper=material('Tent zip',(.06,.06,.06),.5); frame=material('Canopy frame',(.6,.61,.62),.45,.3)
table_top=material('Table top',(.72,.71,.67),.6); cooler_body=material('Cooler body',(.035,.11,.42),.45)
cooler_lid=material('Cooler lid',(.8,.8,.77),.5); chair_cloth=material('Chair fabric',(.03,.06,.04),.85)
def sheet(name,point,nu,nv,mats,pick=lambda u,v:0,thickness=.012):
    """A fabric grid: point(u,v) for u,v in [0,1]; pick chooses each face's material."""
    verts=[point(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces=[(j*(nu+1)+i,j*(nu+1)+i+1,(j+1)*(nu+1)+i+1,(j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    for m in mats: mesh.materials.append(m)
    for f in mesh.polygons: f.use_smooth=True
    for f,(j,i) in zip(mesh.polygons,[(j,i) for j in range(nv) for i in range(nu)]):
        f.material_index=pick((i+.5)/nu,(j+.5)/nv)
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=thickness
    return o
def guy(top,stake):
    beam(top,stake,.005,cord)
    s=Vector(stake);beam((s.x,s.y,-.06),(s.x,s.y,.1),.009,pole)
def outline(points,r,mat):
    for a,b in zip(points,points[1:]): beam(a,b,r,mat)

clear()
# Ridge tent: ridge along X, doorway on the +X gable. The fly sags between its poles.
L,W,H,hem=1.35,1.12,1.48,.1
for s in (1,-1):
    def side(u,v,s=s):
        x=-L+2*L*u;y=s*W*(1-v);z=hem+(H-hem)*v
        n=Vector((0,-s*(H-hem),-W)).normalized();sag=.09*math.sin(math.pi*u)*math.sin(math.pi*v)**.8
        return (x,y+n.y*sag,z+n.z*sag)
    sheet('Ridge fly',side,16,6,[fly])
fabric('Rear gable',[(-L,-W,hem),(-L,W,hem),(-L,0,H)],[(0,1,2)],fly)
fabric('Rear vent',[(-L-.014,-.2,H-.42),(-L-.014,.2,H-.42),(-L-.014,0,H-.14)],[(0,1,2)],netting)
fabric('Front gable',[(L,-W,hem),(L,W,hem),(L,0,H)],[(0,1,2)],fly)
arch=[(L+.012,-.5*math.cos(t),hem+.02+1.02*math.sin(t)) for t in [math.pi*k/12 for k in range(13)]]
fabric('Doorway',arch,[tuple(range(len(arch)))],door)
outline(arch,.007,zipper)
beam((L+.04,.52,hem+.06),(L+.04,.3,hem+.95),.05,fly)  # door panel rolled and tied back
for x in (-L,L): beam((x,0,0),(x,0,H+.07),.013,pole)
for x in (-1,1): guy((x*L,0,H),(x*(L+1.05),0,0))
for y in (-1,1): guy((0,y*W*.5,hem+(H-hem)*.5),(0,y*(W+.75),0))
cube('Groundsheet',(0,0,.012),(2*L+.06,2*W+.06,.024),floor,0)
export('Tent')

clear()
# Dome tent: two crossed poles over a rounded floor, a grey rain cap on top, the
# doorway on +X and a netting window at the back. Fabric sags between the poles.
A,B,H,hem=1.38,1.18,1.38,.12
corner=math.atan2(B,A);poles=[corner,math.pi-corner,math.pi+corner,-corner]
def edge(t):
    c,s=abs(math.cos(t)),abs(math.sin(t));return ((c/A)**3+(s/B)**3)**(-1/3)
def gap(t):
    d=min(abs(math.atan2(math.sin(t-p),math.cos(t-p))) for p in poles)
    return d/(corner if abs(math.cos(t))>abs(math.sin(t)) else math.pi*.5-corner)
def dome(theta,t,lift=0):
    phi=t*math.pi*.5;sag=.13*min(gap(theta),1)**1.3*math.sin(math.pi*t)**.9
    r=edge(theta)*math.sin(phi)*(1-sag)+lift*math.sin(phi)
    return (r*math.cos(theta),r*math.sin(theta),hem+(H-hem)*math.cos(phi)**.85+lift*math.cos(phi))
def dome_face(u,v):
    theta=u*math.tau-math.pi
    if abs(theta)<.3 and v>.42: return 1
    if abs(abs(theta)-math.pi)<.3 and .34<v<.6: return 2
    return 0
sheet('Dome fly',lambda u,v:dome(u*math.tau-math.pi,v),48,14,[fly,door,netting],dome_face)
sheet('Rain cap',lambda u,v:dome(u*math.tau-math.pi,v*(.28+.1*(1-min(gap(u*math.tau-math.pi),1))),.035),48,6,[cap])
for p in poles:
    outline([dome(p,k/16,.045) for k in range(17)],.018,pole)
    foot=Vector(dome(p,1));guy(dome(p,.45,.04),(foot.x*1.55,foot.y*1.55,0))
door_edge=[dome(-.3,.42+.58*k/8,.004) for k in range(8,-1,-1)]+[dome(-.3+.6*k/10,.42,.004) for k in range(1,10)]+[dome(.3,.42+.58*k/8,.004) for k in range(9)]
outline(door_edge,.007,zipper)
for seam in (math.pi*.5,math.pi,-math.pi*.5): outline([dome(seam,.3+.7*k/8,.006) for k in range(9)],.006,zipper)
outline([dome(.35,.5+.48*k/6,.05) for k in range(7)],.045,fly)  # door rolled and tied back
ring=[(edge(k*math.tau/40)*.97*math.cos(k*math.tau/40),edge(k*math.tau/40)*.97*math.sin(k*math.tau/40)) for k in range(40)]
mesh=bpy.data.meshes.new('Bathtub floor')
mesh.from_pydata([(x,y,0) for x,y in ring]+[(x,y,.16) for x,y in ring],[],[tuple(range(40))]+[(k,(k+1)%40,40+(k+1)%40,40+k) for k in range(40)])
o=bpy.data.objects.new('Bathtub floor',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(floor)
o.modifiers.new('Fabric thickness','SOLIDIFY').thickness=.012
export('DomeTent')

def popup_canopy(half,eave,rise,drop):
    """A pop-up shade: square legs, scissor truss under the valance, a sagging peaked top."""
    leg=half-.06
    for x in (-leg,leg):
        for y in (-leg,leg):
            cube('Leg',(x,y,.62),(.05,.05,1.24),frame,.006);cube('Leg upper',(x,y,(1.24+eave)/2),(.038,.038,eave-1.24),frame,.006)
            cube('Foot',(x,y,.006),(.13,.13,.012),frame,0)
    corners=[(-leg,-leg),(leg,-leg),(leg,leg),(-leg,leg)]
    for (x0,y0),(x1,y1) in zip(corners,corners[1:]+corners[:1]):
        for k in range(3):
            a=(x0+(x1-x0)*k/3,y0+(y1-y0)*k/3);b=(x0+(x1-x0)*(k+1)/3,y0+(y1-y0)*(k+1)/3)
            beam((*a,eave-.02),(*b,eave-.36),.012,frame);beam((*a,eave-.36),(*b,eave-.02),.012,frame)
    peak=Vector((0,0,eave+rise))
    edges=[(-half,-half),(half,-half),(half,half),(-half,half)]
    for (x0,y0),(x1,y1) in zip(edges,edges[1:]+edges[:1]):
        def roof(u,v,x0=x0,y0=y0,x1=x1,y1=y1):
            e=Vector((x0+(x1-x0)*u,y0+(y1-y0)*u,eave));p=e.lerp(peak,v)
            return (p.x,p.y,p.z-.05*half*math.sin(math.pi*u)*math.sin(math.pi*min(v*1.4,1)))
        sheet('Canopy top',roof,10,6,[canopy_fabric],thickness=.01)
        fabric('Valance',[(x0,y0,eave),(x1,y1,eave),(x1,y1,eave-drop),(x0,y0,eave-drop)],[(0,1,2,3)],canopy_fabric)
        beam((x0*.97,y0*.97,eave+.01),tuple(peak-Vector((0,0,.03))),.012,frame)

clear()
popup_canopy(2.45,2.2,.85,.26)
export('Canopy')

clear()
# The camp canopy is the web's 3 m shade off a tailgate, with its table, cooler and chairs.
popup_canopy(1.5,2.05,.7,.22)
cube('Table top',(.3,-.5,.74),(1.2,.6,.04),table_top,.01)
for x in (-.5,.5): cube('Table leg',(.3+x,-.5,.36),(.04,.5,.72),frame,0)
cube('Cooler',(-.8,.7,.2),(.72,.42,.4),cooler_body,.03);cube('Cooler lid',(-.8,.7,.43),(.74,.44,.06),cooler_lid,.02)
for cx,cy,yaw in ((.55,.45,-.4),(-.15,.75,.5)):
    rot=Matrix.Rotation(yaw,3,'Z');at=lambda x,y,z:tuple(Vector((cx,cy,0))+rot@Vector((x,y,z)))
    for x in (-.24,.24):
        beam(at(x,-.22,0),at(x,.2,.46),.011,frame);beam(at(x,.2,0),at(x,-.22,.46),.011,frame)
    fabric('Chair seat',[at(-.25,-.22,.45),at(.25,-.22,.45),at(.25,.2,.4),at(-.25,.2,.4)],[(0,1,2,3)],chair_cloth)
    fabric('Chair back',[at(-.25,.2,.4),at(.25,.2,.4),at(.25,.3,.88),at(-.25,.3,.88)],[(0,1,2,3)],chair_cloth)
    for x in (-.27,.27): beam(at(x,-.22,.62),at(x,.22,.62),.012,frame)
export('CampCanopy')
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
