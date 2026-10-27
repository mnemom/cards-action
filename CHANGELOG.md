# Changelog

## [1.0.1](https://github.com/mnemom/cards-action/compare/v1.0.0...v1.0.1) (2026-10-27)


### Bug Fixes

* **deps:** bump source-map-js 1.2.1 -&gt; 1.2.2 in lockfile (Dependabot [#36](https://github.com/mnemom/cards-action/issues/36)) ([#9](https://github.com/mnemom/cards-action/issues/9)) ([c769918](https://github.com/mnemom/cards-action/commit/c76991886ab8277a72f3f0a39a886b4ce9e57307))
* **deps:** bump undici 6.28.1 -&gt; 6.29.1 and vite 6.4.3 -&gt; 6.4.4 (Dependabot [#39](https://github.com/mnemom/cards-action/issues/39)-[#45](https://github.com/mnemom/cards-action/issues/45)) ([#11](https://github.com/mnemom/cards-action/issues/11)) ([1b3b2fc](https://github.com/mnemom/cards-action/commit/1b3b2fce6b1fe5a357206f5aaf08127f43abdad6))
* **deps:** bump vitest + @vitest/coverage-v8 4.1.11 -&gt; 4.1.12 for @vitest/mocker (Dependabot [#38](https://github.com/mnemom/cards-action/issues/38)) ([#10](https://github.com/mnemom/cards-action/issues/10)) ([55b051d](https://github.com/mnemom/cards-action/commit/55b051dfddb4eb30562a525a81d61cd6f8319796))
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
