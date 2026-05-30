# Changelog

## [1.0.1](https://github.com/mnemom/cards-action/compare/v1.0.0...v1.0.1) (2026-05-30)


### Bug Fixes

* **security:** remediate audit findings (cards-action) ([#2](https://github.com/mnemom/cards-action/issues/2)) ([e7052dc](https://github.com/mnemom/cards-action/commit/e7052dcb0fc13018d49d423415b947ae2c41a657))

## [1.0.0] — 2026-05-21

Initial release. Editorial-feedback GitHub Action for Mnemom alignment +
protection manifests.

### Features

- Detects changed `.mnemom/<scope>/**.yaml` files on every pull request.
- Posts a sticky, care-framed PR comment summarizing the proposed change:
  composed-view diff against the agent's current effective state,
  simulate verdicts for golden-path tool calls, and explain trace from
  the policy engine.
- Configurable failure mode via `.mnemom/ci-config.yaml`: `hard_fail`,
  `soft_warn`, or `pass` per simulate verdict.
- Care-framing doctrine enforced on all rendered prose — forbidden words
  surface as a self-test failure before any comment is posted.
- GitHub-only V1. GitLab, Bitbucket, Azure DevOps, Gitea, and Forgejo
  ports are post-V1-GA backlog.
- Read-only against the Mnemom API. Never PUTs or PATCHes. The merge
  step does not auto-publish; an operator runs `publish_manifest`
  separately to update the canonical card.

For org-wide enforcement (Semgrep + CodeQL rulesets, branch-protection
automation across N repos, compliance posture dashboard), see the
Mnemom Compliance Suite — Phase 6 deliverable.
