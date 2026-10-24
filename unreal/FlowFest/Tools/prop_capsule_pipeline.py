"""External capsule fitting and atomic application of exact imported-mesh proofs.

Unreal exports via export-prop-clearance.py. `fit --input MANIFEST --output DIR
--workers 4 --numpy` can run on d2. `apply --project PROJECT --input MANIFEST
--results DIR` runs locally, verifies every input/asset/catalog and complete
triangle coverage, and writes the existing metadata/coverage contract.
"""
import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import json
import struct
from pathlib import Path
from prop_capsule_cover import build_cover, validate_cover, enable_numpy

def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path): return json.loads(Path(path).read_bytes())
def save(path, value):
    path=Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False))
    temporary.replace(path)
def child(root, name):
    target=(Path(root)/name).resolve()
    if not target.is_relative_to(Path(root).resolve()) or Path(name).is_absolute():
        raise ValueError('Unsafe pipeline path')
    return target
def asset_file(project, mesh):
    if not mesh.startswith('/Game/') or '..' in mesh or '\\' in mesh:
        raise ValueError('Unsafe mesh asset')
    return child(Path(project)/'Content', mesh[6:].split('.')[0]+'.uasset')
def load_input(manifest_path):
    manifest=read(manifest_path)
    if manifest.get('schema')!='tka-prop-clearance-input-v1' or manifest.get('space')!='ue-static-mesh-local-cm-v1' or not manifest.get('meshes'):
        raise ValueError('Invalid input manifest')
    if len({m['mesh'] for m in manifest['meshes']})!=len(manifest['meshes']):
        raise ValueError('Duplicate input mesh')
    for item in manifest['meshes']:
        if digest(child(Path(manifest_path).parent,item['file']))!=item['inputSHA256']:
            raise ValueError('Exported geometry hash changed')
    return manifest
def fit_one(task):
    manifest_dir,item,output,numpy=task
    if numpy: enable_numpy()
    source=child(manifest_dir,item['file'])
    if digest(source)!=item['inputSHA256']: raise ValueError('Exported geometry changed')
    geometry=read(source)
    capsules=build_cover(geometry['vertices'],geometry['triangles'])
    proof=validate_cover(geometry['vertices'],geometry['triangles'],capsules)
    result={'schema':'tka-prop-clearance-result-v1','mesh':item['mesh'],
            'assetSHA256':item['assetSHA256'],'inputSHA256':item['inputSHA256'],
            'capsules':capsules,'coverage':proof}
    save(child(output,item['file']),result)
    return item['mesh']
def fit(manifest_path, output, workers=4, numpy=False):
    if not 1<=workers<=4: raise ValueError('Workers must be 1..4')
    manifest=load_input(manifest_path)
    tasks=[(str(Path(manifest_path).parent),m,str(output),numpy) for m in manifest['meshes']]
    if workers==1:
        for task in tasks: fit_one(task)
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            for mesh in pool.map(fit_one,tasks): print('FITTED '+mesh,flush=True)
    save(Path(output)/'results.json',{'schema':'tka-prop-clearance-results-v1',
         'manifestSHA256':digest(manifest_path),'meshes':len(tasks)})
def apply(project, manifest_path, results, numpy=False):
    if numpy: enable_numpy()
    project=Path(project); manifest=load_input(manifest_path)
    completion=read(Path(results)/'results.json')
    if completion!={'schema':'tka-prop-clearance-results-v1','manifestSHA256':digest(manifest_path),'meshes':len(manifest['meshes'])}:
        raise ValueError('Results do not match input manifest')
    catalog_file=project/'Content/Data/props.json'; original=catalog_file.read_bytes()
    if hashlib.sha256(original).hexdigest()!=manifest['catalogSHA256']:
        raise ValueError('Catalog changed since geometry export')
    catalog=json.loads(original); covers={}
    for item in manifest['meshes']:
        if digest(asset_file(project,item['mesh']))!=item['assetSHA256']:
            raise ValueError('Imported asset changed since geometry export')
        result=read(child(results,item['file']))
        if result.get('schema')!='tka-prop-clearance-result-v1' or any(result.get(k)!=item[k] for k in ('mesh','assetSHA256','inputSHA256')):
            raise ValueError('Result identity mismatch')
        geometry=read(child(Path(manifest_path).parent,item['file']))
        proof=validate_cover(geometry['vertices'],geometry['triangles'],result['capsules'],numpy=numpy)
        proof.update(assetSHA256=item['assetSHA256'],inputSHA256=item['inputSHA256'],
                     capsulesSHA256=hashlib.sha256(b''.join(struct.pack('<d',float(n)) for c in result['capsules'] for n in c['start']+c['end']+[c['radiusCm']])).hexdigest())
        covers[item['mesh']]=(result['capsules'],proof)
    used=set()
    for prop in catalog['props']:
        for variant in prop['variants']:
            for field,cover in (('mesh','clearanceCapsules'),('rightMesh','rightClearanceCapsules')):
                mesh=variant[field]
                if mesh not in covers: raise ValueError('Missing mesh coverage '+mesh)
                variant[cover]=covers[mesh][0]; used.add(mesh)
            variant['clearanceSpace']='ue-static-mesh-local-cm-v1'
    if used!=set(covers): raise ValueError('Coverage inventory mismatch')
    previous=project/'Saved/props-before-clearance.json'
    previous.parent.mkdir(parents=True,exist_ok=True)
    if not previous.exists(): previous.write_bytes(original)
    report={'clearanceGenerated':True,'clearanceCovers':{k:v[1] for k,v in covers.items()},
            'errors':[],'meshCount':len(covers),'inputManifestSHA256':digest(manifest_path)}
    save(project/'Saved/validate-props-report.json',report)
    save(catalog_file,catalog)
    return report
if __name__=='__main__':
    parser=argparse.ArgumentParser(); commands=parser.add_subparsers(dest='command',required=True)
    f=commands.add_parser('fit'); f.add_argument('--input',required=True); f.add_argument('--output',required=True)
    f.add_argument('--workers',type=int,default=4); f.add_argument('--numpy',action='store_true')
    a=commands.add_parser('apply'); a.add_argument('--project',required=True); a.add_argument('--input',required=True); a.add_argument('--results',required=True)
    a.add_argument('--numpy',action='store_true')
    args=parser.parse_args()
    if args.command=='fit': fit(args.input,args.output,args.workers,args.numpy)
    else: print(json.dumps({'meshes':apply(args.project,args.input,args.results,args.numpy)['meshCount']}))
