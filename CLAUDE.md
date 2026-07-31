## Testing

TDD for all behavior changes. Write a failing test, confirm it fails
for the right reason, then write the minimum code to pass. Run `npm test`.

Never write implementation before its test. Never edit a test to make
failing code pass.

Skip TDD for formatting, comments, docs, config/dependency bumps, and
renames. If something is untestable, say so before proceeding.