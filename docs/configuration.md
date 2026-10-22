# Configuration and permissions

Use `backend/.env.example` and `frontend/.env.example`; keep actual `.env` files untracked. Backend settings use the `AZAUDIT_` prefix. The frontend uses `VITE_API_BASE` (without `/api`); requests supply their own `/api/...` paths. Never put API secrets in frontend environment variables: Vite includes those values in browser assets.

## Microsoft sign-in

Register an application you control in Microsoft Entra ID, configure it as a public client with device-code authentication permitted by tenant policy, and set `AZAUDIT_AZURE_CLIENT_ID` to its application ID. The Profiles sign-in form supplies the target tenant ID. The active backend flow does not require a SPA redirect URI. It requests delegated tokens for relevant Microsoft services. Do not use a client secret for this interactive flow.

The sign-in is initiated by the backend and completed on Microsoft's verification page. Conditional Access may prohibit device-code authentication; work with the tenant administrator rather than bypassing that policy. Legacy password/service-principal API paths are unsupported in the public release.

| Feature | Permission/access to review with tenant administrator |
|---|---|
| Inventory and resource discovery | Azure read access on selected subscriptions/resources; Resource Graph access consistent with that scope |
| Costs | Cost Management read access and any billing-scope policies needed for the requested data |
| Advisor, Defender, governance | Read permissions for the relevant Azure resource/security/policy/RBAC APIs |
| Licensing and directory data | Microsoft Graph delegated directory/license/user read permissions required by the enabled calls; admin consent may be required |
| Dynamics and Power Platform | Appropriate environment membership, Dataverse/Business Central permissions, and delegated service scopes |

Grant only the permissions needed for the features you use. Missing permissions must appear as evidence gaps, not invented scores. The collector code is the precise list of API operations; a tenant-specific permission matrix still needs validation against that tenant's policies.

## Optional external AI

Leave `AZAUDIT_OPENAI_API_KEY` empty to use local report interpretation. Configure it only if the operator is authorized to send the selected evidence/context or transcript text to OpenAI. `AZAUDIT_OPENAI_MODEL` selects the model. No key is bundled, and normal automated tests do not make external AI calls.

## Local keys, ports, and sessions

- `AZAUDIT_DATABASE_URL`: local async SQLite URL; other databases are not tested.
- `AZAUDIT_FIELD_ENCRYPTION_KEY_PATH`: persistent encryption key, default `./azaudit.key`. Preserve it with secure backups.
- `AZAUDIT_FIELD_ENCRYPTION_KEY`: optional explicit Fernet key instead of the key file.
- `AZAUDIT_LOCAL_UNLOCK_KEY_PATH`: local file containing the startup unlock key.
- `AZAUDIT_CORS_ORIGINS`: exact trusted frontend origins; keep these on loopback.
- `AZAUDIT_PORT`: internal collector port; if you change Uvicorn's port, change this setting too.
- `AZAUDIT_DEBUG`: false by default. Avoid enabling verbose logs with real customer data.

Use one Uvicorn worker bound to `127.0.0.1`. The local unlock-key file is readable by the process owner; Windows protection relies on the containing folder's ACL. Use a private OS account and folder, disk encryption, and restricted backups. The local-session design does not defend against malware or other processes running as that same OS user.
