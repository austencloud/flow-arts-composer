"""One bounded Blender polish pass on the saved castle: contacts, routes, grass.

Run with Blender --background --factory-startup --python this-file.
The grass meshes reuse Forest's authored tuft generator; no new asset downloads.
"""
from pathlib import Path
import bpy, math, random, sys, json, runpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT/'scripts'))
from forest_ground_ecosystem import _build_grass_tuft_mesh

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/celestial/sky-citadel.blend'))
scene = bpy.context.scene
for ob in list(scene.objects):
    if ob.get('citadelPolish') or ob.name.startswith(('Western sky bridge', 'Eastern sky bridge', 'Rear arrival viaduct')):
        bpy.data.objects.remove(ob, do_unlink=True)
bpy.context.view_layer.update()
stone = bpy.data.materials['Warm cut travertine']
edge = bpy.data.materials['Honed limestone edges']
bronze = bpy.data.materials['Brushed antique brass']

def surface_bvh(objects):
    vertices, faces = [], []
    for ob in objects:
        offset = len(vertices)
        vertices.extend(ob.matrix_world @ v.co for v in ob.data.vertices)
        faces.extend(tuple(offset+i for i in p.vertices) for p in ob.data.polygons)
    return BVHTree.FromPolygons(vertices, faces)

meadows = [o for o in scene.objects if o.type == 'MESH' and 'meadow crown' in o.name]
terrain = surface_bvh(meadows)
architecture = surface_bvh([o for o in scene.objects if o.type == 'MESH' and
    o.get('sunwardRole') in {'architecture', 'foundation', 'court', 'shore', 'basin'} or
    o.type == 'MESH' and o.name.startswith('Courtyard paving')])

def height(x,y):
    p,_,_,_ = terrain.ray_cast(Vector((x,y,150)),Vector((0,0,-1)))
    return p.z if p else None

def mesh(name, verts, faces, material, role='architecture'):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    data.materials.append(material)
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob)
    ob['sunwardRole']=role; ob['citadelPolish']=True
    return ob

def bar(name,a,b,width,material,depth=None):
    a,b=Vector(a),Vector(b); half=width/2; d=(depth or width)/2; h=(b-a).length/2
    ob=mesh(name,[(-half,-d,-h),(half,-d,-h),(half,d,-h),(-half,d,-h),
        (-half,-d,h),(half,-d,h),(half,d,h),(-half,d,h)],
        [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
    ob.location=(a+b)/2; ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return ob

# Root origins alone are insufficient: test the concrete envelope as well.
anchors=[o for o in scene.objects if o.get('citadelTreeAnchor')]
moved=[]
for tree in anchors:
    x,y,_=tree.location
    if abs(x-23)<.1 and abs(y-22)<.1:
        tree.location.x=39; tree.location.y=10
        moved.append({'tree':tree.name,'from':[x,y],'to':[39,10]})
    x,y=tree.location.x,tree.location.y
    if abs(x+16)<.1 and abs(y)<.1: continue  # Deliberate soil planter.
    tree.location.z=height(x,y)-.04
    for dx,dy in [(0,0),(.65,0),(-.65,0),(0,.65),(0,-.65)]:
        hit,_,_,_=architecture.ray_cast(Vector((x+dx,y+dy,100)),Vector((0,0,-1)))
        assert hit is None or hit.z < tree.location.z, f'Tree intersects masonry: {tree.name}'

# Each endpoint is deliberately inside its meadow crown. Gentle sloping decks
# replace the old constant-height spans (the rear one ended 9 m above soil).
routes=[
    ('West cloister way','Citadel island','West monastery',(-36,25),(-111,53),5.6),
    ('East cloister way','Citadel island','East aerie',(40,25),(117,51),5.6),
    ('Pilgrim arrival','Citadel island','Rear garden island',(7,-52),(64,-110),6.0),
    ('Library pilgrimage','West monastery','Far high sanctuary',(-119,109),(-109,201),4.8),
    ('Ruins causeway','West monastery','Far west ridge',(-165,100),(-228,164),4.8),
    ('Beacon causeway','East aerie','Far east ridge',(166,112),(190,202),4.8),
]
paths=[]; report_routes=[]
for name,source,target,a,b,width in routes:
    za,zb=height(*a)+.025,height(*b)+.025
    length=math.dist(a,b); dx=(b[0]-a[0])/length; dy=(b[1]-a[1])/length
    stairway=name in {'Pilgrim arrival','Library pilgrimage'}
    side=Vector((-dy,dx,0)); count=math.ceil(length/(.38 if stairway else 2))
    points=[]
    for i in range(count+1):
        t=i/count; x=a[0]+(b[0]-a[0])*t; y=a[1]+(b[1]-a[1])*t
        z=za+(zb-za)*t
        ground=height(x,y)
        if ground is not None: z=max(z,ground+.025)
        points.append(Vector((x,y,z)))
    # A gentle upper envelope clears irregular terrain without sudden steps
    # where a ray first encounters the far shore.
    for order in [range(1,len(points)),range(len(points)-2,-1,-1)]:
        for i in order:
            j=i-1 if order.step>0 else i+1
            distance=math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)
            points[i].z=max(points[i].z,points[j].z-(.38 if stairway else .10)*distance)
    assert abs(points[0].z-za)<.06 and abs(points[-1].z-zb)<.06, name+' landing lip'
    # Continuous mesh avoids gaps between slabs and keeps both landings flush.
    verts=[]; faces=[]
    for p in points:
        verts.extend(tuple(p+side*s*width/2+Vector((0,0,z))) for z in [-.55,0] for s in [-1,1])
    for i in range(count):
        k=i*4; n=k+4
        faces.extend([(k+2,n+2,n+3,k+3),(k,k+1,n+1,n),(k,n,n+2,k+2),(k+1,k+3,n+3,n+1)])
    faces.extend([(0,2,3,1),(count*4,count*4+1,count*4+3,count*4+2)])
    deck=mesh(name+' continuous deck',verts,faces,stone,'walkway')
    if stairway:
        # Broad shallow treads, each at most 15 cm high, cover the sloped base.
        for p,q in zip(points,points[1:]):
            mid=(p+q)/2;mid.z=max(p.z,q.z)+.03
            bar(name+' stair tread',mid-side*(width/2),mid+side*(width/2),length/count+.015,edge,.075)
    for sign in [-1,1]:
        off=side*sign*(width/2-.18)
        for p,q in zip(points,points[1:]):
            bar(name+' handrail',p+off+Vector((0,0,1.05)),q+off+Vector((0,0,1.05)),.18,edge,.24)
            bar(name+' low coping',p+off+Vector((0,0,.16)),q+off+Vector((0,0,.16)),.26,stone,.28)
        for p in points[::max(1,round(4/(length/count)))]:
            bar(name+' baluster',p+off,p+off+Vector((0,0,1.07)),.16,edge)
    # Repeated open under-deck arches, echoing the cloister rather than pylons.
    arch_step=max(2,round(16/(length/count)))
    for i in range(0,count-arch_step+1,arch_step):
        p,q=points[i],points[min(i+arch_step,count)]
        span=(q-p).length
        for sign in [-1,1]:
            off=side*sign*(width*.38)
            arcpoints=[p.lerp(q,j/16)+off+Vector((0,0,-.7-4.5*(1-math.sin(math.pi*j/16)))) for j in range(17)]
            for v,w in zip(arcpoints,arcpoints[1:]):bar(name+' undercroft arch',v,w,.48,stone,.65)
    grade=max(abs(q.z-p.z)/math.hypot(q.x-p.x,q.y-p.y) for p,q in zip(points,points[1:]))
    assert grade < (.40 if stairway else .125), (name,grade)
    paths.append((a,b,width/2+1))
    report_routes.append({'name':name,'from':source,'to':target,'width':width,'length':round(length,2),'maxGrade':round(grade,4),'landings':[list(points[0]),list(points[-1])]})

# Short broad stairs join the existing elevated cloister paving to the meadow.
for side_sign in [-1,1]:
    start=Vector((side_sign*32.7,22,.20)); end=Vector((side_sign*38,22,height(side_sign*38,22)+.025))
    for i in range(12):
        p=start.lerp(end,(i+.5)/12)
        bar('Cloister garden stair',p+Vector((0,-2,-.15)),p+Vector((0,2,-.15)),.47,stone,.30)
    paths.append(((start.x,start.y),(end.x,end.y),3))
# Arrival podium has a 1.6 m edge too; generous stone steps reach its garden path.
for i in range(12):
    x=7; y=-40.3-i*.85; z=.225-i*.145
    bar('Arrival garden stair',(x-3,y,z-.15),(x+3,y,z-.15),.87,stone,.30)
paths.append(((7,-40),(7,-53),4))

def path_distance(x,y,a,b):
    dx=b[0]-a[0];dy=b[1]-a[1]; t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
    return math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)

# Existing Forest blade geometry: low sward plus taller meadow tufts, with
# restrained sage tones matching this warmer limestone setting.
prototypes=[]
for i,stratum in enumerate(['carpet','meadow','seed']):
    data=_build_grass_tuft_mesh('Citadel reused Forest '+stratum,'summer-sward','base',stratum,0)
    mat=data.materials[0].copy(); mat.name='Citadel sage grass '+stratum
    color=[(.20,.30,.095,1),(.25,.34,.12,1),(.34,.38,.17,1)][i]
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color
    mat.diffuse_color=color; mat.use_backface_culling=False
    data.materials.clear();data.materials.append(mat);prototypes.append(data)

randomizer=random.Random(9082026); grass_counts={}
for meadow in meadows:
    vertices=[meadow.matrix_world@v.co for v in meadow.data.vertices]
    cx,cy,_=vertices[0]; rx=max(abs(v.x-cx) for v in vertices); ry=max(abs(v.y-cy) for v in vertices)
    main=meadow.name.startswith('Citadel island')
    target=2600 if main else 380; accepted=0
    for attempt in range(target*18):
        if accepted>=target:break
        x=cx+randomizer.uniform(-rx*.88,rx*.88);y=cy+randomizer.uniform(-ry*.88,ry*.88)
        z=height(x,y)
        if z is None:continue
        # Patchy drifts, denser along the main garden's usable camera space.
        if math.sin(x*.19)+math.cos(y*.16)+.4*math.sin(x*.4+y*.17)<-.45:continue
        if main and (abs(x)>61 or y>110 or y< -75):continue
        if any(math.hypot(x-t.location.x,y-t.location.y)<1.25 for t in anchors):continue
        if any(path_distance(x,y,a,b)<r for a,b,r in paths):continue
        blocked=False
        for ox,oy in [(0,0),(.8,0),(-.8,0),(0,.8),(0,-.8)]:
            p,_,_,_=architecture.ray_cast(Vector((x+ox,y+oy,100)),Vector((0,0,-1)))
            if p and p.z>z-.05:blocked=True;break
        if blocked:continue
        variant=0 if randomizer.random()<.65 else randomizer.choice([1,2])
        data=prototypes[variant];ob=bpy.data.objects.new('Citadel grass '+str(variant),data);scene.collection.objects.link(ob)
        ob.location=(x,y,z-.025);s=randomizer.uniform(1.1,1.85);ob.scale=(s,s,s)
        ob.rotation_euler.z=randomizer.random()*math.tau
        ob['sunwardRole']='grass';ob['citadelPolish']=True
        accepted+=1
    grass_counts[meadow.name]=accepted

bpy.context.view_layer.update()
# Actual graph reachability, rather than a visual assumption about connectivity.
seen={'Citadel island'}
while True:
    before=len(seen)
    for r in report_routes:
        if r['from'] in seen:seen.add(r['to'])
        if r['to'] in seen:seen.add(r['from'])
    if before==len(seen):break
assert len(seen)==7

# UVs use the same metre projection as the original architecture builder.
for ob in scene.objects:
    if ob.type!='MESH' or not ob.get('citadelPolish') or ob.get('sunwardRole')=='grass':continue
    uv=ob.data.uv_layers.active or ob.data.uv_layers.new(name='MetreUV')
    for face in ob.data.polygons:
        a,b,c=[ob.matrix_world@ob.data.vertices[i].co for i in face.vertices[:3]]
        normal=(b-a).cross(c-a);axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
        for loop in face.loop_indices:
            co=ob.matrix_world@ob.data.vertices[ob.data.loops[loop].vertex_index].co
            uv.data[loop].uv=(co[axes[0]]/2.5,co[axes[1]]/2.5)

report={'revision':'citadel-polish-r1','movedTrees':moved,'connectedIslands':sorted(seen),'routes':report_routes,'grassTufts':grass_counts,
    'grassSource':'Existing scripts/forest_ground_ecosystem.py authored blade geometry; sage material adaptation.',
    'scope':'Static connected walking surfaces. No player controls, terrain collision or navigation simulation added.'}
(ROOT/'static/models/celestial/polish-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
tree_report_path=ROOT/'static/models/celestial/ez-tree-manifest.json'
tree_report=json.loads(tree_report_path.read_text())
for contact in tree_report['contacts']:
    tree=next(t for t in anchors if t.name==contact['anchor'])
    contact['position']=list(tree.location);contact['soilZ']=tree.location.z+.04
tree_report_path.write_text(json.dumps(tree_report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender/celestial/sky-citadel.blend'),compress=True)
print('POLISH',json.dumps(report),flush=True)
runpy.run_path(str(ROOT/'scripts/blender-export-celestial-citadel.py'))

