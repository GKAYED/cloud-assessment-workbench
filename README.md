# Cloud Assessment Workbench

A local Azure assessment application for consultants: collect cloud evidence, keep customer profiles separate, record reviewed context, and produce assessment reports.

Early release for **one operator on a local workstation**. Shared hosting and internet-facing deployment are not supported. Automated insights and generated narratives require human review; this is not a compliance certification tool.

## Features

- Azure inventory, cost, security, and governance evidence collection.
- Microsoft licensing and Dynamics 365 discovery where permissions allow.
- Profile-scoped snapshots, stakeholder context, recommendations, and initiatives.
- Assessment Report V2 with editable interpretation and PDF exports; legacy reports remain available for existing profiles.
- Optional OpenAI-assisted report/transcript processing, with local report interpretation when no API key is configured.
- Original starter discussion questions aligned to five assessment themes. These are not the official Microsoft assessment.

## Quick start (Windows PowerShell)

Prerequisites: Git, Python 3.11, and Node.js 24. These are the initial validation targets. Other platforms may work but have not been verified for this release.

```powershell
git clone https://github.com/GKAYED/cloud-assessment-workbench.git
cd cloud-assessment-workbench
python -m venv .venv
.venv/Scripts/python.exe -m pip install --upgrade pip setuptools
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -c backend/constraints.txt
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
cd backend
../.venv/Scripts/python.exe -m app.demo
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal, from the repository:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://localhost:5173. Paste the contents of `backend/workbench-unlock.key` into the unlock screen. The key is generated at backend startup; never commit or share it. Select either clearly labeled synthetic demo profile from Profiles. Demo values are fictional and deliberately incomplete; missing security and governance evidence remains empty.

The local session lasts eight hours and grants access to all profiles stored by this installation. Locking the workbench revokes that session and clears cloud credentials. Restarting the backend rotates the unlock key. Closing a browser tab alone does not revoke the backend session.

## Connect a real tenant

Read [configuration and permissions](docs/configuration.md) before connecting. Use your own Microsoft Entra public-client registration and the Microsoft device-code flow. No tenant access or OpenAI key is required to run the demo. Users remain responsible for permission to collect, store, and send their organisation's assessment data.

Create a separate profile for each engagement, sign in, and run Data Pull. Successful pulls replace saved evidence atomically; failures preserve the previous snapshot. Reports use saved evidence and reviewed records.

## Development

Assessment report PDF export opens the browser print dialog. Choose **Save as PDF** and review the preview before saving. Print preparation and cleanup are tested; native print-dialog saving and final PDF pagination were not verified for this release.

```powershell
cd backend
../.venv/Scripts/python.exe -m pip install -r requirements-dev.txt -c constraints.txt
../.venv/Scripts/python.exe -m pytest -q
cd ../frontend
npm test -- --run
npm run lint
npm run build
```

See [architecture](docs/architecture.md), [data handling](docs/data-handling.md), [contributing](CONTRIBUTING.md), and [security reporting](SECURITY.md).

## Current limitations

- Live Microsoft API behavior varies by permissions, service availability, and tenant policy. The initial release's automated checks use mocks and synthetic evidence; they do not establish compatibility with every tenant.
- Questionnaire submission currently acknowledges receipt without persisting answers. Record findings in reviewed notes.
- Some application grouping and report interpretation uses heuristics. Review the evidence and confidence gaps before sharing exports.
- Existing React optimization/dependency lint warnings remain visible. The app does not enable React Compiler.
- Large PDF export bundles can increase load time. Export rendering needs review before customer delivery.

## License

Copyright 2026 GKAYED. Licensed under [Apache License 2.0](LICENSE). Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). This project is independent and is not endorsed by Microsoft or OpenAI.
