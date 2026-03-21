# Security Audit Task

Using your vibecoder review skill, and by researching common security risks AI implements on the web, check the entire codebase and make a full audit.

Then fix all found vulnerabilities.

Then make another audit.

Continue this audit → fix → audit cycle until there are no more vulnerabilities or errors found.

Focus areas:
- Authentication & authorization (NextAuth, JWT, session handling)
- API route security (missing auth checks, IDOR, improper ownership validation)
- Input validation & sanitization (XSS, SQL injection via Prisma, command injection)
- File upload security (magic byte validation, path traversal, MIME type spoofing)
- Rate limiting gaps (brute force on login/register, comment spam, API flooding)
- CSRF protection on state-changing endpoints
- Open redirects (middleware callbackUrl, login redirects)
- Information disclosure (error messages leaking internals, stack traces)
- Insecure direct object references across all API routes
- Visibility enforcement on posts, notebooks, notifications, co-work sessions
- Middleware coverage gaps (unprotected routes, onboarding bypass)
- Dependency vulnerabilities (run npm audit)
- Environment variable exposure
- Prisma query safety (raw queries, injection risks)
- Frontend security (dangerouslySetInnerHTML, unsafe URL rendering, avatar src injection)
- Co-work session security (lock takeover, session hijacking, participant spoofing)
- Notification data integrity (payload validation on creation and rendering)
