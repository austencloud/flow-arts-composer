import json
import math
import unittest
from prop_capsule_cover import build_cover, validate_cover, point_segment_distance


def tube(curved=False, mirrored=False):
    vertices=[]
    count=24 if curved else 2
    for ring in range(count):
        angle=math.pi*ring/(count-1)
        for side in range(8):
            a=side*math.tau/8
            if curved:
                r=20+math.cos(a)
                p=(r*math.cos(angle),r*math.sin(angle),math.sin(a))
            else: p=(math.cos(a),90.*ring,math.sin(a))
            vertices.append((-p[0],p[1],p[2]) if mirrored else p)
    triangles=[]
    for ring in range(count-1):
        for side in range(8):
            a=ring*8+side; b=ring*8+(side+1)%8
            triangles.extend([(a,b,a+8),(b,b+8,a+8)])
    return vertices,triangles


class CapsuleCoverTests(unittest.TestCase):
    def test_thin_straight_staff_stays_one(self):
        vertices,triangles=tube()
        capsules=build_cover(vertices,triangles)
        self.assertEqual(len(capsules),1)
        self.assertLess(capsules[0]['radiusCm'],1.01)
        validate_cover(vertices,triangles,capsules)

    def test_curved_hollow_mesh_and_mirror_whole_triangle_coverage(self):
        for mirrored in (False,True):
            vertices,triangles=tube(True,mirrored)
            capsules=build_cover(vertices,triangles)
            self.assertLessEqual(len(capsules),16)
            self.assertGreater(len(capsules),1)
            # The original whole-mesh capsule filled the empty crescent center.
            gap=min(point_segment_distance((0,0,0),c['start'],c['end'])-c['radiusCm'] for c in capsules)
            self.assertGreater(gap,10.)
            validate_cover(vertices,triangles,json.loads(json.dumps(capsules)))
            self.assertEqual(capsules,build_cover(vertices,triangles))

    def test_vertices_in_different_capsules_do_not_certify_triangle(self):
        vertices=[(0.,0.,0.),(10.,0.,0.),(0.,10.,0.)]
        capsules=[{'start':list(p),'end':list(p),'radiusCm':.1} for p in vertices]
        with self.assertRaises(ValueError): validate_cover(vertices,[(0,1,2)],capsules)

    def test_invalid_geometry_rejected(self):
        for vertices,triangles in [([],[]),([(math.nan,0,0)],[(0,0,0)]),([(0,0,0)],[(0,1,2)])]:
            with self.assertRaises(ValueError): build_cover(vertices,triangles)

    def test_vector_proof_matches_scalar_for_batches_and_tolerance(self):
        try: import numpy
        except ImportError: self.skipTest('Optional NumPy unavailable')
        vertices,triangles=tube(True,True)
        capsules=build_cover(vertices,triangles)
        # Cross several bounded batches and exercise all corners/capsules.
        triangles=triangles*7
        self.assertGreater(len(triangles),2048)
        self.assertEqual(validate_cover(vertices,triangles,capsules,numpy=False),
                         validate_cover(vertices,triangles,capsules,numpy=True))
        for radius in (1.+1.e-10,1.-5.e-8,1.-2.e-7):
            points=[(1.,0.,0.),(0.,1.,0.),(-1.,0.,0.)]
            spheres=[{'start':[0.,0.,0.],'end':[0.,0.,0.],'radiusCm':radius}]
            outcomes=[]
            for vector in (False,True):
                try: outcomes.append(validate_cover(points,[(0,1,2)],spheres,numpy=vector))
                except ValueError: outcomes.append('rejected')
            self.assertEqual(*outcomes)

    def test_vector_proof_does_not_mix_capsules_between_triangle_corners(self):
        try: import numpy
        except ImportError: self.skipTest('Optional NumPy unavailable')
        points=[(0.,0.,0.),(10.,0.,0.),(0.,10.,0.)]
        spheres=[{'start':list(p),'end':list(p),'radiusCm':.1} for p in points]
        for vector in (False,True):
            with self.assertRaises(ValueError): validate_cover(points,[(0,1,2)],spheres,numpy=vector)


if __name__=='__main__': unittest.main()
