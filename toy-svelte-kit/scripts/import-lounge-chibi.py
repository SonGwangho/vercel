import json
from pathlib import Path
import struct
import sys


SOURCE = 'https://sketchfab.com/3d-models/free-pack-chibi-base-mesh-rigged-fed4fb329f224f1594f631eae8d2626b'


def multiply(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def inverse_rigid(matrix):
    result = [matrix[row * 4 + col] if col < 3 and row < 3 else 0
              for col in range(4) for row in range(4)]
    for row in range(3):
        result[12 + row] = -sum(result[k * 4 + row] * matrix[12 + k] for k in range(3))
    result[15] = 1
    return result


def convert(source, destination):
    data = source.read_bytes()
    json_size = struct.unpack_from('<I', data, 12)[0]
    model = json.loads(data[20:20 + json_size])
    binary = data[28 + json_size:]
    nodes = model['nodes']
    skin = max(model['skins'], key=lambda item: len(item['joints']))
    accessor = model['accessors'][skin['inverseBindMatrices']]
    view = model['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    inverses = {node: struct.unpack_from('<16f', binary, offset + i * view.get('byteStride', 64))
                for i, node in enumerate(skin['joints'])}
    parents = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}
    roots = []
    for node, inverse in inverses.items():
        parent = parents.get(node)
        matrix = inverse_rigid(inverse)
        if parent in inverses:
            matrix = multiply(inverses[parent], matrix)
        else:
            roots.append(node)
        nodes[node]['matrix'] = matrix

    # The converted export has identity joint nodes and an FBX axis wrapper.
    # Its inverse bind matrices and vertices are already in the same Y-up space.
    meshes = [i for i, node in enumerate(nodes) if 'skin' in node]
    for node in nodes:
        if 'children' in node:
            node['children'] = [child for child in node['children'] if child not in roots + meshes]
    model['scenes'] = [{'name': 'LoungeChibi', 'nodes': [*roots, *meshes]}]
    model['scene'] = 0
    model.pop('animations', None)
    model['asset']['copyright'] = 'PolyOne Studio, Free Pack - Chibi Base Mesh (Rigged)'
    model['asset']['extras'] = {'source': SOURCE, 'changes': 'Restored joint transforms in mesh space.'}
    encoded = json.dumps(model, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(binary))
                            + struct.pack('<I4s', len(encoded), b'JSON') + encoded
                            + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


if __name__ == '__main__':
    app = Path(__file__).resolve().parents[1]
    convert(Path(sys.argv[1]), app / 'static/models/lounge/chibi/base.glb')
