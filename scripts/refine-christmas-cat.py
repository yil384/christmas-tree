"""Refine the previously shipped CC0 kitten while preserving authored animation.

Requires Python 3 and NumPy. Run manually, not during the web build:
  python scripts/refine-christmas-cat.py --input original.glb --output refined.glb

The exact input asset is available in repository history before this refinement.
Its SHA-256 is checked so this operation cannot accidentally compound itself.
Blender is used only for offline visual QA; this script does not require Blender.
"""
import argparse,hashlib,json,struct,math
from pathlib import Path
import numpy as np
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
b=args.input.read_bytes()
if hashlib.sha256(b).hexdigest() != 'db1e7efbb24a3c7a8211b5613660462bf0b6376871f8afe7db22e2b362228885':
 raise ValueError('Expected the original pre-refinement kitten GLB; do not apply twice.')
jl=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jl]);blen=struct.unpack_from('<I',b,20+jl)[0];binary=b[28+jl:28+jl+blen]
DT={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'};S={'VEC3':3,'VEC4':4,'SCALAR':1,'MAT4':16}
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);sz=S[a['type']];return np.ndarray((a['count'],sz),dtype=dt,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',sz*dt.itemsize),dt.itemsize)).copy()
p,c,jo,w,n,blink=[acc(i) for i in range(6)];idx=acc(6).reshape((-1,3));origp=p.copy();body_count=1617;oldc=c.copy()
head=np.where(jo==3,w,0).sum(1);tail=np.where((jo>=10)&(jo<=13),w,0).sum(1)
# Keep the exact skin transforms. A compact scale affects the entire rig, including paws.
j['nodes'][37]['scale'][0]*=.90;j['nodes'][37]['scale'][1]*=.92
# Rounded juvenile head and cheek volume, with a shorter soft muzzle.
p[:,0]+=head*(p[:,0]-2.44)*.10
p[:,1]+=head*p[:,1]*.28
p[:,2]+=head*(p[:,2]-2.78)*.18
muzzle=head*np.clip((origp[:,0]-2.73)/.43,0,1)*np.exp(-((origp[:,2]-2.55)/.25)**2)
p[:,0]-=.12*muzzle
cheek=head*np.exp(-((origp[:,0]-2.54)/.4)**2-((origp[:,2]-2.48)/.36)**2)
p[:,1]+=np.sign(origp[:,1])*.06*cheek
blink[:,1]*=1+head*.28;blink[:,2]*=1+head*.18
# Full chest, rounded flanks, and more substantial forelegs/paws.
body=(1-head)*(1-tail)*np.clip((origp[:,2]-.55)/.8,0,1)
p[:,1]*=1+body*.13
for groups,cy in [([4,5,6],-.40),([7,8,9],.40),([14,15,16],.53),([17,18,19],-.53)]:
 weight=np.where(np.isin(jo,groups),w,0).sum(1);leg=weight*np.clip((1.55-origp[:,2])/.9,0,1)
 p[:,1]+=leg*(origp[:,1]-cy)*.32
# Quiet silver coat with warm white muzzle, chest and feet; painted pink remains.
base=np.array([.285,.30,.31]);cream=np.array([.65,.64,.59]);light=np.clip((oldc[:body_count].mean(1)-.23)/.50,0,1)
c[:body_count]=base*(1-light[:,None])+cream*light[:,None]
pink=(oldc[:body_count,0]>oldc[:body_count,2]*1.35)&(oldc[:body_count,0]>oldc[:body_count,1]*1.18);c[:body_count][pink]=[.48,.23,.26]
for start in [1734,2202]:c[start:start+117]=[.22,.40,.34]
for start in [1968,2436]:c[start:start+117]=[.85,.86,.80]
# Slightly soften eye rims from ink-black to warm charcoal.
for start in [1617,2085]:c[start:start+117]=[.034,.041,.042]
# Reshape the existing connected tail, preserving every vertex/face at its insertion.
# The deformation fades in only above the hip, so skinning cannot open a new seam.
knots=np.array([[2.65,-1.84,2.65],[3.00,-2.06,3.04],[3.35,-2.18,3.42],[3.70,-2.13,3.76],[4.00,-1.92,3.94],[4.25,-1.65,3.91],[4.41681,-1.55,3.75]])
for vi in range(body_count):
 if tail[vi]<.25 or origp[vi,2]<2.60:continue
 z=origp[vi,2];fade=np.clip((z-2.60)/.48,0,1);fade=fade*fade*(3-2*fade)
 oldcx=np.interp(z,[2.6,2.8,3.2,3.7,4.2,4.41681],[-1.82,-1.92,-2.15,-2.27,-2.25,-2.25])
 cx=np.interp(z,knots[:,0],knots[:,1]);cz=np.interp(z,knots[:,0],knots[:,2])
 cz0=np.interp(z-.03,knots[:,0],knots[:,2]);cz1=np.interp(z+.03,knots[:,0],knots[:,2]);cx0=np.interp(z-.03,knots[:,0],knots[:,1]);cx1=np.interp(z+.03,knots[:,0],knots[:,1]);tan=np.array([cx1-cx0,0,cz1-cz0]);tan/=max(np.linalg.norm(tan),1e-8)
 radial=np.array([tan[2],0,-tan[0]])
 t=np.clip((z-2.65)/1.77,0,1);full=1.7+.35*math.sin(math.pi*t);taper=1-.42*np.clip((t-.77)/.23,0,1)
 shaped=np.array([cx,0,cz])+radial*(origp[vi,0]-oldcx)*full*taper+np.array([0,origp[vi,1]*full*taper,0])
 blend=fade*min(1,tail[vi]*1.5);p[vi]=p[vi]*(1-blend)+shaped*blend
P=list(p);C=list(c);J=list(jo);WE=list(w);B=list(blink);I=idx.tolist()

# Discard the small flat ring eyes, rebuild rounded eye volumes with calm pupils.
I=[tri for tri in I if max(tri)<1617 or min(tri)>=len(p)]

def ellipsoid(center, axes, radii, color, joints, weights, blink_center=None, rings=8, segments=16):
 start=len(P);center=np.array(center);axes=np.array(axes);radii=np.array(radii)
 for row in range(rings+1):
  theta=math.pi*row/rings
  for col in range(segments):
   phi=2*math.pi*col/segments
   offset=axes@np.array([radii[0]*math.sin(theta)*math.cos(phi),radii[1]*math.sin(theta)*math.sin(phi),radii[2]*math.cos(theta)])
   pos=center+offset;P.append(pos);C.append(color);J.append(joints);WE.append(weights)
   B.append([0,0,-(pos[2]-blink_center)*.94] if blink_center is not None else [0,0,0])
 for row in range(rings):
  for col in range(segments):
   a=start+row*segments+col;bn=start+row*segments+(col+1)%segments;cc=a+segments;d=bn+segments
   I.extend([[a,cc,bn],[bn,cc,d]])

for side in [-1,1]:
 # Outward surface basis: world-sized eyes stay modest against the fuller head.
 normal=np.array([.95,side*.285,.11]);normal/=np.linalg.norm(normal)
 horizontal=np.cross([0,0,1],normal);horizontal/=np.linalg.norm(horizontal);vertical=np.cross(normal,horizontal)
 axes=np.column_stack([horizontal,vertical,normal]);center=np.array([2.915,side*.365,2.944]);bz=center[2]
 # Soft recessed rim, then iris and the soft oval pupil, each following the head bone.
 ellipsoid(center-normal*.012,axes,[.116,.105,.040],[.048,.057,.056],[3,0,0,0],[1,0,0,0],bz)
 ellipsoid(center+normal*.018,axes,[.100,.088,.024],[.235,.40,.34],[3,0,0,0],[1,0,0,0],bz)
 ellipsoid(center+normal*.040,axes,[.058,.071,.013],[.007,.012,.014],[3,0,0,0],[1,0,0,0],bz)
 ellipsoid(center+normal*.053+horizontal*(-.025)+vertical*.028,axes,[.017,.020,.006],[.91,.93,.87],[3,0,0,0],[1,0,0,0],bz,rings=6,segments=12)
# A small rounded red kerchief point visible below the chin, attached to the neck.
scarf_start=len(P)
for point in [[2.36,-.36,2.17],[2.37,-.20,1.99],[2.38,0,1.87],[2.37,.20,1.99],[2.36,.36,2.17],[2.38,0,2.20]]:
 P.append(point);C.append([.38,.025,.043]);J.append([2,3,1,0]);WE.append([.65,.20,.15,0]);B.append([0,0,0])
I.extend([[scarf_start+5,scarf_start+k,scarf_start+k+1] for k in range(4)])

P=np.array(P,dtype='<f4');C=np.array(C,dtype='<f4');J=np.array(J,dtype='<u2');WE=np.array(WE,dtype='<f4');B=np.array(B,dtype='<f4');I=np.array(I,dtype='<u2');used=np.unique(I);remap=np.empty(len(P),np.uint16);remap[used]=np.arange(len(used));P=P[used];C=C[used];J=J[used];WE=WE[used];B=B[used];I=remap[I];N=np.zeros_like(P)
fn=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
for k in range(3):np.add.at(N,I[:,k],fn)
mag=np.linalg.norm(N,axis=1);N/=np.where(mag>1e-10,mag,1)[:,None]
# Isolated old vertices retained for stable index/source references get a valid normal.
N[mag<1e-10]=[0,0,1]
arrays=[P,C,J,WE,N,B,I.reshape((-1,1))];replacements={}
for ai,array in enumerate(arrays):
 a=j['accessors'][ai];vi=a['bufferView'];a['count']=len(array);a['min']=array.min(0).tolist();a['max']=array.max(0).tolist();replacements[vi]=array.tobytes();j['bufferViews'][vi].pop('byteStride',None)
j['materials'][0]['name']='Matte silver-white kitten and red kerchief';j['materials'][0]['pbrMetallicRoughness']['roughnessFactor']=.96
# Remove importer-only metadata, preserving every real bone transform and clip byte.
for node in j['nodes']:node.pop('extras',None)
out=bytearray()
for vi,v in enumerate(j['bufferViews']):
 data=replacements.get(vi)
 if data is None:data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 while len(out)%4:out.append(0)
 v['byteOffset']=len(out);v['byteLength']=len(data);out.extend(data)
while len(out)%4:out.append(0)
j['buffers']=[{'byteLength':len(out)}];js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
final=struct.pack('<III',0x46546c67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(out),0x004e4942)+out
args.output.write_bytes(final);print('Wrote',len(final),'bytes',len(P),'vertices',len(I),'triangles; scales',j['nodes'][37]['scale'])
