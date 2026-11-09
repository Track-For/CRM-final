"""Diretório CNPJ separado dos leads. Importa ZIPs oficiais sem extraí-los no disco."""
import argparse
import contextlib
import csv
import datetime
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import unicodedata
import zipfile

UFS = set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split())


def normal(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c)).upper().strip()


def database(data_dir):
    return Path(data_dir) / 'receita.sqlite3'


@contextlib.contextmanager
def connect(data_dir):
    path = database(data_dir)
    if not path.is_file():
        raise ValueError('Base da Receita ainda não carregada.')
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    try:
        yield db
    finally:
        db.close()


def status(data_dir):
    if not database(data_dir).is_file():
        return {'loaded': False, 'total': 0}
    with connect(data_dir) as db:
        regions = {}
        for row in db.execute('SELECT DISTINCT uf,cidade FROM establishments ORDER BY uf,cidade_key'):
            regions.setdefault(row['uf'], []).append(row['cidade'])
        return {'loaded': True, **json.loads(db.execute('SELECT data FROM metadata').fetchone()[0]), 'regions': regions}


def csv_rows(path):
    # UTF-8 não é o encoding dos arquivos originais da RFB: leia Latin-1.
    with zipfile.ZipFile(path) as archive:
        members = [m for m in archive.infolist() if not m.is_dir()]
        if len(members) != 1:
            raise ValueError(f'{path.name}: esperado um CSV por ZIP.')
        with archive.open(members[0]) as raw, io.TextIOWrapper(raw, encoding='latin-1', newline='') as stream:
            yield from csv.reader(stream, delimiter=';')


def import_directory(source, data_dir, uf, month, city='', allow_partial=False, progress=False):
    if uf not in UFS | {'BR'} or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', month):
        raise ValueError('Informe UF válida e competência AAAA-MM.')
    source = Path(source)
    manifest = source / 'fonte.json'
    if manifest.exists() and json.loads(manifest.read_text()).get('month') != month:
        raise ValueError('A competência informada difere da fonte baixada.')
    groups = {kind: sorted(source.glob(kind + '*.zip')) for kind in ('Estabelecimentos', 'Empresas')}
    partial = any({p.name for p in groups[kind]} != {f'{kind}{i}.zip' for i in range(10)} for kind in groups)
    if partial and not allow_partial:
        raise ValueError('Faltam partes Empresas0..9.zip ou Estabelecimentos0..9.zip. Use --allow-partial apenas para carga parcial identificada.')
    if not all(groups.values()) or not all((source / name).is_file() for name in ('Cnaes.zip', 'Municipios.zip')):
        raise ValueError('Forneça Empresas, Estabelecimentos, Cnaes.zip e Municipios.zip da mesma competência.')
    cities = dict(csv_rows(source / 'Municipios.zip'))
    city_codes = {code for code, name in cities.items() if normal(name) == normal(city)} if city else set()
    if city and not city_codes:
        raise ValueError('Município não encontrado na tabela da Receita.')
    Path(data_dir).mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(prefix='receita-import-', suffix='.sqlite3', dir=data_dir)
    os.close(handle)
    db = sqlite3.connect(temp)
    try:
        db.executescript('''
          CREATE TABLE establishments(cnpj TEXT PRIMARY KEY, base TEXT NOT NULL, nome TEXT NOT NULL,
            razao TEXT NOT NULL DEFAULT '', cnae TEXT NOT NULL, cidade TEXT NOT NULL, cidade_key TEXT NOT NULL,
            uf TEXT NOT NULL, bairro TEXT NOT NULL, endereco TEXT NOT NULL, telefone TEXT NOT NULL,
            email TEXT NOT NULL, abertura TEXT NOT NULL);
          CREATE TABLE activities(codigo TEXT PRIMARY KEY, descricao TEXT NOT NULL, search TEXT NOT NULL);
          CREATE TABLE secondary(cnae TEXT NOT NULL, cnpj TEXT NOT NULL, PRIMARY KEY(cnae,cnpj));
          CREATE TABLE metadata(data TEXT NOT NULL);
        ''')
        db.executemany('INSERT INTO activities VALUES(?,?,?)', ((code, desc, normal(desc)) for code, desc in csv_rows(source / 'Cnaes.zip')))
        count = 0
        for path in groups['Estabelecimentos']:
            for r in csv_rows(path):
                if len(r) != 30:
                    raise ValueError(f'{path.name}: layout de estabelecimento inválido ({len(r)} colunas).')
                if (uf != 'BR' and r[19] != uf) or r[19] not in UFS or r[5] != '02' or (city_codes and r[20] not in city_codes):
                    continue
                if not re.fullmatch(r'[A-Z0-9]{12}\d{2}', ''.join(r[:3])) or not re.fullmatch(r'\d{7}', r[11]):
                    raise ValueError(f'{path.name}: CNPJ ou CNAE inválido.')
                cnpj = ''.join(r[:3])
                phone = re.sub(r'\D', '', r[21] + r[22])
                address = ' '.join(part for part in (r[13], r[14], r[15], r[16]) if part)
                name = cities.get(r[20], '')
                if not name:
                    raise ValueError('Código de município ausente da tabela de domínio.')
                db.execute('INSERT INTO establishments(cnpj,base,nome,cnae,cidade,cidade_key,uf,bairro,endereco,telefone,email,abertura) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                           (cnpj, r[0], r[4], r[11], name, normal(name), r[19], r[17], address, phone, r[27], r[10]))
                for code in set(r[12].split(',')) - {''}:
                    if not re.fullmatch(r'\d{7}', code):
                        raise ValueError('CNAE secundário inválido.')
                    db.execute('INSERT INTO secondary VALUES(?,?)', (code, cnpj))
                count += 1
                if count % 10000 == 0:
                    db.commit()
            if progress:
                print(f'{path.name}: {count} estabelecimentos ativos retidos.', flush=True)
        db.execute('CREATE INDEX ix_base ON establishments(base)')
        bases = {r[0] for r in db.execute('SELECT DISTINCT base FROM establishments')}
        for path in groups['Empresas']:
            updates = []
            for r in csv_rows(path):
                if len(r) != 7:
                    raise ValueError(f'{path.name}: layout de empresa inválido.')
                if r[0] in bases:
                    updates.append((r[1], r[0]))
                if len(updates) >= 10000:
                    db.executemany('UPDATE establishments SET razao=? WHERE base=?', updates)
                    updates.clear()
            db.executemany('UPDATE establishments SET razao=? WHERE base=?', updates)
            db.commit()
        missing = db.execute("SELECT count(*) FROM establishments WHERE razao='' ").fetchone()[0]
        if missing and not allow_partial:
            raise ValueError('Há estabelecimentos sem razão social. Confira se os arquivos são da mesma competência.')
        db.executescript('CREATE INDEX ix_search ON establishments(uf,cnae,cidade_key,cnpj); CREATE INDEX ix_city ON establishments(uf,cidade_key,cnpj);')
        meta = {'total': count, 'uf': uf, 'city': city, 'month': month, 'partial': partial or bool(missing), 'missingNames': missing,
                'importedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': 'Receita Federal — Dados Abertos CNPJ'}
        db.execute('INSERT INTO metadata VALUES(?)', (json.dumps(meta, ensure_ascii=False),))
        db.commit()
        db.close()
        # Publicação atômica: consultas continuam usando a versão anterior até concluir.
        os.replace(temp, database(data_dir))
        return meta
    except BaseException:
        db.close()
        if os.path.exists(temp):
            os.unlink(temp)
        raise


def prospect(row, month):
    return dict(id='cnpj_' + row['cnpj'], cnpj=row['cnpj'], nome=row['nome'] or row['razao'] or ('Empresa ' + row['cnpj']), razao_social=row['razao'],
                origem='receita_federal', competencia=month, cnae=row['cnae'], categoria=row['descricao'] or row['cnae'],
                cidade=row['cidade'], uf=row['uf'], bairro=row['bairro'], endereco=row['endereco'], telefone=row['telefone'],
                email=row['email'], whatsapp='', site='', maps='', nota='', avaliacoes=0, buscas=[])


def search(data_dir, filters):
    uf, city = filters.get('uf', ''), filters.get('cidade', '').strip()
    cnae = re.sub(r'[.\-/]', '', filters.get('cnae', '').strip())
    secondary = filters.get('secundarios', False)
    page = filters.get('page', 1)
    if uf not in UFS or (cnae and not re.fullmatch(r'\d{7}', cnae)) or not isinstance(secondary, bool):
        raise ValueError('Informe UF e CNAE de 7 dígitos válidos.')
    if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= 100000:
        raise ValueError('Página inválida.')
    where, args = ['e.uf=?'], [uf]
    if city:
        where.append('e.cidade_key=?'); args.append(normal(city))
    if cnae:
        where.append('(e.cnae=? OR e.cnpj IN (SELECT cnpj FROM secondary WHERE cnae=?))' if secondary else 'e.cnae=?')
        args.extend([cnae, cnae] if secondary else [cnae])
    clause = ' AND '.join(where)
    with connect(data_dir) as db:
        meta = json.loads(db.execute('SELECT data FROM metadata').fetchone()[0])
        if not db.execute('SELECT 1 FROM establishments WHERE uf=? LIMIT 1', (uf,)).fetchone():
            raise ValueError(f"A UF {uf} ainda não tem estabelecimentos na carga disponível.")
        if city and not db.execute('SELECT 1 FROM establishments WHERE uf=? AND cidade_key=? LIMIT 1', (uf, normal(city))).fetchone():
            raise ValueError(f"A cidade {city} não consta da carga disponível de {uf}. Escolha uma cidade da base carregada.")
        total = db.execute('SELECT count(*) FROM establishments e WHERE ' + clause, args).fetchone()[0]
        rows = db.execute('SELECT e.*,a.descricao FROM establishments e LEFT JOIN activities a ON a.codigo=e.cnae WHERE ' + clause + ' ORDER BY e.cnpj LIMIT 50 OFFSET ?', args + [(page - 1) * 50])
        return {'items': [prospect(r, meta['month']) for r in rows], 'total': total, 'page': page, 'pageSize': 50}


def selected(data_dir, ids):
    if not isinstance(ids, list) or not 1 <= len(ids) <= 200 or not all(isinstance(i, str) and re.fullmatch(r'[A-Z0-9]{12}\d{2}', i) for i in ids):
        raise ValueError('Selecione de 1 a 200 CNPJs válidos.')
    with connect(data_dir) as db:
        month = json.loads(db.execute('SELECT data FROM metadata').fetchone()[0])['month']
        rows = db.execute('SELECT e.*,a.descricao FROM establishments e LEFT JOIN activities a ON a.codigo=e.cnae WHERE e.cnpj IN (' + ','.join('?' for _ in ids) + ')', ids)
        return [prospect(r, month) for r in rows]


def cnaes(data_dir, query):
    query = query.strip()[:120]
    numeric = re.sub(r'[.\-/]', '', query)
    with connect(data_dir) as db:
        rows = db.execute('SELECT codigo,descricao FROM activities WHERE codigo LIKE ? OR instr(search,?)>0 ORDER BY codigo LIMIT 30', (numeric + '%', normal(query)))
        return [dict(row) for row in rows]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Pasta com os ZIPs oficiais de uma única competência.')
    parser.add_argument('--data-dir', default=os.environ.get('PAINEL_DATA_DIR') or str(Path(__file__).parent / 'dados'))
    parser.add_argument('--uf', required=True, choices=sorted(UFS | {'BR'}), help='UF do recorte ou BR para todas as UFs.')
    parser.add_argument('--cidade', default='')
    parser.add_argument('--month', required=True)
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args()
    print(json.dumps(import_directory(args.source, args.data_dir, args.uf, args.month, args.cidade, args.allow_partial, progress=True), ensure_ascii=False, indent=2))
