from __future__ import annotations

import argparse
import os
import re
import sys
import tomllib
from pathlib import Path
from typing import Any


REQUIRED_STRING_FIELDS = ("name", "description", "developer_instructions")
NICKNAME_PATTERN = re.compile(r"^[A-Za-z0-9 _-]+$")


def _is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _profile_paths(raw_paths: list[str]) -> list[Path]:
    profiles: list[Path] = []
    for raw_path in raw_paths:
        path = Path(raw_path)
        if path.is_dir():
            profiles.extend(sorted(path.glob("*.toml")))
        else:
            profiles.append(path)
    return profiles


def validate_profile(
    path: Path, *, expect_leaf: bool = False, check_paths: bool = False
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not path.is_file():
        return [f"file does not exist: {path}"], warnings

    try:
        with path.open("rb") as handle:
            profile = tomllib.load(handle)
    except (OSError, tomllib.TOMLDecodeError) as error:
        return [f"cannot parse TOML: {error}"], warnings

    for field in REQUIRED_STRING_FIELDS:
        value = profile.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{field} must be a non-empty string")

    name = profile.get("name")
    if isinstance(name, str) and name.strip():
        normalized_stem = path.stem.replace("-", "_")
        if normalized_stem != name:
            warnings.append(
                f"filename convention differs from name: {path.stem!r} vs {name!r}"
            )

    nicknames = profile.get("nickname_candidates")
    if nicknames is not None:
        if not isinstance(nicknames, list) or not nicknames:
            errors.append("nickname_candidates must be a non-empty array when present")
        elif not all(isinstance(item, str) and item for item in nicknames):
            errors.append("nickname_candidates entries must be non-empty strings")
        else:
            folded = [item.casefold() for item in nicknames]
            if len(set(folded)) != len(folded):
                errors.append("nickname_candidates must be unique")
            invalid = [item for item in nicknames if not NICKNAME_PATTERN.fullmatch(item)]
            if invalid:
                errors.append(
                    "nickname_candidates contain unsupported characters: "
                    + ", ".join(repr(item) for item in invalid)
                )

    for field in ("model_context_window", "model_auto_compact_token_limit"):
        value = profile.get(field)
        if value is not None and not _is_positive_int(value):
            errors.append(f"{field} must be a positive integer when present")

    context_window = profile.get("model_context_window")
    compact_limit = profile.get("model_auto_compact_token_limit")
    if _is_positive_int(context_window) and _is_positive_int(compact_limit):
        if compact_limit >= context_window:
            errors.append(
                "model_auto_compact_token_limit must be smaller than model_context_window"
            )

    for field in ("model", "model_reasoning_effort", "sandbox_mode"):
        value = profile.get(field)
        if value is not None and (not isinstance(value, str) or not value.strip()):
            errors.append(f"{field} must be a non-empty string when present")

    prompt_path = profile.get("model_instructions_file")
    if prompt_path is not None and (
        not isinstance(prompt_path, str) or not prompt_path.strip()
    ):
        errors.append("model_instructions_file must be a non-empty string when present")
    elif check_paths and isinstance(prompt_path, str):
        expanded = Path(os.path.expandvars(os.path.expanduser(prompt_path)))
        if not expanded.is_absolute():
            warnings.append(
                "model_instructions_file is relative; runtime resolution is host-specific"
            )
        elif not expanded.is_file():
            errors.append(f"model_instructions_file does not exist: {expanded}")

    features = profile.get("features")
    if features is not None and not isinstance(features, dict):
        errors.append("features must be a table when present")
        features = {}

    if expect_leaf:
        features = features if isinstance(features, dict) else {}
        if features.get("multi_agent") is not False:
            errors.append("leaf profile must set features.multi_agent = false")
        v2 = features.get("multi_agent_v2")
        if not isinstance(v2, dict) or v2.get("enabled") is not False:
            errors.append(
                "leaf profile must set features.multi_agent_v2.enabled = false"
            )

    return errors, warnings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate structural invariants in Codex custom-agent TOML files."
    )
    parser.add_argument(
        "paths", nargs="+", help="Profile TOML files or directories of immediate *.toml files."
    )
    parser.add_argument(
        "--expect-leaf",
        action="store_true",
        help="Require both supported multi-agent feature switches to be disabled.",
    )
    parser.add_argument(
        "--check-paths",
        action="store_true",
        help="Check absolute or home-relative model_instructions_file targets.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    paths = _profile_paths(args.paths)
    if not paths:
        print("ERROR: no TOML profiles found", file=sys.stderr)
        return 1

    failed = False
    for path in paths:
        errors, warnings = validate_profile(
            path, expect_leaf=args.expect_leaf, check_paths=args.check_paths
        )
        for warning in warnings:
            print(f"WARN {path}: {warning}")
        if errors:
            failed = True
            for error in errors:
                print(f"ERROR {path}: {error}", file=sys.stderr)
        else:
            print(f"OK {path}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
