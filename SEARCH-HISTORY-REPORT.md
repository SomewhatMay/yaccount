# Search action history report

## Purpose

The search bar shows common actions before the user types. It also shows recent actions. This
history helps the user repeat an action.

## Stored data

The app stores one JSON object in `localStorage`. The key is `yaccount.command.history`. The object
has a version number and an `actionIds` list.

The list has a maximum of six items. Each item is an opaque action ID. The app does not store search
text, labels, container names, amounts, dates, or timestamps.

The history is device-local. The app does not put it in IndexedDB. The app does not write it to the
operation log. The app does not sync or export it.

## Safety

The live action catalog is the authority. A stored ID cannot create an action. The app ignores an
ID when the current catalog does not contain it. The next history write removes stale IDs.

The parser accepts only version 1 and valid action IDs. It removes duplicates and applies the
six-item limit. Invalid or future data gives an empty history.

The existing preference layer catches storage read and write errors. A blocked or full storage area
does not block an action. Common actions stay available. Recent actions stay empty.

Account clear, import, and rollback can leave old IDs in `localStorage`. These IDs have no effect
unless the new live catalog contains the same ID. Static actions can remain useful. Missing
investment actions do not appear.

Browser tabs use the existing storage event. The last write wins. This is acceptable because the
list is a convenience and contains no account truth.

## Efficiency

The list is small and bounded. Grouping uses a map and a set. Its work is proportional to the action
catalog plus six history items. The hook memoizes the decoded list and its writer.

A blank search does not build the ledger-wide search index. The app builds that index only after the
user types a real query.

## Practical tradeoff

The app records a search action when the user selects it. It does not wait for a later form save.
Therefore, the list is command history, not financial activity history.

## Verification

Vitest covers the schema, version, limit, order, deduplication, stale IDs, grouping, and preference
boundary. Playwright covers persistence after reload, blocked storage, action repetition, and typed
destination search.
