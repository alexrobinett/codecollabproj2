# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeCollabProj is a full-stack web application for computer club members to collaborate on projects. It features user authentication with session management, project CRUD with collaboration requests, direct messaging, comments, admin dashboard, and role-based access control.

**Tech Stack:** React 18 + TypeScript (Vite) frontend, Express.js + TypeScript backend, MongoDB with Mongoose ODM.

## Development Commands

### Running the Application

```bash
npm run dev           # Start both client (port 3000) and server (port 5001) concurrently
npm run client        # Start only Vite dev server (port 3000)
npm run server        # Start only Express server with tsx (port 5001)
npm run install-all   # Install dependencies for root, client, and server
```

### Testing

```bash
# Server tests (Jest + ts-jest)
cd server && npm test              # Run all server tests
cd server && npm run test:watch    # Watch mode
cd server && npm run test:coverage # With coverage

# Client tests (Vitest)
cd client && npm test              # Run client tests (vitest run)
cd client && npm run test:watch    # Watch mode (vitest)
cd client && npm run test:coverage # With coverage

# E2E tests (Playwright - requires running server + client + MongoDB)
npm run test:e2e                   # Run full E2E suite
npm run test:e2e:headed            # Run with visible browser
npm run test:e2e:critical          # Run critical subset only
npm run test:e2e:security          # Run cookie-auth-security tests
```

### Linting & Type Checking

```bash
npm run lint          # ESLint both client and server
npm run lint:fix      # Auto-fix lint issues
npm run typecheck     # TypeScript type check both sides
npm run format        # Prettier formatting
```

### Database

```bash
cd server && npm run seed          # Seed database with sample data (10 test users + projects)
cd server && npm run verify-all    # Verify all user emails
cd server && npm run reset-users   # Reset users to default state
```

### Building for Production

```bash
npm run build         # Build client for production (outputs to client/build/)
cd server && npm run build  # Compile server TypeScript (outputs to server/dist/)
```

## Architecture

### Monorepo Structure

```
/client              - React 18 frontend (Vite + TypeScript)
/server              - Express.js backend (TypeScript, run via tsx)
/tests               - Playwright E2E tests
  /e2e               - Full E2E test suite (11 spec files)
  /e2e-critical      - Critical path tests (auth, auth-flow, projects)
/.github/workflows   - CI/CD pipeline (GitHub Actions)
```

### Backend Architecture (server/)

- **Pattern**: MVC with service layer
- **Runtime**: Node.js with `tsx` for TypeScript execution (no pre-compilation needed for dev)
- **Entry point**: `server/index.js` (CommonJS, uses tsx to run .ts files)

```
server/
├── config/constants.ts       # Centralized configuration constants
├── controllers/              # Business logic (5 controllers, .js files)
│   ├── authController.js     # Register, login, logout, password reset, email verification
│   ├── projectController.js  # Project CRUD, collaboration, image upload
│   ├── userController.js     # Profile, messaging, avatar, user search
│   ├── commentController.js  # Comment CRUD
│   └── adminController.js    # Dashboard stats, user management, logs
├── middleware/                # Express middleware (all .ts files)
│   ├── auth.ts               # JWT validation from httpOnly cookies or Authorization header
│   ├── rbac.ts               # Role/permission checks (requireRole, requirePermission, requireAdmin)
│   ├── validators.ts         # express-validator chains for all endpoints
│   ├── errorHandler.ts       # Global error handler with SecurityError class
│   └── securityMonitoring.ts # Failed auth tracking, suspicious activity detection
├── models/                   # Mongoose schemas (all .ts files)
│   ├── User.ts               # User with RBAC, suspension, email verification
│   ├── Project.ts            # Project with collaborators and incentives
│   ├── Comment.ts            # Project comments
│   ├── Message.ts            # Direct messages
│   └── Session.ts            # JWT session tracking with device info
├── routes/                   # Express routers (all .js files)
│   ├── auth.js, projects.js, users.js, comments.js, admin.js
├── services/                 # Business services (.ts files)
│   ├── sessionService.ts     # JWT dual-token management, session CRUD
│   └── emailService.ts       # Nodemailer email sending (verification, password reset)
├── utils/                    # Utilities (.ts files)
│   ├── logger.ts             # Structured JSON logger with security events
│   ├── gridfs.ts             # MongoDB GridFS for file storage
│   ├── envValidator.ts       # Environment variable validation at startup
│   ├── passwordValidator.ts  # Password strength validation
│   └── scheduledTasks.ts     # Session cleanup, suspension expiry checks
└── types/models.ts           # TypeScript interfaces for all models
```

**Key middleware chain** in `index.js`:
1. CSP nonce generation
2. Helmet (security headers with CSP)
3. CORS (restrictive, configured per environment)
4. MongoDB sanitization (`express-mongo-sanitize`)
5. Security monitoring (failed auth, suspicious activity, access violations)
6. Body parsing (JSON + URL-encoded, 10MB limit)
7. Cookie parser (for httpOnly cookie auth)
8. Rate limiting (production only: general, auth-specific, admin, password reset)

**Authentication System:**
- JWT dual-token: access token (15 min) + refresh token (7 days)
- Primary: httpOnly cookies (XSS protection). Fallback: Authorization Bearer header
- Session records in MongoDB with device info, TTL auto-expiry
- Concurrent session limit (default 3 per user)
- Cookie flags: `httpOnly`, `secure` (production), `sameSite: lax`

**RBAC System** (`middleware/rbac.ts`):
- Three roles: `user`, `moderator`, `admin`
- Fine-grained permissions: `users.*`, `projects.*`, `comments.*`, `admin.*`, `moderate.*`
- Middleware: `requireRole()`, `requirePermission()`, `requireAdmin`, `requireModerator`
- `requireOwnershipOrAdmin()` for resource-level access control
- Account suspension and deactivation checks built into all RBAC middleware

### Frontend Architecture (client/src/)

- **Build Tool**: Vite 6 with React plugin
- **State Management**: TanStack Query v5 (React Query) - no Redux
- **Routing**: React Router v6 with `PrivateRoute` and `AdminRoute` guards
- **UI**: Material-UI v5 with Emotion
- **Testing**: Vitest + React Testing Library

```
client/src/
├── config/
│   ├── queryClient.ts   # TanStack Query client, query key factory, cache invalidation helpers
│   └── constants.ts     # Client-side constants (token expiry, query config, validation limits)
├── components/          # Organized by domain
│   ├── admin/           # AdminDashboard, AdminLayout, UserManagement
│   ├── auth/            # Login, Register, ForgotPassword, ResetPassword, SessionManager
│   ├── comments/        # Comments display and management
│   ├── common/          # ErrorBoundary, Avatar, Skeletons
│   ├── dashboard/       # Dashboard components
│   ├── layout/          # Layout, Header, Footer
│   ├── messaging/       # MessageList, MessageForm, MessageThread
│   ├── projects/        # ProjectList, ProjectDetail, ProjectForm
│   └── routing/         # PrivateRoute, AdminRoute
├── hooks/               # Custom hooks organized by domain (all .ts files)
│   ├── admin/           # useAdminDashboard, useAdminUsers
│   ├── auth/            # useAuth, useLogin, useLogout, useRegister, usePasswordReset, useChangePassword, useSessions
│   ├── comments/        # useComments, useCommentMutations
│   ├── projects/        # useProjects, useProject, useProjectMutations, useCollaborationMutations
│   └── users/           # useUsers, useMessaging, useProfileMutations
├── pages/               # Route-level page components
│   ├── Home, Dashboard, Profile, ProjectList, ProjectDetail
│   ├── Members, MemberSearch, Messages, EmailVerification, NotFound
│   └── admin/           # AdminDashboard, UserManagement
├── services/            # API layer using Axios (all .ts files)
│   ├── authService.ts   # Auth with dual-token + httpOnly cookie support
│   ├── projectsService.ts, usersService.ts, commentsService.ts, adminService.ts
│   └── index.ts         # Central export with named exports and type re-exports
├── types/               # TypeScript interfaces
├── utils/               # Logger, API client, helpers
└── styles/              # Global CSS
```

**Query Key Factory** (`config/queryClient.ts`):
All cache keys follow the pattern `queryKeys.<domain>.<operation>()`. Use the `invalidateQueries` helper for cache invalidation after mutations.

**Path Aliases** (configured in `vite.config.ts`):
`@/` maps to `src/`, with specific aliases for `@/components`, `@/hooks`, `@/services`, `@/utils`, `@/config`, `@/types`, `@/pages`.

### Data Flow

1. Components use domain hooks (e.g., `useProjects()`)
2. Hooks call services via TanStack Query (`useQuery` / `useMutation`)
3. Services make HTTP calls with Axios (cookies sent automatically)
4. Backend validates via `auth` middleware, then RBAC middleware
5. Controllers interact with Mongoose models
6. Mutations use `invalidateQueries` helpers to refresh cached data

### Database Models & Relationships

- **User** -> **Project** (one-to-many via `owner`)
- **User** <-> **Project** (many-to-many via `collaborators[]`)
- **Project** -> **Comment** (one-to-many via `projectId`)
- **User** -> **Comment** (one-to-many via `userId`)
- **User** -> **Message** (one-to-many as `sender` and `recipient`)
- **User** -> **Session** (one-to-many, tracks active login sessions)

### API Routes

| Prefix | Auth | Middleware | Description |
|--------|------|-----------|-------------|
| `/api/auth` | Mixed | Input validators | Register, login, logout, tokens, email verification, password reset |
| `/api/projects` | Mixed | `auth` for writes, `multer` for images | Project CRUD, search, collaboration |
| `/api/projects/:projectId/comments` | Mixed | `auth` for writes | Comment CRUD |
| `/api/users` | Required | `auth` | Profile, messaging, avatar, user search |
| `/api/admin` | Required | `auth` + `requireAdmin` + admin rate limiter | Dashboard, user management, logs |

## Environment Setup

Copy environment templates:

```bash
cp server/example.env server/.env
cp client/example.env client/.env
```

**Required server environment variables:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Access token secret (min 32 chars)
- `JWT_REFRESH_SECRET` - Refresh token secret
- `FRONTEND_URL` - Client URL for CORS (e.g., `http://localhost:3000`)

**Optional server variables:**
- `PORT` - Server port (default: 5001)
- `NODE_ENV` - Environment (development/production/test)
- `EMAIL_USER`, `EMAIL_PASSWORD` - SMTP credentials for email features
- `MAX_CONCURRENT_SESSIONS` - Max sessions per user (default: 3)
- `UPLOAD_PATH` - Custom upload directory path

**Client environment:**
- `VITE_API_URL` - Backend API URL (e.g., `http://localhost:5001/api`)

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs 5 jobs on push/PR to main/develop:

1. **Lint & Type Check** - ESLint + `tsc --noEmit` for both client and server
2. **Server Tests** - Jest with coverage (requires job 1)
3. **Client Tests** - Vitest with coverage (requires job 1)
4. **Build Check** - `tsc` for server, `vite build` for client (requires job 1)
5. **E2E Tests** - Playwright with MongoDB service container (requires jobs 2-4). Critical tests on all branches; full suite on main only.

## Key Patterns

### Adding a New API Endpoint

1. Add TypeScript types to `server/types/models.ts` if needed
2. Create/update route in `server/routes/` with input validators from `middleware/validators.ts`
3. Create/update controller in `server/controllers/`
4. Apply middleware: `auth` for authentication, `requireRole`/`requirePermission` from `rbac.ts` for authorization
5. Add the route to `server/index.js` if it's a new router

### Adding a New Frontend Feature

1. Add TypeScript types to `client/src/types/`
2. Create service method in `client/src/services/` (follow existing Axios patterns)
3. Add query keys to `config/queryClient.ts` via the `queryKeys` factory
4. Create custom hook in `client/src/hooks/<domain>/` using TanStack Query
5. Export from the domain's `index.ts` barrel file
6. Build component/page using the hook

### TypeScript Migration Status

The codebase is partially migrated to TypeScript:
- **Fully TypeScript**: Models, middleware, services, utils, types, config (server); all client code
- **Still JavaScript**: Controllers and routes (server), `server/index.js`
- Server uses `tsx` runtime so `.ts` and `.js` files can coexist
- Server `tsconfig.json` has `strict: false`, `allowJs: true`, `checkJs: false`

### Code Quality Tools

- **Prettier**: Formatting (runs via lint-staged on commit)
- **ESLint**: Linting for both client and server
- **Husky**: Git hooks (pre-commit runs lint-staged)
- **lint-staged**: Auto-formats staged `.ts`, `.tsx`, `.js`, `.jsx` files on commit

### Test Users

Development accounts: `user1@example.com` through `user10@example.com` with password `password123`. Created by `cd server && npm run seed`.

### Deployment

Production deployment is configured for Railway:
- `npm run railway:backend` - Start server
- `npm run railway:frontend` - Build and serve client
- Server Dockerfile at `server/Dockerfile`
- Environment variables documented in `railway.env.example`
