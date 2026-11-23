#!/usr/bin/env python3
# -*- coding: utf-8 -*-
\"\"\"
Validador e Inspetor de Arquivos GLB / glTF 2.0
Gerado automaticamente pelo CODEX-IDE para: character_suit.glb
\"\"\"
import sys
import os
import struct
import json

def inspect_glb(file_path):
    if not os.path.isfile(file_path):
        print(f"[-] Erro: Arquivo '{file_path}' não encontrado.")
        return 1

    file_size = os.path.getsize(file_path)
    print("=" * 60)
    print(f" DIAGNÓSTICO DO MODELO 3D: {os.path.basename(file_path)}")
    print("=" * 60)
    print(f"Caminho: {file_path}")
    print(f"Tamanho Físico: {file_size} bytes ({file_size / 1024:.2f} KB)")

    if file_size < 12:
        print("[-] Erro Crítico: Arquivo menor que o cabeçalho mínimo GLB (12 bytes).")
        return 1

    with open(file_path, "rb") as f:
        magic = f.read(4)
        if magic != b"glTF":
            print(f"[-] Erro de Formato: Magic header é '{magic}' (esperado b'glTF').")
            print("    O arquivo foi gravado como texto puro ou JSON em vez de binário!")
            return 1

        version, length = struct.unpack("<II", f.read(8))
        print(f"[+] Magic Header: glTF válido (0x46546C67)")
        print(f"[+] Versão glTF: {version}")
        print(f"[+] Comprimento no Header: {length} bytes")

        if length != file_size:
            print(f"[!] Aviso: Tamanho no cabeçalho ({length}) difere do arquivo ({file_size}).")

        chunk0_header = f.read(8)
        if len(chunk0_header) < 8:
            print("[-] Erro: Chunk 0 incompleto.")
            return 1

        chunk0_len, chunk0_type = struct.unpack("<II", chunk0_header)
        if chunk0_type != 0x4E4F534A: # 'JSON'
            print(f"[-] Erro: Chunk 0 não é do tipo JSON. Tipo recebido: {hex(chunk0_type)}")
            return 1

        json_bytes = f.read(chunk0_len)
        try:
            gltf_data = json.loads(json_bytes.decode("utf-8"))
        except Exception as e:
            print(f"[-] Erro ao decodificar JSON do Chunk 0: {e}")
            return 1

        print(f"[+] Chunk 0 (JSON Metadata): {chunk0_len} bytes")

        remaining = length - (12 + 8 + chunk0_len)
        if remaining >= 8:
            chunk1_header = f.read(8)
            if len(chunk1_header) == 8:
                chunk1_len, chunk1_type = struct.unpack("<II", chunk1_header)
                if chunk1_type == 0x004E4942: # 'BIN\0'
                    print(f"[+] Chunk 1 (BIN Buffer): {chunk1_len} bytes")

        print("\n--- Estrutura e Recursos 3D ---")
        nodes = gltf_data.get("nodes", [])
        meshes = gltf_data.get("meshes", [])
        materials = gltf_data.get("materials", [])
        skins = gltf_data.get("skins", [])
        animations = gltf_data.get("animations", [])

        print(f"• Nós na Cena (Nodes): {len(nodes)}")
        for idx, node in enumerate(nodes[:8]):
            print(f"    - [{idx}] {node.get('name', 'SemNome')}")
        if len(nodes) > 8:
            print(f"    - ... mais {len(nodes) - 8} nós")

        print(f"• Malhas (Meshes): {len(meshes)}")
        for idx, mesh in enumerate(meshes):
            prim_count = len(mesh.get("primitives", []))
            print(f"    - [{idx}] {mesh.get('name', 'Mesh')}: {prim_count} primitiva(s)")

        print(f"• Materiais PBR: {len(materials)}")
        for idx, mat in enumerate(materials):
            print(f"    - [{idx}] {mat.get('name', 'Material')}")

        print(f"• Esqueletos (Skins): {len(skins)}")
        for idx, skin in enumerate(skins):
            joints = len(skin.get("joints", []))
            print(f"    - [{idx}] {skin.get('name', 'Skin')}: {joints} ossos/articulações (joints)")

        print(f"• Animações (Clips): {len(animations)}")
        if not animations:
            print("    (Nenhuma animação encontrada)")
        else:
            for idx, anim in enumerate(animations):
                name = anim.get("name", f"Animation_{idx}")
                channels = len(anim.get("channels", []))
                samplers = len(anim.get("samplers", []))
                print(f"    ▶ [{idx + 1}] '{name}' -> {channels} canal(is) de keyframe, {samplers} sampler(s)")

        print("\n[OK] Modelo 3D GLB íntegro e validado com sucesso!")
        return 0

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "character_suit.glb"
    if not os.path.exists(target):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        cand = os.path.join(script_dir, "character_suit.glb")
        if os.path.exists(cand):
            target = cand
    sys.exit(inspect_glb(target))
