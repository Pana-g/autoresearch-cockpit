"""Tests for patch validation."""

import pytest

from app.services.patch_validator import (
    PatchValidationError,
    extract_patch_from_response,
    validate_patch,
)

VALID_TRAIN_PY = """\
import torch
import torch.nn as nn

class SimpleModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(10, 1)

    def forward(self, x):
        return self.linear(x)

if __name__ == "__main__":
    model = SimpleModel()
    print("Training...")
"""


class TestValidatePatch:
    def test_valid_full_replacement(self):
        new_code = VALID_TRAIN_PY.replace("Linear(10, 1)", "Linear(10, 5)")
        result = validate_patch(new_code, VALID_TRAIN_PY)
        assert "Linear(10, 5)" in result

    def test_invalid_python_syntax(self):
        bad_code = "def broken(\n  this is not valid python"
        with pytest.raises(PatchValidationError, match="invalid Python"):
            validate_patch(bad_code, VALID_TRAIN_PY)

    def test_empty_patch(self):
        with pytest.raises(PatchValidationError, match="empty"):
            validate_patch("", VALID_TRAIN_PY)

    def test_whitespace_only_patch(self):
        with pytest.raises(PatchValidationError, match="empty"):
            validate_patch("   \n\n  ", VALID_TRAIN_PY)

    def test_diff_targeting_wrong_file(self):
        diff = """\
--- a/prepare.py
+++ b/prepare.py
@@ -1,3 +1,3 @@
-old line
+new line
"""
        with pytest.raises(PatchValidationError, match="disallowed file"):
            validate_patch(diff, VALID_TRAIN_PY)


class TestExtractPatchFromResponse:
    def test_extract_python_block(self):
        response = """\
Here is my rationale.

```python
import torch
print("hello")
```
"""
        result = extract_patch_from_response(response)
        assert result is not None
        assert "import torch" in result

    def test_extract_plain_code_block(self):
        response = """\
Rationale here.

```
x = 1
y = 2
```
"""
        result = extract_patch_from_response(response)
        assert result is not None
        assert "x = 1" in result

    def test_no_code_block(self):
        response = "Just some text with no code blocks."
        result = extract_patch_from_response(response)
        assert result is None

    def test_multiple_blocks_returns_largest(self):
        response = """\
Small block:
```python
x = 1
```

Full file:
```python
import torch
import torch.nn as nn

class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.linear = nn.Linear(10, 1)

    def forward(self, x):
        return self.linear(x)
```
"""
        result = extract_patch_from_response(response)
        assert result is not None
        assert "class Model" in result
