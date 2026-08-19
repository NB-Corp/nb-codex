# Third-Party Notices

This file identifies third-party and separately licensed content distributed
with this system. The root `LICENSE` applies only to original portions of the
system and does not replace the terms listed here.

## OpenAI Codex model catalog

- Bundled file: `models.json`
- Upstream project: OpenAI Codex
- Upstream source: <https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json>
- License: Apache License 2.0; see `LICENSES/Apache-2.0.txt`
- Provenance: this file is modified and derived from the upstream model catalog.
  The exact legacy upstream revision used to create the local copy was not
  recorded and is therefore unresolved.
- Material local modifications: the catalog was adapted for this managed Codex
  environment, including changes to the model lineup and ordering; model names
  and descriptions; capability, tool-mode, protocol, context-window, token,
  reasoning, and client-compatibility metadata; and embedded model instructions
  and messages.

The OpenAI Codex upstream distribution includes the following NOTICE
attribution. It is reproduced for attribution only, does not modify the
Apache-2.0 terms, and does not imply endorsement:

```text
OpenAI Codex
Copyright 2025 OpenAI

This project includes code derived from [Ratatui](https://github.com/ratatui/ratatui), licensed under the MIT license.
Copyright (c) 2016-2022 Florian Dehau
Copyright (c) 2023-2025 The Ratatui Developers
```

## codex-parallel-collab skill

- Bundled subtree: `skills/codex-parallel-collab/`
- License authority: `skills/codex-parallel-collab/LICENSE`
- License: MIT
- Copyright: Copyright (c) 2026 kic0c

The component-specific license remains authoritative for that subtree. The
root `LICENSE` does not replace it.
