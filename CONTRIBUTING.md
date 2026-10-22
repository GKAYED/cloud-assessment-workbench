# Contributing

Use an issue to describe a bug or proposed change, then make a focused pull request. Never include customer data, credentials, real tenant/resource identifiers, transcripts, screenshots of live assessments, or local database/key files. Use independently invented examples under `example.com` and clearly synthetic IDs.

Run the frontend build, tests and lint, and backend tests listed in README. Add meaningful tests for changed security, snapshot, profile-switch, and report behavior. Existing React optimization warnings are visible technical debt; do not add blanket suppressions or weaken security checks to make CI pass.

Preserve the local-only deployment boundary, Microsoft interactive sign-in, and atomic snapshots. Missing evidence must remain missing. Report narrative and manual review must not overwrite source evidence or cross profile boundaries.

New dependencies require license and vulnerability review, lockfile/constraints updates, and a clean-install check. Third-party content needs compatible redistribution rights and attribution. Contributions are submitted under the project's Apache-2.0 license; retain original authorship notices.

Report vulnerabilities through the private channel in SECURITY.md rather than public issues. Release maintainers should scan the full candidate history and artifacts, review the file manifest, run clean installation and CI, then tag the tested commit.
