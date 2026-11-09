"""Testa arquivos no layout oficial com empresas fictícias; não usa a base real."""
import csv
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile

import receita


def write_zip(root, name, rows):
    stream = io.StringIO(newline='')
    csv.writer(stream, delimiter=';', quoting=csv.QUOTE_ALL).writerows(rows)
    with zipfile.ZipFile(Path(root) / name, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('dados.CSV', stream.getvalue().encode('latin-1'))


def fixtures(root, many=False):
    write_zip(root, 'Cnaes.zip', [['8630504', 'Atividade odontológica'], ['6201501', 'Desenvolvimento de programas']])
    write_zip(root, 'Municipios.zip', [['3849', 'SALVADOR'], ['3515', 'FEIRA DE SANTANA'], ['9373', 'GOIÂNIA']])
    establishments = []
    companies = []
    for i, city, uf, status, primary, secondary in [
        (1, '3849', 'BA', '02', '8630504', '6201501'),
        (2, '3515', 'BA', '02', '6201501', '8630504'),
        (3, '9373', 'GO', '02', '8630504', ''),
        (4, '3849', 'BA', '08', '8630504', ''),
    ] + ([(i, '3849', 'BA', '02', '8630504', '') for i in range(5, 60)] if many else []):
        row = [''] * 30
        row[0:6] = [f'{i:08}', '0001', '00', '1', f'Empresa fictícia {i}', status]
        row[10:13] = ['20200101', primary, secondary]
        row[13:23] = ['RUA', 'EXEMPLO', '10', '', 'CENTRO', '40000000', uf, city, '71', '999990000']
        row[27] = f'empresa{i}@example.invalid'
        establishments.append(row)
        companies.append([row[0], f'Razão social {i}', '2062', '49', '1000,00', '01', ''])
    for i in range(10):
        write_zip(root, f'Estabelecimentos{i}.zip', establishments if i == 0 else [])
        write_zip(root, f'Empresas{i}.zip', companies if i == 0 else [])


class Receita(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source, self.data = self.root / 'source', self.root / 'data'
        self.source.mkdir(); self.data.mkdir()
        fixtures(self.source)

    def tearDown(self):
        self.temp.cleanup()

    def load(self, **kwargs):
        return receita.import_directory(self.source, self.data, 'BA', '2026-10', **kwargs)

    def search(self, **kwargs):
        return receita.search(self.data, {'uf': 'BA', 'cidade': '', 'cnae': '8630504', 'page': 1, 'secundarios': False, **kwargs})

    def test_layout_filters_source_and_contacts(self):
        self.assertFalse(receita.status(self.data)['loaded'])
        meta = self.load()
        self.assertEqual(meta['total'], 2)
        self.assertFalse(meta['partial'])
        rows = self.search()['items']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['razao_social'], 'Razão social 1')
        self.assertEqual(rows[0]['origem'], 'receita_federal')
        self.assertEqual(rows[0]['competencia'], '2026-10')
        self.assertEqual(rows[0]['whatsapp'], '')
        self.assertEqual(rows[0]['telefone'], '71999990000')
        self.assertEqual(self.search(uf='GO')['total'], 0)
        self.assertEqual(self.search(secundarios=True)['total'], 2)
        self.assertEqual(self.search(cidade='salvador')['total'], 1)
        self.assertEqual(self.search(cidade='Salvador\' OR 1=1 --')['total'], 0)
        self.assertEqual(receita.cnaes(self.data, 'odontologica')[0]['codigo'], '8630504')
        self.assertEqual(receita.cnaes(self.data, '8630-5/04')[0]['codigo'], '8630504')
        self.assertEqual(len(receita.selected(self.data, [rows[0]['cnpj'], rows[0]['cnpj']])), 1)

    def test_relative_paths_and_alphanumeric_cnpj(self):
        rows = list(receita.csv_rows(self.source / 'Estabelecimentos0.zip'))
        rows[0][0:3] = ['AB12CD34', 'E08G', '12']
        write_zip(self.source, 'Estabelecimentos0.zip', rows)
        companies = list(receita.csv_rows(self.source / 'Empresas0.zip'))
        companies[0][0] = 'AB12CD34'
        write_zip(self.source, 'Empresas0.zip', companies)
        self.load()
        self.assertTrue(receita.status(os.path.relpath(self.data))['loaded'])
        selected = receita.selected(self.data, ['AB12CD34E08G12'])
        self.assertEqual(selected[0]['cnpj'], 'AB12CD34E08G12')
        self.assertEqual(selected[0]['razao_social'], 'Razão social 1')

    def test_failed_import_preserves_published_database(self):
        self.load()
        original = receita.database(self.data).read_bytes()
        write_zip(self.source, 'Estabelecimentos1.zip', [['invalid']])
        with self.assertRaisesRegex(ValueError, 'layout'):
            self.load()
        self.assertEqual(receita.database(self.data).read_bytes(), original)
        self.assertEqual(self.search()['total'], 1)
        self.assertEqual(list(self.data.glob('receita-import-*')), [])

    def test_missing_parts_partial_label_and_city_scope(self):
        (self.source / 'Empresas9.zip').unlink()
        with self.assertRaisesRegex(ValueError, 'Faltam partes'):
            self.load()
        self.assertTrue(self.load(allow_partial=True, city='salvador')['partial'])
        self.assertEqual(receita.status(self.data)['total'], 1)
        self.assertEqual(self.search(cnae='')['total'], 1)

    def test_pagination_and_input_validation(self):
        fixtures(self.source, many=True)
        self.load()
        page = self.search(cnae='')
        self.assertEqual(page['total'], 57)
        self.assertEqual(len(page['items']), 50)
        second = self.search(cnae='', page=2)['items']
        self.assertEqual(len(second), 7)
        self.assertFalse({r['id'] for r in page['items']} & {r['id'] for r in second})
        for patch in [{'uf': 'XX'}, {'cnae': '8630'}, {'page': 0}, {'page': True}, {'secundarios': 'false'}]:
            with self.assertRaises(ValueError):
                self.search(**patch)
        with self.assertRaises(ValueError):
            receita.selected(self.data, ['bad'])
        with self.assertRaises(ValueError):
            receita.selected(self.data, ['1' * 14] * 201)


if __name__ == '__main__':
    unittest.main()
