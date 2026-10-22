# Data handling

The operator controls the local SQLite database and exported files. Store them in an access-restricted, encrypted workstation folder. Customer information must never be committed to this repository or attached to public issues.

Snapshot payloads and selected sensitive fields (including stakeholder and transcript fields) use Fernet encryption through the application's `EncryptedText` type. Other metadata and reviewed records can remain plaintext. This is field encryption, not full-database encryption. The key defaults to a separate local file; storing a key next to the database is not a defense against an attacker who can read the entire folder. A missing or wrong key can make saved evidence unreadable. Keep secure backups of both data and key, separately controlled where feasible.

Azure access/refresh token material stays in process memory through SDK/MSAL credential objects. Session tokens and the browser's evidence cache stay in browser session storage (not encrypted); they are cleared when the workbench is locked. Unlocking also removes legacy persistent evidence caches. The startup unlock key is written locally. Stop the backend or use Lock workbench to revoke local session access; use profile logout to disconnect individual cloud credentials. Browser/OS session recovery and other local processes remain outside this protection boundary.

Reports, screenshots, clipboard exports, Word/PDF/spreadsheet downloads, and backups can contain private evidence and are not automatically encrypted. Review recipients and use your organisation's retention policy. Profile deletion is an application operation, not a secure erase of SQLite pages, backups, or downloaded exports.

Optional OpenAI processing sends report grounding evidence/context or transcript text over HTTPS when the corresponding processing operation is requested and an API key is configured. Review and minimize that content before use. No guarantee about external provider retention is made here; consult the account's actual settings and contract. Without an API key, report interpretation uses the local scaffold.

Included demo values are synthetic and clearly labeled. A demo is not a completed security or compliance assessment. Do not mix a demo profile with a real engagement.
