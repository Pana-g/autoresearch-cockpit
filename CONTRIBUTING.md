# Contributing to AutoResearch Cockpit

Thanks for your interest in contributing! This document explains how to get involved.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```sh
   git clone https://github.com/<your-username>/autoresearch-cockpit.git
   cd autoresearch-cockpit
   ```
3. **Set up** the development environment:
   ```sh
   ./setup.sh        # macOS / Linux
   setup.bat          # Windows
   ```
4. **Create a branch** for your change:
   ```sh
   git checkout -b feat/my-feature
   ```

## Development Workflow

### Running Locally

```sh
./run.sh              # Start backend + frontend
./run.sh backend      # Backend only (FastAPI on :8000)
./run.sh frontend     # Frontend only (Vite on :5173)
```

### Backend

- **Language:** Python 3.12+, managed with [uv](https://docs.astral.sh/uv/)
- **Framework:** FastAPI + SQLAlchemy (async) + Alembic
- **Tests:**
  ```sh
  cd backend
  uv run pytest
  ```
- **Linting:** Follow existing code style. Use type hints where practical.

### Frontend

- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Package manager:** [Bun](https://bun.sh/)
- **Lint:**
  ```sh
  cd frontend
  bun run lint
  ```
- **Build check:**
  ```sh
  cd frontend
  bun run build
  ```

### Database Migrations

If your change modifies the database schema:

```sh
cd backend
uv run alembic revision --autogenerate -m "description_of_change"
uv run alembic upgrade head
```

Review the generated migration before committing.

## Submitting Changes

1. **Commit** with a clear message:
   ```
   feat: add support for streaming token counts
   fix: prevent duplicate patch applications
   docs: update provider setup instructions
   ```
   We loosely follow [Conventional Commits](https://www.conventionalcommits.org/).

2. **Push** your branch and open a **Pull Request** against `main`.

3. In the PR description:
   - Describe **what** changed and **why**
   - Link any related issues (`Closes #123`)
   - Include screenshots for UI changes

## What to Contribute

- **Bug fixes** — check [open issues](https://github.com/Pana-g/autoresearch-cockpit/issues)
- **New LLM providers** — implement the `BaseProvider` interface in `backend/app/providers/`
- **UI improvements** — components live in `frontend/src/components/`
- **Documentation** — corrections, examples, guides
- **Tests** — expand coverage in `backend/tests/`

## Reporting Bugs

Open an [issue](https://github.com/Pana-g/autoresearch-cockpit/issues/new?template=bug_report.md) with:

- Steps to reproduce
- Expected vs. actual behavior
- Browser / OS / Python version
- Relevant logs or screenshots

## Code Style

- **Python:** Follow existing patterns. Type hints encouraged. No strict formatter enforced yet.
- **TypeScript/React:** Follow existing component patterns. Use Tailwind for styling. Prefer shadcn/ui primitives.
- **Commits:** Use imperative mood (`add`, `fix`, `update`, not `added`, `fixed`, `updated`).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
