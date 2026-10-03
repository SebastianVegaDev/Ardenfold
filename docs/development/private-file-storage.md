# Private file storage

`apps/api/src/files` owns private object transfer. PostgreSQL stores only tenant-scoped object metadata and an opaque storage key. The S3-compatible bucket must be private. The API never returns the key, storage endpoint or credentials. The file module does not decide whether an object is technical Evidence.

## Local setup

Set the `FILE_STORAGE_*` variables from `.env.example`, then run:

```text
docker compose up -d object-storage
pnpm --filter @ardenfold/api build
pnpm --filter @ardenfold/api files:local:init
```

The pinned VersityGW image provides a credentialed S3-compatible gateway on port 7070. `files:local:init` creates the private bucket through the S3 API and refuses non-local endpoints. Production may use another S3-compatible service with a pre-created private bucket; configure region, bucket, credentials and optional endpoint server-side. Never put these values in `NEXT_PUBLIC_*` variables.

## Upload and retention

1. `POST /api/v1/files` reserves an opaque ID using an idempotency key, declared type, exact length and SHA-256 digest.
2. `PUT /api/v1/files/{id}/content` accepts at most 10 MiB of `application/octet-stream` bytes. The API identifies PDF, JPEG, PNG or UTF-8 plain text from the bytes and checks the declared type, digest and length.
3. `POST /api/v1/files/{id}/finalize` rereads the object and verifies its bytes before making it referenceable. Repeating the same operation returns the same state.

Only the uploader can transfer or download an unclaimed file. `GET /api/v1/files/{id}/content` forces a download with `nosniff` and a sanitized display filename. A domain that retains a finalized file sets `retained_at` through its own authorized application boundary and serves it through a domain endpoint with domain-specific read authorization; the generic download rejects retained files. The storage key is never built from the filename.

`FileUploadsService.abandonExpired` marks unretained uploads abandoned in a transaction, then deletes their blob. Running it again retries deletion for already abandoned rows. A retained file cannot transition to abandoned or be deleted by this cleanup. The caller must supply an expiry cutoff; no queue or scheduled worker is introduced here.

The API emits audit actions for request, upload and finalization. Logs and audit metadata exclude file bytes, filenames, credentials and storage URLs. No malware scanning or content transformation is claimed.
