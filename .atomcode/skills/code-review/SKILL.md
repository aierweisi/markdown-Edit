# code-review

Review Markdown Editor code for quality, consistency, and maintainability.

## Focus Areas

### 1. Code Style
- Prefer early returns over nested conditions
- Use `const` over `let` where possible
- Favor descriptive variable names (avoid single-letter `e`, `t`, `n` in new code)
- Keep functions focused on one responsibility

### 2. Minified Source Files
- `renderer/js/app.js` is a build artifact — DO NOT edit directly
- All changes must go to individual source files in `renderer/js/`
- After editing source files, run `npm run minify` to regenerate

### 3. Electron Best Practices
- All IPC communication goes through `preload.js`'s `contextBridge`
- `nodeIntegration` must remain `false` (security)
- Store access goes through IPC handlers in `main.js`

### 4. Security
- All user-provided content must pass through `escHtml()` in the renderer
- DOMPurify should remain the HTML sanitization layer
- CSP must not be weakened
- No `eval()` or `new Function()`

### 5. Testing
- Pure utility functions must have tests in `tests/pure.test.js`
- Run `npm test` before committing
- Test coverage must not decrease

## User Invocation
```
/code-review [file-path]
```
