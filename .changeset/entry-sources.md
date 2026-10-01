---
'edgefit': patch
---

The settings line of a report says where the entries came from, for example `entries from wrangler.jsonc "main"`. A target that finds no entry uses another target's only when that target read it from a declaration, and Netlify Edge and Vercel Edge never do. A target left without an entry is skipped, and the report says where it looked. The run fails only when no target has an entry, and the error lists where each target looked.
