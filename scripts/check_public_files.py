"""Check tracked file types for accidental private artifacts. Not a privacy audit."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
forbidden = {'.docx','.pptx','.pdf','.csv','.db','.sqlite','.sqlite3','.key','.pem','.log','.zip','.bak'}
errors = []
for name in filter(None, paths):
    p = Path(name)
    if p.suffix.lower() in forbidden or p.name.startswith('~$'):
        errors.append(name)
    if p.name.startswith('.env') and p.name != '.env.example':
        errors.append(name)
    if any(part in {'.venv','node_modules','assessments','exports','.release-private'} for part in p.parts):
        errors.append(name)
if errors:
    raise SystemExit('Forbidden tracked artifacts: ' + ', '.join(sorted(set(errors))))
print('Tracked artifact policy passed. Secret scanning and human privacy review are also required.')
