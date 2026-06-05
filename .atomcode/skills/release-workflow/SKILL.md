# release-workflow

Create a standardized release: bump version, generate changelog, build, and tag.

## When to use
Use this skill when preparing a new release of the Markdown Editor.

## Workflow

1. **Read current version** from `package.json`
2. **Ask user for new version** (or auto-increment patch/minor/major)
3. **Update version** in `package.json`:
   - Update the `version` field
4. **Generate CHANGELOG** section by scanning `git log` since last tag
5. **Run build**: `npm run build`
6. **Create git tag**: `git tag v<version> && git push --tags`
7. **Summarize** what was released

## Arguments

- `version`: semver bump type (`patch`, `minor`, `major`) or explicit version string
- Default: `patch`

## Example

```
/release-workflow minor
```
