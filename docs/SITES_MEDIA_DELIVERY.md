# Large media source delivery

The source service limits each Git push request to 64 MiB. This is a transfer limit, not a repository storage limit. Use the official Sites source workflow and keep repository credentials in stdin/session memory.

For a media replacement larger than the per-push limit, introduce media objects in separate source commits below 38 MiB each, without deploying those intermediate commits. Activate only the fully validated final manifest and publish only its matching archive.

Before a final commit that moves already-uploaded binaries to their served paths, run `git config --local pack.useSparse false` in this repository. Git's default sparse pack traversal can include extra objects after direct renames. This changes local packing only; it does not change remote permissions or credentials. Reference: https://git-scm.com/docs/git-config#Documentation/git-config.txt-packuseSparse

For the bird-removal revision, the final media move produced a 151,608,557-byte local pack with `--sparse` and a 10,087,071-byte pack with `--no-sparse`, using the same final and remote-base commits. Verify the actual next pack is below the service limit before retrying a rejected large push. Never retry the same oversized payload unchanged.

The deployed revision contains the old film with the interval [88.5, 114.0) removed. It is 203 seconds of film plus the existing 90-second finale. It is separate from the planned 322-second Malaysia story in `docs/malaysia-film/`; that new film has zero generated video clips at this checkpoint.
