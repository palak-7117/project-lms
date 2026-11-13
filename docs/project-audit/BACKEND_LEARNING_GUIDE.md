# Backend learning guide

This guide uses the current LearnSpace source, not imaginary example files. Paths are relative to the repository root.

## A. Foundations

A backend is the server-side program that validates requests, applies permissions, reads/writes durable data, and returns responses. Node.js runs JavaScript outside the browser. Express is the web framework that routes HTTP requests into functions. An API is the agreed request/response interface. REST commonly models resources with HTTP methods. HTTP carries method, URL, headers and optional body. JSON is a text format for structured data.

LearnSpace login sends POST /api/auth/:role/login and gets JSON. A successful response is shaped like {success:true,data:{user,csrfToken}}. GET is for retrieval, POST for creation/actions, PUT replaces or upserts a record, PATCH partially updates, and DELETE removes a scoped resource. Status codes include 200 success, 201 created, 400 invalid input, 401 unauthenticated, 403 wrong role or policy denial, 404 missing/unavailable resource, 409 state conflict/duplicate, 413 oversized upload, 503 DB or required file cleanup unavailable, and 500 unexpected server fault.

Why needed: a Student must not be able to grant themselves a semester; browser controls alone cannot enforce that.

## B. Layers and request processing

- backend/src/server.js loads configuration, opens the HTTP listener, starts the retry worker, and closes server/pool on shutdown.
- backend/src/app.js creates Express, applies Helmet, exact-origin CORS, JSON/urlencoded parsing, mounts routes, then 404/error middleware.
- backend/src/routes/*.routes.js declares URL/method and middleware order.
- backend/src/middleware/requireAuth.js validates the opaque cookie session against user_sessions/users and attaches req.auth.
- requireRole.js checks roles; requireCsrf.js checks allowed Origin and double-submit CSRF cookie/header.
- backend/src/controllers maps req.params/body/auth to service functions and emits the JSON envelope.
- backend/src/services contains business rules and SQL. admin.service.js handles academics; academic.service.js handles offerings and coursework; auth.service.js handles sign-in; account-deletion.service.js scopes permanent deletion.
- backend/src/config/env.js validates exact frontend origins. config/db.js sets the pool. config/auth.js centralizes cookie names and token helpers.
- backend/src/utils/transaction.js provides commit/rollback; ApiError.js and asyncHandler.js route errors to the central handler.
- backend/src/storage/index.js selects a provider; local.js stores private bytes.

Flow: request → Express parsers/security → route authentication/authorization/CSRF → controller → service validation/query → MySQL/storage → JSON response. The central error middleware omits SQL messages and secrets.

## C. MySQL with mysql2

mysql2/promise returns promises; await makes query order explicit. config/db.js calls mysql.createPool with waitForConnections, 10-connection limit, utf8mb4, and a 10-second connection timeout. A pool reuses connections; do not create a new TCP connection per request. For a multi-query transaction, utils/transaction.js obtains one pooled connection, begins, executes the callback, commits or rolls back, and releases it.

Prepared statements bind values using ?. Actual login query in auth.service.js:

~~~js
const [rows] = await db.execute(
  "SELECT id, email, password_hash AS passwordHash FROM users WHERE email = ? LIMIT 1",
  [email]
);
~~~

Placeholders protect values from being treated as SQL syntax. Dynamic SQL identifiers cannot be bound; the code uses fixed table names and allowlisted update fields. Never concatenate an untrusted value into a SQL string.

Actual allocation is multi-step: lock eligible Student, lock active semester, update student_profiles.current_semester_id, insert student_semester_history, then commit. If a step throws, rollback keeps allocation/history in sync.

Common beginner mistakes: omitting await; forgetting release; writing related rows without a transaction; using string concatenation for SQL; returning a DB error's SQL text to the browser.

## D. Authentication and security

Passwords are hashed using argon2id in auth.service.js and admin.service.js; the hash is stored in users.password_hash. Argon2id is intentionally computationally expensive and salted. It is not reversible encryption. The login code even verifies a dummy hash for unknown users to reduce timing differences. Raw passwords must not be logged or stored.

Login validates the requested role, finds email, verifies hash and account status, then checks Student admission/authorization or Teacher profile. It generates a 32-byte random token, returns it only as a cookie, and stores SHA-256(token) in user_sessions. requireAuth hashes the cookie and queries a non-revoked, non-expired session; it also enforces a 30-minute idle limit and refreshes last_seen_at. Logout revokes the matching hash and clears cookies.

Cookies: session cookie is HttpOnly, SameSite=Lax, path=/, 8-hour max-age. Production uses Secure and __Host- prefix. CSRF token cookie is readable by JS; frontend echoes it in X-CSRF-Token. requireCsrf compares in constant time and rejects non-allowlisted origins. CORS uses exact configured origins and credentials; wildcard is rejected. CSRF protection complements, not replaces, authentication/authorization.

Role checks are server-side: route groups apply requireAuth then requireRole. auth-guard.js also redirects wrong-role users, but that is user experience only; API middleware is the actual security boundary.

## E. Browser/API connectivity

frontend/api-client.js defines window.LearnSpaceApi. baseUrl defaults to current host on port 5000 plus /api. Every fetch uses credentials: include. Unsafe methods first obtain CSRF if necessary and send X-CSRF-Token. Object bodies are JSON.stringify'd with application/json; FormData is sent without manually setting Content-Type so the browser adds its multipart boundary. parseResponse checks HTTP and success, then returns data; ApiError carries status/code.

The login form in frontend/script.js obtains CSRF, posts credentials, then redirects based on returned role. auth-guard.js asks /auth/me before showing role pages, sets current user in memory, and dynamically loads the page-specific API module. Loading and action errors are rendered on the page. Common mistakes: forgetting credentials include; manually setting multipart Content-Type; trusting a role value from localStorage; swallowing all errors without a useful user message.

## F. File handling

Multer in middleware/upload.js accepts multipart field files, memory storage, up to 10 MB per file and at most 5 files. The allowlist is PDF, common images, DOC/DOCX and PPT/PPTX. academic.service.js checks the content's magic signature, chooses a UUID filename/key, computes SHA-256, and inserts metadata. Original name is metadata, never used as the storage path.

storage/local.js writes outside frontend under FILE_STORAGE_DIR with restrictive mode and validates the key format. GET /api/files/:fileId authenticates and checks a Teacher owns the offering or Student is eligible. It holds a DB file-row shared lock while streaming. Deletion queues unreferenced assets in file_cleanup_jobs, retries with backoff, and removes a physical file only when no material/submission association remains. This implementation has only the local provider; cloud storage is a future adapter.

## G. Testing

- Unit tests isolate a small function. There are no separately named pure unit-test files in the current test inventory.
- Integration tests exercise HTTP, services and MySQL. tests/harness.js clones all 19 live table DDL statements into a generated test schema; writes and cleanup target only that schema.
- Browser tests run Playwright with a local frontend/backend. They execute role UI flows and inspect console/network results. Bundled Chromium launch is refused on this host; harness falls back to installed Chrome.
- Run from backend: npm test and npm run test:browser. Current observed results are 11/11 integration tests and browser workflow pass in Chrome 157. These are point-in-time results, not proof of coverage for every branch or production environment.

Common mistakes: running test cleanup against the development DB, confusing source DB reads with test DB writes, considering a test pass equivalent to security certification, or ignoring failed browser requests.