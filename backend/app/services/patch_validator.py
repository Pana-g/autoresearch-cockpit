"""Patch validation: only train.py, valid Python syntax."""

import ast
import re


class PatchValidationError(Exception):
    pass


def validate_patch(patch_text: str, original_train_py: str) -> str:
    """Validate and return the patched train.py content.

    The patch_text can be either:
    1. A unified diff targeting only train.py
    2. The full replacement content for train.py

    Returns the new train.py content on success, raises PatchValidationError otherwise.
    """
    # If it looks like a full file (not a diff), treat it as replacement content
    if not patch_text.strip().startswith(("---", "diff ")):
        new_content = patch_text.strip()
    else:
        new_content = _apply_diff(patch_text, original_train_py)

    # Validate: must be valid Python
    try:
        ast.parse(new_content)
    except SyntaxError as e:
        raise PatchValidationError(f"Patch produces invalid Python: {e}") from e

    # Validate: must not be empty
    if not new_content.strip():
        raise PatchValidationError("Patch produces empty file")

    return new_content


def _apply_diff(diff_text: str, original: str) -> str:
    """Apply a unified diff to the original file content.

    Only allows modifications to train.py — rejects diffs that target other files.
    """
    # Check that diff only targets train.py
    file_headers = re.findall(r'^[+-]{3}\s+[ab]/(.+)$', diff_text, re.MULTILINE)
    for fpath in file_headers:
        normalized = fpath.strip()
        if normalized not in ("train.py", "a/train.py", "b/train.py"):
            raise PatchValidationError(
                f"Patch modifies disallowed file: {normalized}. Only train.py is allowed."
            )

    # Use a simple line-by-line hunk applier
    lines = original.splitlines(keepends=True)
    result_lines = list(lines)

    hunk_pattern = re.compile(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@')
    diff_lines = diff_text.splitlines(keepends=True)

    offset = 0
    i = 0
    while i < len(diff_lines):
        m = hunk_pattern.match(diff_lines[i])
        if m:
            orig_start = int(m.group(1)) - 1  # 0-indexed
            i += 1
            pos = orig_start + offset
            while i < len(diff_lines) and not diff_lines[i].startswith(('@@', 'diff ')):
                line = diff_lines[i]
                if line.startswith('-'):
                    if pos < len(result_lines):
                        result_lines.pop(pos)
                        offset -= 1
                elif line.startswith('+'):
                    result_lines.insert(pos, line[1:])
                    pos += 1
                    offset += 1
                else:
                    pos += 1
                i += 1
        else:
            i += 1

    return ''.join(result_lines)


def extract_patch_from_response(response_text: str) -> str | None:
    """Extract code content from markdown code blocks in agent response."""
    # Try to find ```python ... ``` blocks
    pattern = r'```(?:python)?\s*\n(.*?)```'
    matches = re.findall(pattern, response_text, re.DOTALL)
    if matches:
        # Return the last/largest code block (likely the full file)
        return max(matches, key=len).strip()
    return None
