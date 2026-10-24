"""Offline conservative capsule union for complete imported mesh triangles (cm)."""
import math

ALLOWANCE_CM = .001
MAX_CAPSULES = 16
_NP = None

def enable_numpy():
    """Optional external-worker acceleration; final scalar proof is unchanged."""
    global _NP
    import numpy
    _NP = numpy

def sub(a, b): return tuple(x-y for x,y in zip(a,b))
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def length(a): return math.sqrt(dot(a,a))
def unit(a):
    n=length(a)
    return tuple(x/n for x in a) if n>1.e-12 else None

def point_segment_distance(p, a, b):
    d=sub(b,a); den=dot(d,d)
    t=max(0., min(1., dot(sub(p,a),d)/den)) if den else 0.
    return length(sub(p, tuple(a[i]+t*d[i] for i in range(3))))

def _axes(points):
    axes=[(1.,0.,0.),(0.,1.,0.),(0.,0.,1.)]
    if _NP is None:
        center=tuple(sum(p[i] for p in points)/len(points) for i in range(3))
        cov=[[sum((p[i]-center[i])*(p[j]-center[j]) for p in points) for j in range(3)] for i in range(3)]
    else:
        array=_NP.asarray(points, dtype=_NP.float64)
        center=tuple(array.mean(axis=0).tolist())
        centered=array-_NP.asarray(center)
        cov=(centered.T @ centered).tolist()
    # Seed every coordinate: planar and symmetric geometry must not lose an axis.
    for seed in axes[:]:
        axis=seed
        for _ in range(16):
            nxt=unit(tuple(dot(row,axis) for row in cov))
            if nxt is None: break
            axis=nxt
        if all(abs(dot(axis,other))<.999999 for other in axes): axes.append(axis)
    return center, axes

def _fit(vertices, triangles, ids):
    points=[vertices[i] for i in sorted({i for t in ids for i in triangles[t]})]
    center,axes=_axes(points)
    best=None
    for axis in axes:
        projections=[dot(sub(p,center),axis) for p in points] if _NP is None else ((_NP.asarray(points)-center) @ axis).tolist()
        lo,hi=min(projections),max(projections)
        a=tuple(center[i]+lo*axis[i] for i in range(3))
        b=tuple(center[i]+hi*axis[i] for i in range(3))
        # No endpoint shortening. The convex capsule contains ALL assigned
        # vertices, hence every point of every assigned complete triangle.
        if _NP is None:
            radius=max(point_segment_distance(p,a,b) for p in points)+ALLOWANCE_CM
        else:
            d=_NP.asarray(b)-a; den=float(d @ d); offset=_NP.asarray(points)-a
            t=_NP.clip((offset @ d)/den, 0., 1.) if den else _NP.zeros(len(points))
            residual=offset-t[:,None]*d
            radius=math.sqrt(float(_NP.max(_NP.sum(residual*residual,axis=1))))+ALLOWANCE_CM
        volume=math.pi*radius*radius*(hi-lo+4.*radius/3.)
        if best is None or volume<best[0]:
            best=(volume, {'start':list(a),'end':list(b),'radiusCm':radius})
    return best

def _split(vertices, triangles, ids, parent_volume):
    if len(ids)<2: return None
    centers={t:tuple(sum(vertices[v][i] for v in triangles[t])/3. for i in range(3)) for t in ids}
    _,axes=_axes(list(centers.values()))
    best=None
    for axis in axes:
        ordered=sorted(ids,key=lambda t:(dot(centers[t],axis),t))
        mid=len(ordered)//2
        left,right=ordered[:mid],ordered[mid:]
        lfit,rfit=_fit(vertices,triangles,left),_fit(vertices,triangles,right)
        gain=parent_volume-lfit[0]-rfit[0]
        if gain>max(parent_volume*.015,1.e-12) and (best is None or gain>best[0]):
            best=(gain,left,lfit,right,rfit)
    return best

def validate_cover(vertices, triangles, capsules, tolerance_cm=1.e-7, numpy=None):
    if not capsules or len(capsules)>MAX_CAPSULES: raise ValueError('Invalid capsule count')
    for c in capsules:
        numbers=c['start']+c['end']+[c['radiusCm']]
        if len(c['start'])!=3 or len(c['end'])!=3 or not all(math.isfinite(x) for x in numbers) or c['radiusCm']<=0:
            raise ValueError('Invalid capsule geometry')
    if numpy is True and _NP is None: enable_numpy()
    if _NP is not None and numpy is not False:
        return _validate_cover_numpy(vertices, triangles, capsules, tolerance_cm)
    worst=0.
    for triangle in triangles:
        # One SAME convex capsule must enclose all three corners. A union that
        # merely covers vertices individually can leave the triangle interior out.
        excess=min(max(point_segment_distance(vertices[i],c['start'],c['end'])-c['radiusCm'] for i in triangle) for c in capsules)
        worst=max(worst,excess)
        if excess>tolerance_cm: raise ValueError('Triangle not enclosed by one capsule: '+str(triangle)+' excess='+str(excess))
    return {'vertices':len(vertices),'triangles':len(triangles),'capsules':len(capsules),'maxTriangleExcessCm':worst}

def _validate_cover_numpy(vertices, triangles, capsules, tolerance_cm):
    """Bounded batches; max over THREE corners precedes min over capsules."""
    points=_NP.asarray(vertices,dtype=_NP.float64)
    starts=_NP.asarray([c['start'] for c in capsules],dtype=_NP.float64)
    directions=_NP.asarray([c['end'] for c in capsules],dtype=_NP.float64)-starts
    lengths=_NP.sum(directions*directions,axis=1)
    radii=_NP.asarray([c['radiusCm'] for c in capsules],dtype=_NP.float64)
    # Re-evaluate boundary/positive results with the scalar oracle. This keeps
    # tolerance decisions and reported positive maxima identical at roundoff.
    scale=max(1.,float(_NP.max(_NP.abs(points))),float(_NP.max(_NP.abs(starts))),float(_NP.max(_NP.abs(directions))))
    roundoff=scale*_NP.finfo(_NP.float64).eps*64.
    worst=0.
    for begin in range(0,len(triangles),1024):
        batch=triangles[begin:begin+1024]
        corners=points[_NP.asarray(batch,dtype=_NP.int64)]
        offsets=corners[:,:,None,:]-starts
        projection=_NP.sum(offsets*directions,axis=3)
        t=_NP.clip(projection/_NP.where(lengths>0.,lengths,1.),0.,1.)
        residual=offsets-t[:,:,:,None]*directions
        distances=_NP.sqrt(_NP.sum(residual*residual,axis=3))-radii
        excesses=_NP.min(_NP.max(distances,axis=1),axis=1)
        for index in _NP.flatnonzero(excesses>=-roundoff):
            triangle=batch[int(index)]
            excess=min(max(point_segment_distance(vertices[i],c['start'],c['end'])-c['radiusCm'] for i in triangle) for c in capsules)
            worst=max(worst,excess)
            if excess>tolerance_cm: raise ValueError('Triangle not enclosed by one capsule: '+str(triangle)+' excess='+str(excess))
    return {'vertices':len(vertices),'triangles':len(triangles),'capsules':len(capsules),'maxTriangleExcessCm':worst}

def build_cover(vertices, triangles, max_capsules=MAX_CAPSULES):
    if not 1<=max_capsules<=MAX_CAPSULES: raise ValueError('Capsule budget must be 1..16')
    if not vertices or not triangles: raise ValueError('Empty mesh')
    if any(len(p)!=3 or not all(math.isfinite(x) for x in p) for p in vertices): raise ValueError('Nonfinite vertex')
    if any(len(t)!=3 or any(not isinstance(i,int) or i<0 or i>=len(vertices) for i in t) for t in triangles): raise ValueError('Invalid triangle')
    ids=list(range(len(triangles))); fit=_fit(vertices,triangles,ids)
    leaves=[(ids,fit,_split(vertices,triangles,ids,fit[0]))]
    while len(leaves)<max_capsules:
        available=[(leaf[2][0],-i,i) for i,leaf in enumerate(leaves) if leaf[2] is not None]
        if not available: break
        index=max(available)[2]
        _,left,lfit,right,rfit=leaves[index][2]
        leaves[index:index+1]=[(left,lfit,_split(vertices,triangles,left,lfit[0])),(right,rfit,_split(vertices,triangles,right,rfit[0]))]
    capsules=[leaf[1][1] for leaf in leaves]
    validate_cover(vertices,triangles,capsules)
    return capsules
