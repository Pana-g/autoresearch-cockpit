# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ Yes     |

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
- The encryption key (`AR_ENCRYPTION_KEY`) **must** be kept secret and out of version control.
- The `backend/.env` file is git-ignored by default — never commit it.

### API Access Control

- If `AR_API_KEY` is set in `backend/.env`, all API requests require a matching `X-API-Key` header.
- When `AR_API_KEY` is empty, authentication is disabled — **only do this on trusted private networks or localhost**.

### Network Exposure

- By default, the backend binds to `0.0.0.0:8000`. When deploying beyond localhost, ensure this is behind a reverse proxy with TLS.
- `AR_CORS_ORIGINS` defaults to `["*"]` for development — restrict this in production.

### Database

- The default PostgreSQL credentials (`postgres/postgres`) are for local development only. Use strong credentials and restrict network access in any shared or production environment.

### Docker Deployment

- Secrets are passed via environment variables / `.env` files. Never bake secrets into Docker images.
- Review `docker-compose.yml` before exposing ports externally.
