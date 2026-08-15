# Publish to xFrame.ai

Reusable composite action for public or **private** source repositories that
need to copy built skills and GitHub Actions into
[exergy-connect/xFrame.ai](https://github.com/exergy-connect/xFrame.ai).

Callers do not vendor a sync script. Pin a branch, tag, or SHA.

## Usage

Store a token with **contents write** on `exergy-connect/xFrame.ai` as
`XFRAME_AI_TOKEN` in the calling repository.

```yaml
- uses: exergy-connect/xFrame.ai/.github/actions/publish-to-xframe-ai@main
  with:
    token: ${{ secrets.XFRAME_AI_TOKEN }}
    dirs_mapping: |
      action-dist|actions/my-tool
      skill|skills/my-tool
    remove_paths: |
      skills/my-tool/scripts
    commit_message: 'chore: sync my-tool from my-repo [skip ci]'
```

Directory mappings **replace** the destination tree, so stale files under that
dest go away. Use `remove_paths` only for leftovers outside those dests
(renamed folders).

Optional `source_root` prefixes every source path. Optional `target_branch`
selects a non-default branch on the target repo.

## Inputs

| Input | Required | Default |
| --- | --- | --- |
| `token` | yes | |
| `files_mapping` | no | |
| `dirs_mapping` | no | |
| `remove_paths` | no | |
| `source_root` | no | |
| `commit_message` | no | `chore: sync from source [skip ci]` |
| `target_repo` | no | `exergy-connect/xFrame.ai` |
| `target_branch` | no | target default branch |
| `user_name` | no | `GitHub Actions` |
| `user_email` | no | `actions@github.com` |

## Outputs

| Output | Description |
| --- | --- |
| `committed` | `true` when a commit was pushed |
| `commit_sha` | Publish commit SHA, when created |
