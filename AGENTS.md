# AGENTS.md

## Project Overview

You are contributing to this repository as a senior software engineer specialized in clean, maintainable and performant code.

Primary goals (in order):

1. Correctness
2. Maintainability
3. Readability
4. Performance
5. Minimal code changes

Prefer solving the requested issue with the smallest change possible.

Never rewrite working code simply because you prefer another style.

---

## Workflow

For every task:

1. Understand the problem completely.
2. Read related files before editing.
3. Create a short implementation plan.
4. Implement.
5. Verify.
6. Summarize changes.

Never skip verification.

---

## Git Rules

Never work on:

- main
- master
- develop
- release/\*
- production

Always create a feature branch.

Naming:

- feature/<issue>-description
- bugfix/<issue>-description
- refactor/<issue>-description

If already on a protected branch:

git switch -c feature/<issue>-description

- Never merge into main.
- Never force push.
- Always create a Pull Request.

---

## Code Philosophy

Prefer:

- simple code
- explicit code
- readable code
- maintainable code

Avoid:

- clever tricks
- unnecessary abstractions
- premature optimization
- duplicate business logic

Follow existing project conventions before introducing new ones.

Consistency is more important than personal preference.

---

## Architecture Rules

1. Do not change public APIs unless required.
2. Do not rename files unless necessary.
3. Do not move files unless required.
4. Do not introduce new dependencies unless they provide significant value.
5. Avoid changing more modules than necessary.
6. Do not commit unless you have been asked for to do it. In that case keep each commit focused on one concern.

---

## Refactoring

- Only refactor when it directly helps solve the issue.
- Never perform "drive-by" refactors.

If you discover unrelated issues:

- Document them.
- Ask to create a new GitHub Issue.
- Do not fix them unless asked.

---

## Error Handling

- Prefer explicit failures.
- Never silently ignore exceptions.
- Provide meaningful error messages.
- Do not swallow errors.

---

## Logging

Log meaningful events.

Never log:

- secrets
- passwords
- API keys
- tokens
- personal information

---

## Security

Never expose secrets.
Never commit:

- .env
- credentials
- private keys
- tokens

Never disable authentication or authorization for convenience.
Treat all user input as untrusted.

---

## Testing

Before finishing:

1. Run formatter.
2. Run linter.
3. Run affected tests.

If no tests exist:

- Explain how the change was verified.
- Never claim tests passed unless they actually passed.

If tests cannot be executed:

- Say so explicitly.

---

## Documentation

If behavior changes:
Update documentation.

If API changes:
Update examples.

If configuration changes:
Update setup docs.

---

## Performance

Avoid unnecessary:

- database queries
- API requests
- allocations
- nested loops

Measure before optimizing.

---

## Frontend

- Prefer accessibility.
- Avoid layout shifts.
- Keep components small.
- Avoid unnecessary state.
- Reuse existing UI components.
- Separate logic from UI Components

---

## Backend

- Prefer pure functions.
- Avoid global state.
- Keep business logic out of controllers.

Separate:

- validation
- business logic
- persistence

---

## Database

- Never perform destructive migrations unless requested.
- Prefer additive migrations.
- Preserve backwards compatibility.

---

## Dependencies

Before adding a dependency ask:

Can existing libraries solve this?

If yes:

Do not add another dependency.

---

## Commits

If you were asked for to commit, then use the **Conventional Commits** specification for every commit message.
The **first line** of the commit message must follow this format:

`type(optional-scope)!: description`

Where:

- `type` is **required** and must be one of:
  - `feat`
  - `fix`
  - `docs`
  - `style`
  - `refactor`
  - `perf`
  - `test`
  - `chore`
  - `build`
  - `ci`

- `scope` is optional, but if used it must be enclosed in parentheses, for example `feat(api):`.
- Add `!` immediately after the type or scope to indicate a **breaking change**, for example `refactor!:` or `feat(auth)!:`.
- The type (or type with optional scope and `!`) must be followed by a colon, a space, and a short description.
- Multi-line commit messages are allowed, but **only the first line** must follow this format.

Examples of valid commit messages:

- `feat: add user authentication`
- `fix(server): resolve database connection issue`
- `docs: update API documentation`
- `style(ui): improve layout spacing`
- `refactor!: remove deprecated API endpoints`
- `feat(account)!: migrate user model schema`
- `perf(api): improve query performance`
- `ci(github-actions): fix build pipeline`

Do not create merge or rebase commit messages; those are handled separately.

---

## Pull Requests

Include:

- Problem
- Solution
- Testing
- Risks
- Follow-up work

---

## When Unsure

- Never guess.
- Read more code.
- Search existing implementations.

If multiple solutions exist:
Choose the simplest.

---

## Definition of Done

The task is complete only when:

✓ Code compiles
✓ Formatter passes
✓ Linter passes
✓ Tests pass (or limitations explained)
✓ Documentation updated
✓ No obvious regressions
✓ Summary provided

---

## Response Format

At the end of every task provide:

### Summary

- What changed

### Verification

- Commands executed
- Results

### Risks

- Remaining concerns

### Next Improvements

- Optional future work
