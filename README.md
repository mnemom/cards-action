# Mnemom Cards Action

Editorial-feedback CI tool for Mnemom alignment + protection manifests.
Posts a sticky, care-framed PR comment whenever a `.mnemom/<scope>/**.yaml`
file changes in a pull request.

For org-wide enforcement (Semgrep + CodeQL rulesets,
branch-protection automation across every repo, compliance posture
dashboard), see the **Mnemom Compliance Suite** — Phase 6 deliverable on
[docs.mnemom.ai](https://docs.mnemom.ai). This action is the
editorial-feedback layer that the Compliance Suite builds on top of.

## What it does

On every pull request that touches a `.mnemom/<scope>/**.yaml` file, the
action:

1. Detects the scope of each changed manifest (`agents/`, `protection/`,
   `orgs/`, `teams/`, `platform/`).
2. Parses the manifest and locally compares it against the agent's
   current composed (effective) state via `GET /v1/<resource>/agent/<id>/effective`.
3. Runs simulate against any golden-path tool calls declared in
   `.mnemom/tests/simulate-cases.yaml` (alignment scope, agent only).
4. Pulls the current explain trace via `POST /v1/<resource>/agent/<id>/explain`.
5. Renders a single sticky comment — updated on each push, never duplicated.
6. Sets the CI check status per `.mnemom/ci-config.yaml`
   (`hard_fail`, `soft_warn`, or `pass`).

The action is **read-only**. It never PUTs or PATCHes. The merge step
doesn't auto-publish — an operator runs `publish_manifest` to update the
canonical card after merge.

## Usage

```yaml
# .github/workflows/cards-action.yml
name: Cards Action
on:
  pull_request:
    paths:
      - '.mnemom/**'
jobs:
  cards-action:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: mnemom/cards-action@v1
        with:
          api-key: ${{ secrets.MNEMOM_API_KEY }}
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | yes | — | Mnemom API key. `api:read` scope is sufficient. Set as a repository secret. |
| `api-base-url` | no | `https://api.mnemom.ai` | Override for staging or a self-hosted Mnemom instance. |
| `config-path` | no | `.mnemom/ci-config.yaml` | Path to behavior config. |
| `simulate-cases-path` | no | `.mnemom/tests/simulate-cases.yaml` | Path to golden-path simulate cases. |
| `github-token` | no | `${{ github.token }}` | Token for posting the PR comment. |

### `.mnemom/ci-config.yaml`

```yaml
behavior:
  on_allowed_false: hard_fail       # hard_fail | soft_warn | pass
  on_allowed_conditional: soft_warn
  on_allowed_true: pass
  on_action_error: soft_warn        # how to behave when the API is unreachable
```

If the file is absent, defaults apply: `hard_fail` on false,
`soft_warn` on conditional, `pass` on true, `soft_warn` on API errors.

### `.mnemom/tests/simulate-cases.yaml`

```yaml
cases:
  - agent_id: smolt-512448e7
    resource: alignment
    description: "Send a campfire message in #ops"
    candidate_tool_call:
      tool_name: campfire_send_message
      tool_args:
        channel: ops
        message: "Daily standup"
```

Each case runs through `POST /v1/<resource>/agent/<agent_id>/simulate`.
Verdicts surface in the PR comment.

## Care framing as mechanism

Every customer-facing prose surface in this action is care-framed. The
following words never appear in PR comments, error messages, or
documentation:

- Blocked
- Denied
- Required
- Forbidden
- Violation
- Must

Replacement vocabulary:

- *"would benefit from"*
- *"depends on"*
- *"run X, then retry"*
- *"is supported by"*

This is enforced by a test that scans every source file under doctrine.
Customers fork-extending this action inherit the same scanner.

## Versioning

Semver. `v1` is the floating major tag — `v1.0.0`, `v1.0.1`, etc. The
Mnemom API surface this consumes is locked by Phase 4; minor bumps are
additive only.

## Roadmap

- **V1 (this release)** — GitHub. Editorial feedback per PR.
- **V1.x** — Manifest preview-compose with full coherence violations
  surfaced (depends on a follow-on `preview-from-manifest` mnemom-api
  endpoint).
- **Phase 6 — Mnemom Compliance Suite (separate deliverable)** —
  org-wide enforcement: GitHub App + Semgrep / CodeQL rulesets
  (`no raw anthropic / openai imports`, `no plain-string API keys`,
  `agents have manifests`), branch-protection automation, compliance
  posture dashboard. The cards-action is one of several thin clients
  the Compliance Suite uses.
- **Post-V1-GA** — GitLab CI / Bitbucket Pipelines / Azure DevOps /
  Gitea / Forgejo ports. Same Mnemom API surface; different glue layer.

## License

[MIT](LICENSE).
