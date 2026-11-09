#!/usr/bin/env python3
"""Baixa somente Empresas/Estabelecimentos e domínios do repositório público oficial."""
import argparse
import base64
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

HOST = 'https://arquivos.receitafederal.gov.br'
DIRECTORY = '/public.php/webdav/Dados/Cadastros/CNPJ/'


def public_token():
    with urllib.request.urlopen(HOST + '/', timeout=30) as response:
        html = response.read().decode('utf-8')
    match = re.search(r'id="initial-state-files_sharing-sharingToken"[^>]*value="([^"]+)"', html)
    if not match:
        raise RuntimeError('O repositório mudou. Confira a página oficial da Receita.')
    token = json.loads(base64.b64decode(match.group(1)))
    if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9]+', token):
        raise RuntimeError('Identificador público inválido.')
    return token


def request(path, token, method='GET', headers=None):
    return urllib.request.Request(HOST + path, method=method, headers={
        'Authorization': 'Basic ' + base64.b64encode((token + ':').encode()).decode(),
        **(headers or {}),
    })


def listing(path, token):
    with urllib.request.urlopen(request(path, token, 'PROPFIND', {'Depth': '1'}), timeout=30) as response:
        document = ET.fromstring(response.read())
    result = {}
    for item in document.findall('{DAV:}response'):
        href = urllib.parse.unquote(item.findtext('{DAV:}href') or '')
        if href.rstrip('/') == path.rstrip('/'):
            continue
        result[href.rstrip('/').rsplit('/', 1)[-1]] = int(item.findtext('.//{DAV:}getcontentlength') or 0)
    return result


def download(path, output, size, token):
    if output.is_file() and output.stat().st_size == size and zipfile.is_zipfile(output):
        print(f'{output.name}: já disponível.', flush=True)
        return
    partial = output.with_suffix('.zip.part')
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {'Range': f'bytes={offset}-'} if 0 < offset < size else {}
    with urllib.request.urlopen(request(path, token, headers=headers), timeout=60) as response:
        append = bool(headers) and response.status == 206 and response.headers.get('Content-Range', '').startswith(f'bytes {offset}-')
        with partial.open('ab' if append else 'wb') as stream:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                stream.write(chunk)
    if partial.stat().st_size != size or not zipfile.is_zipfile(partial):
        raise RuntimeError(f'{output.name}: download incompleto; execute novamente para retomar.')
    partial.replace(output)
    print(f'{output.name}: {size / 1024**2:.1f} MB baixados.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--month', help='Competência AAAA-MM; padrão: última publicada.')
    parser.add_argument('--output', required=True, help='Pasta de destino dos ZIPs; use uma pasta por competência.')
    parser.add_argument('--parts', default='0,1,2,3,4,5,6,7,8,9', help='Partes 0 a 9 de Empresas e Estabelecimentos; recortes são cargas parciais.')
    parser.add_argument('--check', action='store_true', help='Lista arquivos e tamanho, sem baixar.')
    args = parser.parse_args()
    parts = args.parts.split(',')
    if not parts or any(not re.fullmatch('[0-9]', p) for p in parts):
        parser.error('Partes devem ser números de 0 a 9 separados por vírgula.')
    token = public_token()
    months = sorted(name for name in listing(DIRECTORY, token) if re.fullmatch(r'\d{4}-\d{2}', name))
    month = args.month or (months[-1] if months else '')
    if month not in months:
        parser.error('Competência não encontrada no repositório oficial.')
    remote = DIRECTORY + month + '/'
    files = listing(remote, token)
    names = ['Cnaes.zip', 'Municipios.zip'] + [f'{kind}{part}.zip' for kind in ('Empresas', 'Estabelecimentos') for part in sorted(set(parts))]
    if any(not files.get(name) for name in names):
        raise RuntimeError('Publicação incompleta: faltam arquivos na competência escolhida.')
    print(f'Receita Federal · {month} · {sum(files[name] for name in names) / 1024**3:.2f} GB compactados.', flush=True)
    if args.check:
        for name in names:
            print(f'{name}: {files[name]} bytes')
        return
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / 'fonte.json'
    expected = {'month': month, 'source': HOST + remote, 'files': {name: files[name] for name in names}}
    if manifest.exists() and json.loads(manifest.read_text()).get('month') != month:
        raise RuntimeError('A pasta contém outra competência. Use uma pasta separada.')
    manifest.write_text(json.dumps(expected, ensure_ascii=False, indent=2))
    for name in names:
        download(remote + name, output / name, files[name], token)


if __name__ == '__main__':
    main()
