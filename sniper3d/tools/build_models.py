# Blender(bpy)로 3D 스나이퍼 모델을 만들어 glb로 내보낸다.
# 실행: python build_models.py -- <출력 폴더>   (pip install bpy)
# 단위는 m. 사람은 발바닥이 원점, 앞이 +Y(glTF로 내보내면 three.js에서 +Z가 앞).
# 부위마다 따로 된 물체이고 재질 이름(skin, hair, shirt, pants, shoe, hat, case, umbrella, bag, glass ...)으로
# 게임에서 색을 바꾼다. 팔·다리는 어깨·엉덩이에 원점이 있어 회전시키면 걷는다.
import bpy, bmesh, math, os, sys

OUT = sys.argv[-1]
os.makedirs(OUT, exist_ok=True)
MATS = {}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()

def mat(name, color, emit=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m

def finish(o, material, bevel=0.0, segs=1):
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'ANGLE'
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='bevel')
    o.data.materials.clear(); o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth = False
    return o

def box(name, size, loc, material, bevel=0.02, parent=None, origin=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    finish(o, material, bevel)
    if origin is not None: set_origin(o, origin)
    if parent: keep_parent(o, parent)
    return o

def sphere(name, r, loc, material, sub=1, scale=(1, 1, 1), parent=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    finish(o, material)
    if parent: keep_parent(o, parent)
    return o

def cyl(name, r, depth, loc, material, verts=8, rot=(0, 0, 0), parent=None, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    bpy.ops.object.transform_apply(rotation=True)
    finish(o, material)
    if parent: keep_parent(o, parent)
    return o

def set_origin(o, p):
    cur = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = p
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = cur

def keep_parent(child, parent):
    m = child.matrix_world.copy(); child.parent = parent; child.matrix_world = m

def export(name):
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_apply=True, export_yup=True)

# ---------- 사람 ----------
def person():
    reset()
    skin, hair, shirt, pants, shoe = mat('skin', (0.9, 0.7, 0.55)), mat('hair', (0.15, 0.1, 0.06)), mat('shirt', (0.3, 0.4, 0.7)), mat('pants', (0.15, 0.17, 0.25)), mat('shoe', (0.06, 0.05, 0.05))
    root = bpy.data.objects.new('person', None); bpy.context.collection.objects.link(root)
    hip = 0.9
    for side, x in (('L', 0.1), ('R', -0.1)):
        leg = box(f'leg{side}', (0.15, 0.17, 0.82), (x, 0, hip - 0.41 + 0.03), pants, 0.025, root, origin=(x, 0, hip))
        box(f'shoe{side}', (0.16, 0.26, 0.09), (x, 0.04, 0.045), shoe, 0.02, leg)
    torso = box('torso', (0.42, 0.24, 0.6), (0, 0, hip + 0.3), shirt, 0.04, root)
    box('collar', (0.2, 0.18, 0.05), (0, 0, hip + 0.62), shirt, 0.01, torso)
    for side, x in (('L', 0.27), ('R', -0.27)):
        arm = box(f'arm{side}', (0.12, 0.14, 0.58), (x, 0, hip + 0.55 - 0.29), shirt, 0.025, root, origin=(x, 0, hip + 0.55))
        box(f'hand{side}', (0.1, 0.11, 0.1), (x, 0, hip + 0.55 - 0.62), skin, 0.02, arm)
    box('neck', (0.1, 0.1, 0.08), (0, 0, hip + 0.64), skin, 0.0, root)
    head = box('head', (0.22, 0.24, 0.24), (0, 0, 1.62), skin, 0.05, root)
    box('hair', (0.24, 0.26, 0.08), (0, -0.01, 1.73), hair, 0.03, head)
    box('hairBack', (0.24, 0.06, 0.16), (0, -0.115, 1.66), hair, 0.02, head)
    box('eyes', (0.16, 0.02, 0.03), (0, 0.121, 1.64), mat('eye', (0.05, 0.04, 0.04)), 0.0, head)
    box('glasses', (0.2, 0.03, 0.05), (0, 0.13, 1.64), mat('glass', (0.02, 0.02, 0.03)), 0.0, head)
    # 모자 두 가지
    cap = cyl('hatCap', 0.13, 0.08, (0, 0, 1.77), mat('hat', (0.8, 0.15, 0.12)), verts=10, parent=head)
    box('hatCapBrim', (0.2, 0.14, 0.02), (0, 0.13, 1.735), MATS['hat'], 0.0, cap)
    fed = cyl('hatFedora', 0.12, 0.12, (0, 0, 1.8), MATS['hat'], verts=10, parent=head)
    cyl('hatFedoraBrim', 0.21, 0.02, (0, 0, 1.745), MATS['hat'], verts=12, parent=fed)
    # 소지품: 서류가방(오른손), 우산(오른손으로 머리 위), 배낭(등)
    handR = bpy.data.objects['handR']
    box('case', (0.08, 0.34, 0.26), (-0.27, 0.0, hip - 0.24), mat('case', (0.35, 0.2, 0.08)), 0.015, handR)
    umb = cyl('umbrella', 0.55, 0.28, (0, 0.05, 2.12), mat('umbrella', (0.12, 0.12, 0.16)), verts=8, r2=0.03, parent=root)
    cyl('umbrellaShaft', 0.012, 0.72, (0, 0.05, 1.72), mat('metal', (0.2, 0.2, 0.2)), verts=6, parent=umb)
    box('bag', (0.34, 0.16, 0.42), (0, -0.2, hip + 0.32), mat('bag', (0.2, 0.32, 0.2)), 0.04, torso)
    export('person')

# ---------- 차 ----------
def car():
    reset()
    body, glass, tire, light, rim = mat('body', (0.7, 0.15, 0.12)), mat('carGlass', (0.15, 0.22, 0.3)), mat('tire', (0.04, 0.04, 0.04)), mat('light', (1, 0.95, 0.75), emit=2), mat('rim', (0.6, 0.6, 0.62))
    root = bpy.data.objects.new('car', None); bpy.context.collection.objects.link(root)
    box('body', (1.8, 4.4, 0.62), (0, 0, 0.62), body, 0.08, root)
    box('cabin', (1.6, 2.3, 0.55), (0, -0.25, 1.18), body, 0.1, root)
    box('glassSide', (1.62, 2.0, 0.38), (0, -0.25, 1.2), glass, 0.04, root)
    box('glassFront', (1.5, 0.08, 0.4), (0, 0.92, 1.18), glass, 0.0, root)
    for x in (0.86, -0.86):
        for y in (1.35, -1.35):
            w = cyl('wheel', 0.34, 0.24, (x, y, 0.34), tire, verts=10, rot=(0, math.pi / 2, 0), parent=root)
            cyl('rim', 0.18, 0.26, (x, y, 0.34), rim, verts=8, rot=(0, math.pi / 2, 0), parent=w)
    for x in (0.6, -0.6):
        box('headlight', (0.32, 0.05, 0.14), (x, 2.2, 0.75), light, 0.0, root)
        box('taillight', (0.3, 0.05, 0.12), (x, -2.2, 0.78), mat('tail', (0.9, 0.1, 0.08), emit=1.5), 0.0, root)
    export('car')

# ---------- 나무, 가로등 ----------
def tree():
    reset()
    root = bpy.data.objects.new('tree', None); bpy.context.collection.objects.link(root)
    cyl('trunk', 0.18, 2.6, (0, 0, 1.3), mat('trunk', (0.3, 0.2, 0.12)), verts=6, parent=root)
    leaf = mat('leaf', (0.22, 0.45, 0.2))
    for (x, y, z, r) in ((0, 0, 3.4, 1.5), (0.7, 0.3, 2.9, 1.0), (-0.6, -0.4, 3.0, 1.1), (0.2, -0.6, 4.1, 0.9)):
        sphere('leaves', r, (x, y, z), leaf, sub=1, parent=root)
    export('tree')

def lamp():
    reset()
    root = bpy.data.objects.new('lamp', None); bpy.context.collection.objects.link(root)
    pole = mat('pole', (0.18, 0.19, 0.21))
    cyl('pole', 0.07, 6, (0, 0, 3), pole, verts=6, parent=root)
    box('arm', (0.08, 1.2, 0.08), (0, 0.55, 5.95), pole, 0.0, root)
    box('head', (0.36, 0.6, 0.16), (0, 1.1, 5.85), pole, 0.03, root)
    box('bulb', (0.28, 0.5, 0.04), (0, 1.1, 5.76), mat('lampLight', (1, 0.92, 0.7), emit=3), 0.0, root)
    export('lamp')

# ---------- 저격총(화면 오른쪽 아래, 전체 보기용) ----------
def rifle():
    reset()
    root = bpy.data.objects.new('rifle', None); bpy.context.collection.objects.link(root)
    metal, wood = mat('gun', (0.08, 0.09, 0.1)), mat('stock', (0.32, 0.2, 0.1))
    cyl('barrel', 0.025, 1.0, (0, 0.75, 0), metal, verts=8, rot=(math.pi / 2, 0, 0), parent=root)
    box('receiver', (0.08, 0.5, 0.1), (0, 0.05, 0), metal, 0.01, root)
    box('stock', (0.07, 0.6, 0.16), (0, -0.48, -0.04), wood, 0.02, root)
    cyl('scope', 0.04, 0.42, (0, 0.08, 0.1), metal, verts=10, rot=(math.pi / 2, 0, 0), parent=root)
    cyl('scopeLens', 0.05, 0.08, (0, 0.32, 0.1), metal, verts=10, rot=(math.pi / 2, 0, 0), parent=root)
    export('rifle')

person(); car(); tree(); lamp(); rifle()
print('done', sorted(os.listdir(OUT)))
