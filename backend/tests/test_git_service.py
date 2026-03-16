"""Tests for git service."""

import os
import tempfile

import pytest

from app.services.git_service import GitService


@pytest.fixture
def source_workspace():
    """Create a temporary source workspace."""
    with tempfile.TemporaryDirectory() as tmpdir:
        train_py = os.path.join(tmpdir, "train.py")
        with open(train_py, "w") as f:
            f.write("print('training v1')\n")

        prepare_py = os.path.join(tmpdir, "prepare.py")
        with open(prepare_py, "w") as f:
            f.write("print('prepare data')\n")

        program_md = os.path.join(tmpdir, "program.md")
        with open(program_md, "w") as f:
            f.write("# Objective\nMinimize val_bpb.\n")

        yield tmpdir


@pytest.fixture
def workspace_path():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield os.path.join(tmpdir, "workspace")


class TestGitService:
    def test_init_workspace(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        sha = git.init_workspace(source_workspace, "run/test-1")
        assert len(sha) == 40

        # Check files were copied
        assert os.path.exists(os.path.join(workspace_path, "train.py"))
        assert os.path.exists(os.path.join(workspace_path, "prepare.py"))

        # Check prepare.py is read-only
        mode = os.stat(os.path.join(workspace_path, "prepare.py")).st_mode
        assert not (mode & 0o200)  # write bit not set

    def test_read_file(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        git.init_workspace(source_workspace, "run/test-2")
        content = git.read_file("train.py")
        assert "training v1" in content

    def test_write_file(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        git.init_workspace(source_workspace, "run/test-3")
        git.write_file("train.py", "print('training v2')\n")
        content = git.read_file("train.py")
        assert "training v2" in content

    def test_write_prepare_py_blocked(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        git.init_workspace(source_workspace, "run/test-4")
        with pytest.raises(PermissionError):
            git.write_file("prepare.py", "hacked")

    def test_commit_and_log(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        git.init_workspace(source_workspace, "run/test-5")
        git.write_file("train.py", "print('v2')\n")
        sha = git.commit_patch("Iteration 1")
        assert len(sha) == 40

        log = git.get_log()
        assert len(log) == 2
        assert log[0]["message"] == "Iteration 1"

    def test_rollback(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        initial_sha = git.init_workspace(source_workspace, "run/test-6")

        git.write_file("train.py", "print('v2')\n")
        git.commit_patch("Iteration 1")

        git.rollback(initial_sha)
        content = git.read_file("train.py")
        assert "training v1" in content

    def test_init_nonexistent_source_raises(self, workspace_path):
        git = GitService(workspace_path)
        with pytest.raises(FileNotFoundError):
            git.init_workspace("/nonexistent/path", "run/test-7")

    def test_tag_best(self, source_workspace, workspace_path):
        git = GitService(workspace_path)
        sha = git.init_workspace(source_workspace, "run/test-8")
        git.tag_best(sha, "best-test")
        # Verify tag exists
        tags = [t.name for t in git.repo.tags]
        assert "best-test" in tags
