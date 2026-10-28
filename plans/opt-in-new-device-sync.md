# Opt-in new-device sync

Status: approved 2026-10-20.

## Research summary

### Problem

Do not silently merge a never-synced device's meaningful local data into Drive.

### Requirements

- Never-synced device with local user data shows a decision modal.
- **Sync and reconcile** merges its local data with Drive now.
- **Log out** disconnects without syncing.
- Seed-only new device automatically syncs from Drive.
- Previously synced device automatically syncs.
- Signed-out clear is local-only.
- Signed-in clear is Drive/account-wide and says so; local-only clear requires sign-out.
- Modal explains backup and the sign-out/local-clear route for replacing local data with Drive.

### Constraints

- `seed:general` is present in every new repo; op count alone does not define local data.
- Existing connected clear deliberately resets Drive first.
- Login, boot, timer, focus, visibility, and online events all currently initiate sync.
- `sync:origin` is reset-generation tracking, not sync history.

### Relevant code

- `src/features/auth/AuthButton.tsx` — login/logout.
- `src/features/store.ts` — sync, boot, data tools.
- `src/features/RepoBootstrap.tsx` — lifecycle sync triggers.
- `src/sync/checkpointer.ts` — pull/merge/push engine.
- `src/core/repo/repo.ts` — seed and device-local `app_meta`.
- `src/features/settings/DataPanel.tsx` — export and clear controls.

## Chosen architecture

Use a persisted device-local sync-admission state machine. A separate `app_meta`
marker records only a successfully completed sync. It never reuses `sync:origin`.

This follows the established checkpoint pattern: sync state is persisted separately
from application data, as in [CloudKit sync-engine state](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5/event/stateupdate/stateserialization)
and [CouchDB replication checkpoints](https://docs.couchdb.org/en/stable/replication/protocol.html).

```text
trigger: login | boot | focus | timer | visible | online
                         |
                         v
                 central admission gate
                         |
       +-----------------+------------------+
       |                                    |
completed marker                        no marker
       |                                    |
  existing sync                     inspect local ops
                                            |
                           +----------------+----------------+
                           |                                 |
                      seed only                        user-created op
                           |                                 |
                     existing sync                     decision modal
                                                             |
                                            +----------------+---------------+
                                            |                                |
                                  Sync and reconcile                     Log out
                                            |                                |
                                     existing sync                    disconnect
                                            |
                                         success
                                            |
                               write completed marker
```

The central gate protects every sync caller. It treats only the deterministic
`seed:general` op as empty. Selecting reconciliation authorizes that one explicit
attempt; the completed marker is written only after the current sync engine
returns successfully. Failed attempts stay unadmitted and automatic triggers
remain blocked.

The modal explains both paths: reconciliation preserves and merges local data;
replacing local data with Drive requires backup, sign-out, local clear in
Settings, then sign-in.

## End state

A user may sign into a device with existing local data without accidental cloud
merge. Their explicit reconcile choice retains the current lossless merge
protocol. Empty devices and admitted devices retain automatic sync behavior.

Settings clearly separates signed-out local clearing from signed-in account-wide
Drive clearing.

## Migration

This is additive device-local metadata; no IndexedDB schema migration is needed.
Existing installations without the marker are evaluated once by local-op state:

- Seed-only installations auto-sync and become admitted after success.
- Installations with user-created local ops require consent before their first
  sync after this release.
- Existing `sync:origin` metadata is a one-time compatibility signal for devices
  that synced before this release; the first later success writes the dedicated
  marker. The dedicated marker is preserved by normal repo resets.

`sync:origin` retains its reset-adoption meaning. No Drive wire format, ledger,
snapshot, or merge ordering changes.

## Examples

| Device state | Result |
| --- | --- |
| New install, only `seed:general`, Drive has data | Automatic pull/merge; marker after success. |
| New device, local transaction/category, Drive has data | Modal; no pull or push before choice. |
| Same device after successful reconciliation | Automatic sync on future login/lifecycle events. |
| Modal → Log out | Disconnect; local data unchanged; later sign-in asks again. |
| Signed out → clear | Clears this device and admission state only. |
| Signed in → clear | Clears Drive/account world; UI says this is not local-only. |

## Behaviors to test

1. A seed-only never-synced device automatically receives cloud data.
2. A never-synced device with a user-created op does not read, merge, or push
   until reconciliation is explicitly accepted.
3. Accepted reconciliation uses the existing lossless merge and records admission
   only after success.
4. A failed reconciliation does not record admission or allow a background retry
   to merge without another explicit action.
5. An admitted device automatically syncs for login and lifecycle triggers.
6. Logging out from the decision modal leaves local state unchanged and does not
   write admission.
7. Signed-out clear removes local data and admission without Drive access.
8. Signed-in clear retains current Drive-first account-wide reset behavior and
   presents accurate local-clear guidance.
9. Reset-origin adoption behavior remains unchanged.

## Validation

- TDD each behavior: add one failing public-seam test, confirm its failure,
  implement the minimum pass, then continue.
- Use fake IndexedDB plus fake Drive tests for admission, merge, failure, reset,
  and signed-out clear cases.
- Add UI tests for modal actions and clear-data copy/state.
- Run `npm test`; run affected lint/type checks before handoff.
