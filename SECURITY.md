# Security policy

This early release supports a single operator on a local workstation. Shared or public deployment is unsupported. A local session grants access to all profiles in that installation; it is not a tenant-isolation system for multiple users.

Use GitHub's **Security → Report a vulnerability** private reporting feature when available. If it is unavailable, open an issue asking for a private reporting channel without including vulnerability details, exploit material, or customer evidence. No response-time guarantee is made.

Include the affected version, a minimal synthetic reproduction, impact, and proposed mitigation. Never send real passwords, tokens, customer databases, or encryption keys. Revoke exposed credentials promptly through their issuer.

Use the latest release and review its known limitations. No release has been independently penetration-tested or certified. Protect the workstation, local keys, backups, and exports; see docs/data-handling.md.
