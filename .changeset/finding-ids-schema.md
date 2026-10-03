---
'edgefit': minor
---

Add a stable `id` to each finding in the JSON report, and publish the JSON schema of the report. The npm package includes the schema as `edgefit/schema/report-v2.json`. Build output with no file of the project is now one finding for each API, so `edgefit diff` does not report it as fixed and new when a chunk name changes.
