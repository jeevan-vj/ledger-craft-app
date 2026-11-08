"""Inspect actual web downloads against separately frozen accountant papers.

Run from the repository root after the browser driver; never writes app data.
Private browser authentication state is deliberately excluded from copied evidence.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import zipfile
from decimal import Decimal
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=Path('/tmp/second-month-year-end-web'))
parser.add_argument('--output', type=Path, default=Path('docs/evidence/second-month-year-end/web'))
args = parser.parse_args()
base = Path('docs/evidence/second-month-year-end')
paper = json.loads((base / 'expected.json').read_text())
supplement = json.loads((base / 'supplemental-paper.json').read_text())
state = json.loads((args.source / 'state.json').read_text())
args.output.mkdir(parents=True, exist_ok=True)
for source in args.source.iterdir():
    if source.suffix in ('.png', '.pdf', '.csv', '.zip') and not source.name.startswith('failure-'):
        shutil.copy2(source, args.output / source.name)

roles = {'bank': state['cash']['accountNumber'], 'capital': '3000', 'receivables': '1200',
         'sales': '4000', 'outputGst': '2200', 'inputGst': '2150', 'operatingCosts': '5000',
         'payables': '2100', 'customerCredit': '2300'}
sections = ['trialBalance', 'profitLoss', 'balanceSheet', 'cashFlow', 'receivablesAging',
            'payablesAging', 'taxSummary']
archives = []
for key, period in [('novemberReport', 'november'), ('yearEndReport', 'yearEnd'), ('aprilReport', 'april')]:
    archive_path = args.source / f'{key}-close-pack.zip'
    expected = paper[period]
    with zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        assert len(archive.namelist()) == 14 and len(manifest['members']) == 13
        for member in manifest['members']:
            data = archive.read(member['name'])
            assert len(data) == member['bytes']
            assert hashlib.sha256(data).hexdigest() == member['sha256']
        reports = json.loads(archive.read('reports.json'))
        actual = reports['financial']
        for section in sections:
            assert actual[section] == state[key][section], (key, section)
        prior = {} if period == 'yearEnd' else {
            row['accountRole']: Decimal(row['debit']) - Decimal(row['credit'])
            for row in expected['openingTrialBalance']['rows']
        }
        running = {role: prior.get(role, Decimal('0.00')) for role in roles}
        for line in reports['generalLedger']['lines']:
            role = next((r for r, code in roles.items() if code == line['accountNumber']), None)
            if role:
                running[role] += Decimal(line['debit']) - Decimal(line['credit'])
        for row in expected['closingTrialBalance']['rows']:
            found = next(r for r in actual['trialBalance']['rows'] if r['accountNumber'] == roles[row['accountRole']])
            assert found['closingDebit'] == row['debit'] and found['closingCredit'] == row['credit']
            assert running[row['accountRole']] == Decimal(row['debit']) - Decimal(row['credit'])
        assert actual['trialBalance']['closingDebits'] == expected['closingTrialBalance']['totalDebits']
        assert actual['trialBalance']['closingCredits'] == expected['closingTrialBalance']['totalCredits']
        if period == 'yearEnd':
            for field in ['inflows', 'outflows', 'netCashFlow', 'closingCash']:
                assert actual['cashFlow'][field] == supplement['yearEndCashFlow'][field]
            assert actual['cashFlow']['openingCash'] == supplement['yearEndCashFlow']['ledgerOpeningCash']
        if period == 'april':
            assert actual['trialBalance']['totalDebits'] == '1035.00'
            assert actual['trialBalance']['totalCredits'] == '1035.00'
        gst = json.loads(archive.read('gst.json'))
        assert gst['preparation']['netGstPosition'] == {'november': '60.00', 'yearEnd': '285.00', 'april': '15.00'}[period]
        (args.output / f'{key}-actual-reports.json').write_text(json.dumps(reports, indent=2) + '\n')
        archives.append({'file': archive_path.name, 'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                         'members': 14, 'verifiedMemberHashes': 13, 'independentRawLedgerRoles': 9,
                         'period': manifest['period'], 'periodLock': manifest['periodLock'],
                         'warnings': manifest['warnings'], 'gstNet': gst['preparation']['netGstPosition']})

exports = []
for prefix, period in [('novemberReport', 'november'), ('yearEndReport', 'yearEnd'), ('aprilReport', 'april')]:
    expected = paper[period]
    values = {'profit-loss': [expected['profitLoss']['accrual']['netIncome']],
              'trial-balance': [expected['closingTrialBalance']['totalDebits']],
              'balance-sheet': [expected['balanceSheet']['assets'], expected['balanceSheet']['equity']],
              'cash-flow': [expected['balanceSheet']['cash']],
              'receivables-aging': [expected['receivablesAging']['total']],
              'payables-aging': [expected['payablesAging']['total']]}
    for name, expected_values in values.items():
        pdf = args.output / f'{prefix}-{name}.pdf'
        assert pdf.read_bytes().startswith(b'%PDF-')
        text = subprocess.check_output(['pdftotext', '-layout', str(pdf), '-']).decode()
        for value in expected_values:
            assert value in text.replace(',', ''), (pdf, value)
        if name == 'balance-sheet' and state.get('earningsRefresh'):
            assert re.search(r'Accumulated earnings \(included in(?:\s+[-\d,.]+)?\s+equity\)', text), (pdf, 'wrapped earnings label')
            assert expected['balanceSheet']['accumulatedEarnings'] in text.replace(',', '')
        (args.output / f'{prefix}-{name}-extracted.txt').write_text('\n'.join(line.rstrip() for line in text.splitlines()).rstrip() + '\n')
        csv = args.output / f'{prefix}-{name}.csv'
        csv_text = csv.read_text(encoding='utf-8-sig')
        if name == 'balance-sheet' and state.get('earningsRefresh'):
            assert 'Accumulated earnings (included in equity)' in csv_text
            assert expected['balanceSheet']['accumulatedEarnings'] in csv_text.replace(',', '')
        for value in expected_values:
            assert value in csv_text.replace(',', ''), (csv, value)
        exports.append({'pdf': pdf.name, 'csv': csv.name, 'expectedValuesVerified': expected_values,
                        'pdfSha256': hashlib.sha256(pdf.read_bytes()).hexdigest()})

assert all(not p['unexpectedPageAndConsoleErrors'] for p in state['browserChecks'].values())
retained_nil = state['nilGst']
assert retained_nil['financialSectionsUnchanged']
for start in ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']:
    assert retained_nil[start]['retained']['status'] == 'draft'
    assert retained_nil[start]['retained']['netGst'] == '0.00'
result = {'build': state['build'], 'reportBuild': state.get('reportBuild'), 'earningsRefresh': state.get('earningsRefresh'), 'browserChecks': state['browserChecks'],
          'phases': list(state['browserChecks']), 'apiFixtureWrites': False,
          'closedReportsUnchangedAfterYearEnd': state['closedReportsUnchangedAfterYearEnd'],
          'nilGst': retained_nil, 'novemberBank': state['november']['reconciliation'],
          'yearEndBank': state['yearEndBankProof'], 'aprilBank': state['april']['bankProof'],
          'aprilGst': state['april']['gst'], 'archives': archives, 'exports': exports,
          'papers': {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
                     for name in ['expected.json', 'supplemental-paper.json', 'nil-gst-paper.json']}}
(args.output / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(f'PASS {len(result["phases"])} UI phases; 3 ZIPs/39 SHA checks; 27 raw-role checks; 18 PDFs/18 CSVs; four nil GST drafts')
