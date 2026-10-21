---
'edgefit': patch
---

List the content type check of the `@grpc/grpc-js` server as code that a gRPC client on `deno` never runs. It runs only when a project starts a gRPC server. The Firestore client is a gRPC client. `firebase-admin/firestore` no longer fails on `node:http2.constants.HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE` on Deno.
