"""Fast Unreal-only geometry export. No fitting, reimport, or catalog changes."""
import hashlib
import json
from pathlib import Path
import sys
import unreal as u

project=Path(u.Paths.project_dir()).resolve()
sys.path.insert(0,str(project/'Tools'))
from prop_capsule_pipeline import save, digest, asset_file
catalog_path=project/'Content/Data/props.json'
catalog_bytes=catalog_path.read_bytes()
catalog_hash=hashlib.sha256(catalog_bytes).hexdigest()
catalog=json.loads(catalog_bytes)
output=project/'Saved/PropClearanceInput'
meshes=sorted({variant[field] for prop in catalog['props'] for variant in prop['variants'] for field in ('mesh','rightMesh')})
entries=[]
for index,path in enumerate(meshes):
    asset=asset_file(project,path); before=digest(asset)
    mesh=u.EditorAssetLibrary.load_asset(path)
    if not isinstance(mesh,u.StaticMesh): raise ValueError('Missing mesh '+path)
    vertices=[]; triangles=[]
    for section in range(mesh.get_num_sections(0)):
        points,indices,_,_,_=u.ProceduralMeshLibrary.get_section_from_static_mesh(mesh,0,section)
        if len(indices)%3: raise ValueError('Invalid triangles '+path)
        offset=len(vertices)
        vertices.extend((float(p.x),float(p.y),float(p.z)) for p in points)
        triangles.extend(tuple(offset+int(indices[i+j]) for j in range(3)) for i in range(0,len(indices),3))
    if not vertices or not triangles or before!=digest(asset): raise ValueError('Invalid or changing asset '+path)
    filename=f'{index:03d}.json'
    save(output/filename,{'vertices':vertices,'triangles':triangles})
    entries.append({'mesh':path,'file':filename,'assetSHA256':before,'inputSHA256':digest(output/filename)})
    u.log('FLOWFEST_PROP_GEOMETRY_EXPORTED '+path)
if digest(catalog_path)!=catalog_hash: raise ValueError('Catalog changed during export')
save(output/'manifest.json',{'schema':'tka-prop-clearance-input-v1','space':'ue-static-mesh-local-cm-v1',
     'catalogSHA256':catalog_hash,'meshes':entries})
u.log(f'FLOWFEST_PROP_GEOMETRY_COMPLETE {len(entries)} {output}')
