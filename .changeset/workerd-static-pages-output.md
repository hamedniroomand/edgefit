---
'edgefit': patch
---

`edgefit check` now gives a clean result for a Cloudflare Pages project whose output folder holds static files only. Before, it failed with `No entry point to scan.` and exit code 2. Now it ends with exit code 0 and a note that there is no server code to check on workerd. The report shows `no server code`, and the JSON `entries` list is empty. The output folder has no `_worker.js`, and the project has no `functions/` folder. The Nitro marker (`nitro.json`) is missing or names a static preset. When the marker names a server preset and the folder has no worker, the advice now shows the build date of the marker, so you can see an old build.
