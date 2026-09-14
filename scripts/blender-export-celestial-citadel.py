"""Export Celestial Sky Citadel, batching static architecture by material and role."""
from pathlib import Path
import bpy,json
ROOT=Path(__file__).resolve().parent.parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/celestial/sky-citadel.blend'))
buckets={}
for obj in bpy.context.scene.objects:
 role=obj.get('sunwardRole')
 if obj.type!='MESH' or role in {None,'preview','olive','ez-tree','grass','court'}:continue
 buckets.setdefault((role,tuple(m.name for m in obj.data.materials)),[]).append(obj)
for (role,_),items in buckets.items():
 bpy.ops.object.select_all(action='DESELECT')
 for obj in items:obj.select_set(True)
 bpy.context.view_layer.objects.active=items[0]
 if len(items)>1:bpy.ops.object.join()
 bpy.context.object.name='Citadel_'+role; bpy.context.object['sunwardRole']=role
bpy.ops.object.select_all(action='DESELECT')
runtime=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.get('sunwardRole') not in {None,'preview'}]
for obj in runtime:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'static/models/celestial/sky-citadel.glb'),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_lights=False,export_cameras=False,export_tangents=False)
manifest={'source':'blender/celestial/sky-citadel.blend','courtRadius':6.08,'courtSurfaceY':.225,'clearRadius':10.2,'gardenInstrument':{'center':[-19,4,-17],'outerRadius':2.1},'mainIsland':{'center':[0,-1.15,-18],'radii':[77,105],'depth':64},'meshesBeforeInstancing':len(runtime),'trianglesBeforeInstancing':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in runtime),'provenance':'Original Blender architecture and aggregate textures. One reused shipped Meshy olive from Sunward Gardens. No new external assets.'}
if any(o.get('sunwardRole')=='ez-tree' for o in runtime):
 manifest['provenance']='Original Blender architecture and mineral textures. Trees generated with @dgreenheck/ez-tree 1.1.0 (MIT), bundled ash leaves and Poly Haven oak bark maps. See EZ-TREE-LICENSE.txt and ez-tree-manifest.json.'
if any(o.get('sunwardRole')=='grass' for o in runtime):
 manifest['provenance']+=' Grass reuses the existing Forest authored tuft generator with sage materials. Connected stone routes and placement checks are recorded in polish-manifest.json.'
(ROOT/'static/models/celestial/sky-citadel-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('CITADEL',json.dumps(manifest),flush=True)
