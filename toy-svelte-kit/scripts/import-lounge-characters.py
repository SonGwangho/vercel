import copy
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zipfile
import zlib


def png_pixels(blob):
    cursor = 8
    compressed = []
    palette = []
    while cursor < len(blob):
        size = struct.unpack_from('>I', blob, cursor)[0]
        kind = blob[cursor + 4:cursor + 8]
        payload = blob[cursor + 8:cursor + 8 + size]
        cursor += size + 12
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            compressed.append(payload)
        elif kind == b'PLTE':
            palette = [tuple(payload[n:n + 3]) for n in range(0, len(payload), 3)]
    if depth != 8 or interlace:
        raise ValueError('Expected the original non-interlaced 8-bit Kenney palette')
    channels = {2: 3, 6: 4, 3: 1}[color]
    raw = zlib.decompress(b''.join(compressed))
    rows = []
    offset = 0
    for _ in range(height):
        kind = raw[offset]
        row = list(raw[offset + 1:offset + 1 + width * channels])
        offset += 1 + width * channels
        above = rows[-1] if rows else [0] * len(row)
        for n in range(len(row)):
            a = row[n - channels] if n >= channels else 0
            b = above[n]
            c = above[n - channels] if n >= channels else 0
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            paeth = a if pa <= pb and pa <= pc else b if pb <= pc else c
            predictor = (0, a, b, (a + b) // 2, paeth)[kind]
            row[n] = (row[n] + predictor) % 256
        rows.append(row)

    def sample(uv):
        x = min(width - 1, max(0, int(uv[0] * width)))
        y = min(height - 1, max(0, int(uv[1] * height)))
        pixel = rows[y][x * channels:x * channels + channels]
        return palette[pixel[0]] if color == 3 else pixel[:3]
    return sample


class Source:
    def __init__(self, blob):
        size = struct.unpack_from('<I', blob, 12)[0]
        self.doc = json.loads(blob[20:20 + size])
        self.binary = blob[28 + size:]

    def read(self, index):
        accessor = self.doc['accessors'][index]
        view = self.doc['bufferViews'][accessor['bufferView']]
        component = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}[accessor['componentType']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[accessor['type']]
        fmt = '<' + component * count
        step = struct.calcsize(fmt)
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        values = [list(struct.unpack_from(fmt, self.binary, start + n * view.get('byteStride', step))) for n in range(accessor['count'])]
        if accessor.get('normalized'):
            divisor = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[accessor['componentType']]
            values = [[max(-1, value / divisor) for value in row] for row in values]
        return values

    def triangles(self, mesh):
        primitive = self.doc['meshes'][mesh]['primitives'][0]
        attributes = {name: self.read(index) for name, index in primitive['attributes'].items()}
        indices = [v[0] for v in self.read(primitive['indices'])]
        vertices = [{name: values[n] for name, values in attributes.items()} for n in range(len(attributes['POSITION']))]
        return [[copy.deepcopy(vertices[i]) for i in indices[n:n + 3]] for n in range(0, len(indices), 3)]


def strip(vertex):
    u, v = vertex['TEXCOORD_0']
    return int(u * 16), int(v * 4)


def joint(vertex):
    weights = vertex['WEIGHTS_0']
    return vertex['JOINTS_0'][max(range(4), key=lambda n: weights[n])]


def clip(triangle, axis, limit, keep_above):
    polygon = triangle
    output = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        da = a['POSITION'][axis] - limit
        db = b['POSITION'][axis] - limit
        inside_a = da >= -1e-8 if keep_above else da <= 1e-8
        inside_b = db >= -1e-8 if keep_above else db <= 1e-8
        if inside_a:
            output.append(copy.deepcopy(a))
        if inside_a != inside_b:
            t = da / (da - db)
            vertex = {name: [x + (y - x) * t for x, y in zip(a[name], b[name])] for name in a}
            vertex['JOINTS_0'] = a['JOINTS_0'][:]
            vertex['WEIGHTS_0'] = a['WEIGHTS_0'][:]
            output.append(vertex)
    return [[output[0], output[n], output[n + 1]] for n in range(1, len(output) - 1)]


def colored(triangles, mode, sample):
    result = copy.deepcopy(triangles)
    for triangle in result:
        for vertex in triangle:
            if 'TEXCOORD_0' not in vertex:
                continue
            uv = vertex['TEXCOORD_0']
            shade = 0.82 + 0.18 * min(1, max(0, (0.975 - uv[1]) / 0.2))
            rgb = [239, 196, 156] if mode == 'skin' else sample(uv)
            vertex['COLOR_0'] = [shade] * 3 if mode == 'tint' else [((v / 255 / 12.92) if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) * (shade if mode == 'skin' else 1) for v in rgb]
    return result


def update_normals(triangles):
    for triangle in triangles:
        a, b, c = [vertex['POSITION'] for vertex in triangle]
        ab = [b[n] - a[n] for n in range(3)]
        ac = [c[n] - a[n] for n in range(3)]
        normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
        length = math.sqrt(sum(v * v for v in normal))
        if length > 1e-10:
            for vertex in triangle:
                vertex['NORMAL'] = [v / length for v in normal]


def face(points, bone, color):
    a, b, c = points[:3]
    ab = [b[n] - a[n] for n in range(3)]
    ac = [c[n] - a[n] for n in range(3)]
    normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    length = math.sqrt(sum(v * v for v in normal)) or 1
    normal = [v / length for v in normal]
    vertices = [{'POSITION': list(p), 'NORMAL': normal, 'COLOR_0': list(color), 'JOINTS_0': [bone, 0, 0, 0], 'WEIGHTS_0': [1, 0, 0, 0]} for p in points]
    return [[vertices[0], vertices[n], vertices[n + 1]] for n in range(1, len(vertices) - 1)]


def box(center, size, bone, color):
    x, y, z = center
    w, h, d = [v / 2 for v in size]
    points = [(x - w, y - h, z - d), (x + w, y - h, z - d), (x + w, y + h, z - d), (x - w, y + h, z - d), (x - w, y - h, z + d), (x + w, y - h, z + d), (x + w, y + h, z + d), (x - w, y + h, z + d)]
    result = []
    for indices in [(4, 5, 6, 7), (1, 0, 3, 2), (0, 4, 7, 3), (5, 1, 2, 6), (7, 6, 2, 3), (0, 1, 5, 4)]:
        result.extend(face([points[n] for n in indices], bone, color))
    return result


def ellipse(x, y, z, rx, ry, color, segments=20):
    return face([(x + math.cos(n * math.tau / segments) * rx, y + math.sin(n * math.tau / segments) * ry, z) for n in range(segments)], 6, color)


def arc(x, y, z, rx, ry, start, end, color, thickness=.0025):
    result = []
    for n in range(16):
        a = start + (end - start) * n / 16
        b = start + (end - start) * (n + 1) / 16
        result.extend(face([(x + math.cos(a) * (rx + thickness), y + math.sin(a) * (ry + thickness), z), (x + math.cos(b) * (rx + thickness), y + math.sin(b) * (ry + thickness), z), (x + math.cos(b) * (rx - thickness), y + math.sin(b) * (ry - thickness), z), (x + math.cos(a) * (rx - thickness), y + math.sin(a) * (ry - thickness), z)], 6, color))
    return result


def hair_volume(rings):
    outline = [(math.sin(n * math.tau / 12), math.cos(n * math.tau / 12)) for n in range(12)]
    layers = [[(x * w, y, z * d + shift) for x, z in outline] for y, w, d, shift in rings]
    result = []
    for row in range(len(layers) - 1):
        for n in range(12):
            m = (n + 1) % 12
            result.extend(face([layers[row][n], layers[row][m], layers[row + 1][m], layers[row + 1][n]], 6, (.94, .94, .94)))
    for n in range(12):
        m = (n + 1) % 12
        result.extend(face([(0,rings[0][0],rings[0][3]),layers[0][m],layers[0][n]],6,(.86,.86,.86)))
        result.extend(face([(0,rings[-1][0],rings[-1][3]),layers[-1][n],layers[-1][m]],6,(1,1,1)))
    return result


def bob_curtain():
    rings = [(.388,.205,.18),(.405,.218,.188),(.48,.222,.19),(.555,.208,.186),(.615,.17,.164)]
    columns = 20
    layers = []
    for inner in [0, 1]:
        layers.append([[(math.sin(math.pi * (.36 + n / columns * 1.28)) * (w - inner * .025), y, math.cos(math.pi * (.36 + n / columns * 1.28)) * (d - inner * .025) - .006) for n in range(columns + 1)] for y,w,d in rings])
    result = []
    for row in range(len(rings) - 1):
        for n in range(columns):
            result.extend(face([layers[0][row][n],layers[0][row][n+1],layers[0][row+1][n+1],layers[0][row+1][n]],6,(.94,.94,.94)))
            result.extend(face([layers[1][row][n+1],layers[1][row][n],layers[1][row+1][n],layers[1][row+1][n+1]],6,(.84,.84,.84)))
    for n in range(columns):
        result.extend(face([layers[1][0][n],layers[1][0][n+1],layers[0][0][n+1],layers[0][0][n]],6,(.88,.88,.88)))
        result.extend(face([layers[0][-1][n],layers[0][-1][n+1],layers[1][-1][n+1],layers[1][-1][n]],6,(1,1,1)))
    for row in range(len(rings) - 1):
        for n in [0, columns]:
            result.extend(face([layers[0][row][n],layers[0][row+1][n],layers[1][row+1][n],layers[1][row][n]],6,(.95,.95,.95)))
    return result


def skirt(length):
    bottom = .052 if length == 'long' else .118
    result = garment([(bottom,.185,.168), (bottom + .014,.184,.167), (.205,.15,.14)])
    for triangle in result:
        for vertex in triangle:
            x,y,_ = vertex['POSITION']
            blend = min(.65,max(0,(.205-y)/(.205-bottom)*.65))
            left = min(1,max(0,.5+x/.22))
            vertex['JOINTS_0'] = [3,1,2,0]
            vertex['WEIGHTS_0'] = [1-blend,blend*left,blend*(1-left),0]
    return result


def garment(rings, bone=3):
    outline = [(-.7, 1), (.7, 1), (1, .7), (1, -.7), (.7, -1), (-.7, -1), (-1, -.7), (-1, .7)]
    layers = [[(x * w, y, z * d - .02875) for x, z in outline] for y, w, d in rings]
    result = []
    for row in range(len(layers) - 1):
        for n in range(8):
            m = (n + 1) % 8
            result.extend(face([layers[row][n], layers[row][m], layers[row + 1][m], layers[row + 1][n]], bone, (.94, .94, .94)))
    for n in range(8):
        m = (n + 1) % 8
        result.extend(face([(0, rings[0][0], -.02875), layers[0][m], layers[0][n]], bone, (.88, .88, .88)))
        result.extend(face([(0, rings[-1][0], -.02875), layers[-1][n], layers[-1][m]], bone, (1, 1, 1)))
    return result


class Package:
    def __init__(self, source):
        self.doc = copy.deepcopy(source.doc)
        self.binary = bytearray(source.binary)
        self.doc['nodes'] = self.doc['nodes'][:8]
        self.doc['nodes'][0]['children'] = [1]
        self.doc['meshes'] = []
        self.doc['materials'] = [dict(name=name, pbrMetallicRoughness=dict(baseColorFactor=[1, 1, 1, 1], metallicFactor=0, roughnessFactor=roughness), doubleSided=True) for name, roughness in [('skin', .86), ('cloth', .96), ('hair', .8), ('details', .9)]]
        for key in ['images', 'textures', 'samplers', 'extensionsRequired']:
            self.doc.pop(key, None)
        self.doc['extensionsUsed'] = ['KHR_materials_unlit']
        self.doc['materials'].append(dict(name='face', pbrMetallicRoughness=dict(baseColorFactor=[1, 1, 1, 1], metallicFactor=0, roughnessFactor=1), extensions={'KHR_materials_unlit': {}}))
        self.doc['asset']['copyright'] = 'Kenney - Mini Characters 1.0, CC0. Modular adaptation for Lounge.'

    def attribute(self, values, kind, component=5126):
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        fmt = '<' + ('f' if component == 5126 else 'H') * len(values[0])
        for value in values:
            self.binary.extend(struct.pack(fmt, *value))
        self.doc['bufferViews'].append(dict(buffer=0, byteOffset=offset, byteLength=len(self.binary) - offset, target=34962))
        accessor = dict(bufferView=len(self.doc['bufferViews']) - 1, componentType=component, count=len(values), type=kind)
        if kind == 'VEC3':
            accessor['min'] = [min(v[n] for v in values) for n in range(3)]
            accessor['max'] = [max(v[n] for v in values) for n in range(3)]
        self.doc['accessors'].append(accessor)
        return len(self.doc['accessors']) - 1

    def mesh(self, name, triangles, material):
        if not triangles:
            return
        vertices = [v for t in triangles for v in t]
        attributes = {key: self.attribute([v[key] for v in vertices], kind, component) for key, kind, component in [('POSITION', 'VEC3', 5126), ('NORMAL', 'VEC3', 5126), ('COLOR_0', 'VEC3', 5126), ('JOINTS_0', 'VEC4', 5123), ('WEIGHTS_0', 'VEC4', 5126)]}
        if '_LOUNGE_ZONE' in vertices[0]:
            attributes['_LOUNGE_ZONE'] = self.attribute([v['_LOUNGE_ZONE'] for v in vertices], 'SCALAR')
        self.doc['meshes'].append(dict(name=name, primitives=[dict(attributes=attributes, material=material)]))
        node = dict(name=name, mesh=len(self.doc['meshes']) - 1, skin=0, extras=dict(loungePart=name))
        self.doc['nodes'].append(node)
        self.doc['nodes'][0]['children'].append(len(self.doc['nodes']) - 1)

    def save(self, path):
        self.doc['buffers'] = [dict(byteLength=len(self.binary))]
        payload = json.dumps(self.doc, separators=(',', ':')).encode()
        payload += b' ' * (-len(payload) % 4)
        self.binary += b'\0' * (-len(self.binary) % 4)
        path.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(payload) + len(self.binary)) + struct.pack('<II', len(payload), 0x4e4f534a) + payload + struct.pack('<II', len(self.binary), 0x004e4942) + self.binary)


def main(archive):
    root = Path(__file__).resolve().parents[1]
    target = root / 'static/models/lounge/kenney'
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as source_zip:
        sample = png_pixels(source_zip.read('Models/GLB format/Textures/colormap.png'))
        load = lambda name: Source(source_zip.read('Models/GLB format/character-' + name + '.glb'))
        source = load('male-f')
        package = Package(source)
        body = source.triangles(0)
        skin_strip = (11, 3)
        palm_triangles = []
        body_mesh = []
        for triangle in body:
            bone = joint(triangle[0])
            skin = strip(triangle[0]) == skin_strip
            y = sum(v['POSITION'][1] for v in triangle) / 3
            if bone in [4,5]:
                zone = 3 if skin else 2
                if bone == 5 and skin:
                    palm_triangles.extend(clip(triangle, 0, -.338, False))
            elif bone in [1,2]:
                zone = 0 if not skin and y < .085 else 5 if skin else 4
            else:
                zone = 7 if skin else 6 if y < .217 else 1
            part = colored([triangle], 'original' if zone == 0 else 'tint', sample)
            for vertex in part[0]:
                vertex['_LOUNGE_ZONE'] = [zone]
            body_mesh.extend(part)
        package.mesh('body_base', body_mesh, 1)
        package.mesh('skirt_short', skirt('short'), 1)
        package.mesh('skirt_long', skirt('long'), 1)
        head = source.triangles(1)
        head_skin = [t for t in head if strip(t[0]) == skin_strip]
        package.mesh('head_skin', colored(head_skin, 'skin', sample), 0)
        face_config = json.loads((root / 'src/lib/assets/data/lounge/character-face.json').read_text(encoding='utf-8'))
        ink = face_config['ink']
        z_face = face_config['surfaceZ']
        eye_x, eye_y = face_config['eyeX'], face_config['eyeY']
        rx, ry = face_config['eyeRadius']
        def eye(x):
            return ellipse(x,eye_y,z_face,rx,ry,ink) + ellipse(x-.004,eye_y+.006,z_face+.0004,.0035,.0045,(1,1,1),12)
        smile = arc(0,face_config['mouthY'],z_face,.021,.011,math.pi,math.tau,ink)
        package.mesh('face_default', eye(-eye_x) + eye(eye_x) + smile, 4)
        cheeks = ellipse(-.113,.448,z_face,.020,.008,face_config['blush']) + ellipse(.113,.448,z_face,.020,.008,face_config['blush'])
        package.mesh('face_blush', cheeks, 4)
        happy = arc(-eye_x,eye_y,z_face,.016,.009,0,math.pi,ink) + arc(eye_x,eye_y,z_face,.016,.009,0,math.pi,ink)
        package.mesh('face_laugh', happy + ellipse(0,.437,z_face,.018,.014,ink), 4)
        tease = eye(-eye_x) + arc(eye_x,eye_y,z_face,.016,.009,0,math.pi,ink) + ellipse(0,.436,z_face,.016,.008,ink) + ellipse(0,.423,z_face+.001,.010,.014,face_config['tongue'])
        package.mesh('face_tease', tease, 4)
        skin_strips = {'male-f': (11,3), 'male-d': (15,3), 'female-a': (13,3), 'female-f': (15,3)}
        def hair(name):
            triangles = load(name).triangles(1)
            return [t for t in triangles if strip(t[0]) != skin_strips[name] and strip(t[0])[1] == 3 and not all(.159 < v['POSITION'][2] < .1603 for v in t)]
        short = hair('male-f')
        bob = copy.deepcopy(short) + bob_curtain()
        long = copy.deepcopy(hair('male-d'))
        buzz = copy.deepcopy(short)
        spiky = copy.deepcopy(short)
        for triangle in long:
            for v in triangle:
                x,y,z = v['POSITION']
                if z < .1 and y < .53:
                    v['POSITION'][1] -= max(0, (.53 - y) / .14) * .14
        for triangle in buzz:
            for v in triangle:
                v['POSITION'][1] = max(.515, min(.667, v['POSITION'][1]))
        for triangle in spiky:
            for v in triangle:
                x,y,z = v['POSITION']
                v['POSITION'][1] += max(0, (y - .6) / .075) * (.02 + .05 * abs(math.sin(x * 30 + z * 20)))
        tails = copy.deepcopy(short)
        bun = hair('female-a')
        tuft = [t for t in bun if min(v['POSITION'][1] for v in t) > .66]
        for sign in [-1,1]:
            twin = copy.deepcopy(tuft)
            for t in twin:
                for v in t:
                    x,y,z = v['POSITION']
                    v['POSITION'] = [x * .65 + sign * .17, .56 + (y - .72) * 1.8, -.15 + (z + .2) * .75]
            tails.extend(twin)
        ponytail = copy.deepcopy(short) + hair_volume([(.325,.018,.025,-.285),(.36,.048,.045,-.30),(.43,.065,.05,-.30),(.51,.07,.055,-.26),(.575,.055,.045,-.205),(.615,.025,.025,-.17)])
        ponytail.extend(hair_volume([(.564,.059,.049,-.212),(.584,.059,.049,-.20)]))
        hairstyles = [('short',short),('bob',bob),('long',long),('ponytail',ponytail),('bun',bun),('twintails',tails),('spiky',spiky),('buzz',buzz)]
        for name,triangles in hairstyles:
            for triangle in triangles:
                for vertex in triangle:
                    x,y,z = vertex['POSITION']
                    if abs(x) < .13 and z > .145 and y < .525:
                        vertex['POSITION'][1] = .525
            update_normals(triangles)
            package.mesh('hair_' + name, colored(triangles,'tint',sample),2)
        palm = colored(palm_triangles, 'skin', sample)
        palm.extend(box((-.408,.287,.042),(.07,.025,.025),5,(.84,.59,.37)))
        package.mesh('hand_gesture', palm, 0)
        collar = face([(-.085,.34,.083),(-.015,.335,.085),(-.055,.288,.086)],3,(.93,.91,.85)) + face([(.085,.34,.083),(.055,.288,.086),(.015,.335,.085)],3,(.93,.91,.85))
        for y in [.25,.278,.306]:
            collar.extend(box((0,y,.083),(.006,.006,.002),3,(.93,.91,.85)))
        package.mesh('shirt_collar', collar, 3)
        hood = garment([(.28,.065,.025),(.35,.112,.052),(.39,.095,.042),(.41,.04,.015)])
        for t in hood:
            for v in t:
                v['POSITION'][2] -= .15
        package.mesh('hoodie_hood', hood, 1)
        strings = box((-.025,.31,.086),(.004,.055,.004),3,(.93,.91,.85)) + box((.025,.31,.086),(.004,.055,.004),3,(.93,.91,.85))
        package.mesh('hoodie_strings', strings, 3)
        package.save(target / 'characters.glb')
        (target / 'LICENSE.txt').write_text(source_zip.read('License.txt').decode().replace('\r',''), encoding='utf-8')
        (target / 'SOURCE.json').write_text(json.dumps(dict(author='Kenney', pack='Mini Characters 1.0', license='CC0-1.0', url='https://kenney.nl/assets/mini-characters', archiveSha256=hashlib.sha256(Path(archive).read_bytes()).hexdigest(), adaptation='Intact source body with shader-based clothing colors, closed weighted skirts, chin-length bob, single ponytail and soft facial expressions; original seven-bone rig and animations retained.'), indent=2) + '\n', encoding='utf-8')
        print('Imported Kenney Mini Characters:', len(package.doc['meshes']), 'parts,', len(package.doc['animations']), 'animations')


if __name__ == '__main__':
    main(Path(sys.argv[1]))
