# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | ✅ Yes     |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a security vulnerability, open a [GitHub Security Advisory](https://github.com/Pana-g/autoresearch-cockpit/security/advisories/new) (private by default) or email the maintainers directly.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant code, configuration, or environment details

You can expect an acknowledgement within **72 hours** and a resolution timeline within the first response.

## Security Considerations

### API Credentials

- All LLM provider API keys are encrypted at rest using [Fernet](https://cryptography.io/en/latest/fernet/) symmetric encryption.
- An encryption key is **auto-generated** on first run and persisted to `~/.autoresearch-cockpit/encryption.key` (chmod 600).
- You can override the key via the `AR_ENCRYPTION_KEY` environment variable if needed (e.g. when migrating to a new machine).
- The `backend/.env` file (if used) is git-ignored by default — never commit it.

### Network Exposure

- By default, the backend binds to `0.0.0.0:8000`. When deploying beyond localhost, ensure this is behind a reverse proxy with TLS.
- `AR_CORS_ORIGINS` defaults to `["*"]` for development — restrict this in production.

### Database

- The default database is SQLite, stored locally at `~/.autoresearch-cockpit/autoresearch.db`. No credentials needed.
- If using PostgreSQL, use strong credentials and restrict network access in any shared or production environment.

### Docker Deployment

- Secrets are passed via environment variables / `.env` files. Never bake secrets into Docker images.
- Review `docker-compose.yml` before exposing ports externally.
