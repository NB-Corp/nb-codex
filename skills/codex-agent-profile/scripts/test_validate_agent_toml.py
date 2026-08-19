from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from validate_agent_toml import validate_profile


VALID_LEAF = '''
name = "reader"
description = "Read-only evidence specialist."
developer_instructions = "Read the delegated evidence and report exact anchors."
model_context_window = 400000
model_auto_compact_token_limit = 256000
model_instructions_file = "{prompt}"
nickname_candidates = ["Atlas", "Delta"]

[features]
multi_agent = false

[features.multi_agent_v2]
enabled = false
'''


class ValidateAgentTomlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        self.prompt = self.root / "shared.md"
        self.prompt.write_text("shared\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write(self, name: str, content: str) -> Path:
        path = self.root / name
        path.write_text(content, encoding="utf-8")
        return path

    def test_valid_leaf_with_existing_prompt(self) -> None:
        path = self.write(
            "reader.toml", VALID_LEAF.format(prompt=self.prompt.as_posix())
        )
        errors, warnings = validate_profile(
            path, expect_leaf=True, check_paths=True
        )
        self.assertEqual(errors, [])
        self.assertEqual(warnings, [])

    def test_missing_required_field_and_leaf_guards_fail(self) -> None:
        path = self.write(
            "reader.toml",
            'name = "reader"\ndescription = "Read evidence."\n',
        )
        errors, _ = validate_profile(path, expect_leaf=True)
        self.assertTrue(any("developer_instructions" in error for error in errors))
        self.assertTrue(any("features.multi_agent = false" in error for error in errors))
        self.assertTrue(
            any("features.multi_agent_v2.enabled = false" in error for error in errors)
        )

    def test_invalid_nickname_and_compaction_limit_fail(self) -> None:
        content = VALID_LEAF.format(prompt=self.prompt.as_posix()).replace(
            '["Atlas", "Delta"]', '["Atlas", "Atlas", "Bad!"]'
        ).replace("256000", "400000")
        path = self.write("reader.toml", content)
        errors, _ = validate_profile(path, expect_leaf=True)
        self.assertTrue(any("unique" in error for error in errors))
        self.assertTrue(any("unsupported characters" in error for error in errors))
        self.assertTrue(any("must be smaller" in error for error in errors))

    def test_missing_shared_prompt_fails_only_when_checked(self) -> None:
        missing = self.root / "missing.md"
        path = self.write(
            "reader.toml", VALID_LEAF.format(prompt=missing.as_posix())
        )
        errors_without_check, _ = validate_profile(path, expect_leaf=True)
        errors_with_check, _ = validate_profile(
            path, expect_leaf=True, check_paths=True
        )
        self.assertEqual(errors_without_check, [])
        self.assertTrue(any("does not exist" in error for error in errors_with_check))


if __name__ == "__main__":
    unittest.main()
