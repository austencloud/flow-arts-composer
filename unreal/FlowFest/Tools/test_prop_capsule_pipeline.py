import json
from pathlib import Path
import tempfile
import unittest
from prop_capsule_pipeline import apply, digest, fit, read, save
from test_prop_capsule_cover import tube

class PipelineTests(unittest.TestCase):
    def fixture(self, root):
        project=root/'Project'; inputs=root/'input'; results=root/'results'
        catalog=project/'Content/Data/props.json'
        save(catalog,{'props':[{'id':'staff','variants':[{'id':'default','mesh':'/Game/Props/L','rightMesh':'/Game/Props/R'}]}]})
        entries=[]
        vertices,triangles=tube()
        for side in ('L','R'):
            asset=project/f'Content/Props/{side}.uasset'; asset.parent.mkdir(parents=True,exist_ok=True); asset.write_bytes(side.encode())
            geometry=inputs/f'{side}.json'; save(geometry,{'vertices':vertices,'triangles':triangles})
            entries.append({'mesh':f'/Game/Props/{side}','file':geometry.name,'assetSHA256':digest(asset),'inputSHA256':digest(geometry)})
        manifest=inputs/'manifest.json'
        save(manifest,{'schema':'tka-prop-clearance-input-v1','space':'ue-static-mesh-local-cm-v1','catalogSHA256':digest(catalog),'meshes':entries})
        fit(manifest,results,1)
        return project,manifest,results,catalog

    def test_roundtrip_preserves_identity_and_proves_both_hands(self):
        with tempfile.TemporaryDirectory() as tmp:
            project,manifest,results,catalog=self.fixture(Path(tmp)); before=catalog.read_bytes()
            report=apply(project,manifest,results)
            self.assertEqual((project/'Saved/props-before-clearance.json').read_bytes(),before)
            variant=read(catalog)['props'][0]['variants'][0]
            self.assertEqual(len(variant['clearanceCapsules']),1)
            self.assertEqual(len(variant['rightClearanceCapsules']),1)
            self.assertTrue(all(len(p['capsulesSHA256'])==64 for p in report['clearanceCovers'].values()))

    def test_changed_inputs_assets_results_and_catalog_reject_without_write(self):
        for mutation in ('geometry','asset','catalog','coverage','identity','missing-right'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as tmp:
                project,manifest,results,catalog=self.fixture(Path(tmp))
                if mutation=='geometry': (manifest.parent/'L.json').write_text('{}')
                elif mutation=='asset': (project/'Content/Props/L.uasset').write_bytes(b'changed')
                elif mutation=='catalog': catalog.write_bytes(catalog.read_bytes()+b' ')
                elif mutation=='missing-right': (results/'R.json').unlink()
                else:
                    result=read(results/'L.json')
                    if mutation=='identity': result['mesh']='/Game/Other'
                    else: result['capsules'][0]['radiusCm']=.01
                    save(results/'L.json',result)
                before=catalog.read_bytes()
                with self.assertRaises((ValueError,FileNotFoundError)): apply(project,manifest,results)
                self.assertEqual(catalog.read_bytes(),before)

    def test_numpy_backend_retains_scalar_triangle_proof(self):
        try: import numpy
        except ImportError: self.skipTest('Optional external numpy unavailable')
        from prop_capsule_cover import enable_numpy,build_cover,validate_cover
        enable_numpy()
        vertices,triangles=tube(True,True)
        capsules=build_cover(vertices,triangles)
        self.assertGreater(len(capsules),1)
        validate_cover(vertices,triangles,capsules)
        with tempfile.TemporaryDirectory() as tmp:
            project,manifest,results,catalog=self.fixture(Path(tmp))
            self.assertEqual(apply(project,manifest,results,numpy=True)['meshCount'],2)

if __name__=='__main__': unittest.main()
