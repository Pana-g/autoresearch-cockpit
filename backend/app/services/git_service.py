"""Git operations for run workspaces."""

import logging
import shutil
from pathlib import Path

from git import Repo

logger = logging.getLogger(__name__)


class GitService:
    def __init__(self, workspace_path: str):
        self.workspace_path = Path(workspace_path)
        self.repo: Repo | None = None

    def init_workspace(self, source_path: str, branch_name: str) -> str:
        """Copy source into workspace, init git, create branch, return initial commit SHA."""
        src = Path(source_path)
        if not src.exists():
            raise FileNotFoundError(f"Source path does not exist: {source_path}")

        # Copy workspace (skip .git if present in source)
        if self.workspace_path.exists():
            shutil.rmtree(self.workspace_path)
        shutil.copytree(src, self.workspace_path, ignore=shutil.ignore_patterns(".git", ".venv"))

        # Make prepare.py read-only
        prepare_py = self.workspace_path / "prepare.py"
        if prepare_py.exists():
            prepare_py.chmod(0o444)

        # Init git repo
        self.repo = Repo.init(self.workspace_path)
        self.repo.git.checkout("-b", branch_name)
        self.repo.git.add(A=True)
        commit = self.repo.index.commit("Initial workspace snapshot")
        logger.info("Initialized workspace %s on branch %s", self.workspace_path, branch_name)
        return commit.hexsha

    def open(self) -> None:
        """Open an existing git repo at workspace_path."""
        self.repo = Repo(self.workspace_path)

    def commit_patch(self, message: str) -> str:
        """Stage all changes and commit. Returns commit SHA."""
        assert self.repo is not None
        self.repo.git.add(A=True)
        commit = self.repo.index.commit(message)
        return commit.hexsha

    def tag_best(self, commit_sha: str, tag_name: str) -> None:
        assert self.repo is not None
        self.repo.create_tag(tag_name, ref=commit_sha, force=True)

    def reset_to(self, commit_sha: str) -> None:
        """Hard reset to the given commit SHA."""
        assert self.repo is not None
        self.repo.git.reset("--hard", commit_sha)

    def rollback(self, commit_sha: str) -> None:
        """Reset HEAD to a previous commit, discarding patches after it."""
        self.reset_to(commit_sha)

    def read_file(self, relative_path: str) -> str:
        """Read a file from the workspace."""
        return (self.workspace_path / relative_path).read_text()

    def read_file_at(self, relative_path: str, commit_sha: str) -> str:
        """Read a file's content at a specific commit."""
        assert self.repo is not None
        commit = self.repo.commit(commit_sha)
        return (commit.tree / relative_path).data_stream.read().decode()

    def write_file(self, relative_path: str, content: str) -> None:
        """Write content to a file in the workspace."""
        fpath = self.workspace_path / relative_path
        if relative_path == "prepare.py":
            raise PermissionError("prepare.py is read-only")
        fpath.write_text(content)

    def get_current_sha(self) -> str:
        assert self.repo is not None
        return self.repo.head.commit.hexsha

    def get_log(self, max_count: int = 50) -> list[dict]:
        assert self.repo is not None
        return [
            {"sha": c.hexsha, "message": c.message.strip(), "date": c.committed_datetime.isoformat()}
            for c in self.repo.iter_commits(max_count=max_count)
        ]
