# MenuGate App — Agent Reference

## Project Overview

MenuGate is a Spring Boot REST API that lets restaurant owners manage their menus and menu items. Owners log in via Google OAuth2. Admins (determined by `is_admin` flag in the database) can view and delete any menu. Public endpoints allow anyone to browse menus in read-only mode, with shareable URLs per menu. A static HTML + Tailwind CSS frontend is served directly from `src/main/resources/static/` for browser-based access.

---

## Tech Stack

- **Java**: OpenJDK 17
- **Spring Boot**: 3.5.16
- **Build Tool**: Maven (wrapper included — use `./mvnw`)
- **Database**: Oracle Free Database (FREEPDB1 — `jdbc:oracle:thin:@//localhost:1521/FREEPDB1`)
- **Auth**: Google OAuth2 (Spring Security OAuth2 Client)
- **API Docs**: Springdoc OpenAPI (Swagger UI at `/swagger-ui.html`)
- **Server Port**: `8888`

---

## Build / Run / Test Commands

```bash
./mvnw spring-boot:run          # Start the app (requires .env with DB_PASSWORD)
./mvnw test                      # Run all tests
./mvnw clean package             # Build the JAR
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev   # Run with dev profile
```

**Important**: The app reads `DB_PASSWORD` from the `.env` file at the project root via a custom `DotenvEnvironmentPostProcessor`. Ensure `.env` exists before starting.

`.env` format:
```
DB_PASSWORD=ProdPassword123!
```

---

## Project Structure

```
src/main/java/com/menugate/app/
├── AppApplication.java
├── config/
│   ├── BooleanToNumberConverter.java    # AttributeConverter: Boolean ↔ NUMBER(1)
│   ├── DataInitializer.java             # Seeds 4 Omani-themed dummy records on first run
│   ├── DotenvEnvironmentPostProcessor.java  # Reads .env into Spring Environment
│   ├── OpenApiConfig.java               # Springdoc @OpenAPIDefinition
│   └── SecurityConfig.java              # OAuth2 login, role-based access rules
├── controller/
│   ├── AdminMenuController.java         # /api/admin/menus (ROLE_ADMIN only)
│   ├── AuthController.java              # /api/auth/me (current user info + tokens)
│   └── MenuController.java              # /api/menus (public + owner)
├── dto/
│   ├── AuthInfoResponse.java            # record: email, name, roles, idToken, accessToken, tokenExpiresAt
│   ├── ErrorResponse.java
│   ├── MenuItemRequest.java
│   ├── MenuItemResponse.java
│   ├── MenuRequest.java
│   └── MenuResponse.java
├── exception/
│   ├── GlobalExceptionHandler.java      # @ControllerAdvice (404, 403, 400, 500)
│   └── MenuNotFoundException.java
├── model/
│   ├── User.java
│   ├── Menu.java
│   └── MenuItem.java
├── repository/
│   ├── UserRepository.java
│   ├── MenuRepository.java
│   └── MenuItemRepository.java
└── service/
    ├── UserService.java                 # find-or-create user, auto-set isAdmin
    └── MenuService.java                 # Owner-scoped + admin CRUD + public reads

src/main/resources/
├── application.yml                      # Port, datasource, JPA, OAuth2, Springdoc
├── static/
│   ├── index.html                       # Landing / Google sign-in page (public)
│   ├── dashboard.html                   # Logged-in user's menu management
│   ├── menu.html                        # Public shareable menu view (?id=X)
│   ├── admin.html                       # Admin panel (ROLE_ADMIN only)
│   └── js/
│       └── api.js                       # Shared ES-module fetch client + auth helpers
└── META-INF/spring/
    └── org.springframework.boot.env.EnvironmentPostProcessor  # Registers DotenvEnvironmentPostProcessor
```

---

## Database Schema (Oracle Free Database)

### Table: `USERS`

| Column       | Type            | Constraints                           |
|-------------|-----------------|---------------------------------------|
| `email`     | `VARCHAR2(255)` | **PRIMARY KEY**                       |
| `name`      | `VARCHAR2(255)` | NOT NULL                              |
| `created_at`| `TIMESTAMP`     | NOT NULL, DEFAULT CURRENT_TIMESTAMP   |
| `is_admin`  | `NUMBER(1)`     | NOT NULL, DEFAULT 0 (1 = admin)       |

### Table: `MENUS`

| Column        | Type            | Constraints                                  |
|--------------|-----------------|----------------------------------------------|
| `menu_id`    | `NUMBER(19)`    | **PRIMARY KEY** (sequence: `MENU_SEQ`)       |
| `title`      | `VARCHAR2(255)` | NOT NULL                                     |
| `category`   | `VARCHAR2(255)` |                                              |
| `owner_email`| `VARCHAR2(255)` | **FOREIGN KEY** → `USERS.email`, NOT NULL    |

### Table: `MENU_ITEMS`

| Column          | Type            | Constraints                                  |
|----------------|-----------------|----------------------------------------------|
| `menu_item_id` | `NUMBER(19)`    | **PRIMARY KEY** (sequence: `MENU_ITEM_SEQ`)   |
| `name`         | `VARCHAR2(255)` | NOT NULL                                     |
| `description`  | `VARCHAR2(4000)`|                                              |
| `price`        | `DECIMAL(10,2)` | NOT NULL                                     |
| `available`    | `NUMBER(1)`     | NOT NULL, DEFAULT 1 (1 = true, 0 = false)    |
| `menu_id`      | `NUMBER(19)`    | **FOREIGN KEY** → `MENUS.menu_id`, NOT NULL  |

### Entity Relationships

```
USERS (1) ──────────> (M) MENUS (1) ──────────> (M) MENU_ITEMS
  email ──FK──> owner_email              menu_id ──FK──> menu_id
```

- One User can create many Menus. Each Menu belongs to exactly one User.
- One Menu can contain many MenuItems. Each MenuItem belongs to exactly one Menu.
- Foreign keys: `MENUS.owner_email` → `USERS.email`, `MENU_ITEMS.menu_id` → `MENUS.menu_id`.
- All tables are created automatically via `ddl-auto: update`.

---

## JPA Entity Design (Java Classes)

```
User.java
  @Id String email
  String name
  LocalDateTime createdAt (default now)
  Boolean isAdmin (default false)
  @OneToMany(mappedBy = "owner") @Builder.Default List<Menu> menus = new ArrayList<>()

Menu.java
  @Id @GeneratedValue(strategy=SEQUENCE, generator="menu_seq") @SequenceGenerator(name="menu_seq", sequenceName="MENU_SEQ", allocationSize=1)
  Long menuId
  String title
  String category
  @ManyToOne(fetch=LAZY) @JoinColumn(name="owner_email") @ToString.Exclude User owner
  @OneToMany(mappedBy="menu", cascade=ALL, orphanRemoval=true) @Builder.Default List<MenuItem> items = new ArrayList<>()

MenuItem.java
  @Id @GeneratedValue(strategy=SEQUENCE, generator="menu_item_seq") @SequenceGenerator(name="menu_item_seq", sequenceName="MENU_ITEM_SEQ", allocationSize=1)
  Long menuItemId
  String name
  String description
  BigDecimal price
  Boolean available (default true)
  @ManyToOne(fetch=LAZY) @JoinColumn(name="menu_id") @ToString.Exclude Menu menu
```

---

## Key Implementation Details

### Boolean Mapping (Oracle NUMBER(1))
`BooleanToNumberConverter.java` implements `AttributeConverter<Boolean, Integer>` with `@Converter(autoApply = true)`. Converts `true` → `1`, `false` → `0` for database persistence. Hibernate applies this automatically to all `Boolean` fields (including `is_admin`, `available`).

### Dotenv Loading
`DotenvEnvironmentPostProcessor` implements `EnvironmentPostProcessor` and is registered in `META-INF/spring/org.springframework.boot.env.EnvironmentPostProcessor`. It reads `.env` from the project root and adds properties to the Spring `Environment` before any beans are created — so `${DB_PASSWORD}` resolves correctly in `application.yml`.

### OAuth2 User Processing
`SecurityConfig.oidcUserService()` wraps the default `OidcUserService`. On login:
1. Delegates to default OidcUserService to get Google profile
2. Calls `UserService.findOrCreateUser(email, name)` — creates user if not exists, sets `isAdmin = true` if email matches admin list, updates name if changed
3. Builds authorities: always adds `ROLE_USER`, adds `ROLE_ADMIN` if `isAdmin == true`
4. Returns a `DefaultOidcUser` with the merged authorities

### Admin Email Checking
Admin emails are hardcoded in `UserService.ADMIN_EMAILS`:
- `binkhalidabdullahv@gmail.com`
- `ibra7bi@gmail.com`

The `is_admin` flag is set in the database on first login. Security checks use `hasRole("ADMIN")` which checks the GrantedAuthority (not the DB directly). This means admin status is determined at login time and stored in the session.

### Controller Pattern
- Controllers inject the `OidcUser` principal via `@AuthenticationPrincipal` and pass `principal.getEmail()` to the service layer for owner scoping
- `AdminMenuController` has `@PreAuthorize("hasRole('ADMIN')")` at class level as an additional safeguard
- All methods have Javadoc comments for developer understanding
- All methods have OpenAPI annotations (`@Tag`, `@Operation`, `@ApiResponses`, `@Parameter`) for the auto-generated Swagger page

---

## Business Rules

### Authentication

- Restaurant owners and admins both log in via Google OAuth2.
- On first login, if the user record does not exist in `USERS`, it is created with `name` and `email` from the Google profile.
- If the email matches one of the hardcoded admin emails, `is_admin` is set to `1` (true).
- Login is session-based (Spring Security manages the session).

### Owner Authorization

- Owners can only **create, update, delete their own** menus and items.
- The authenticated user's email is extracted from `@AuthenticationPrincipal OidcUser`.
- Service layer checks ownership by querying `findByMenuIdAndOwnerEmail(menuId, ownerEmail)`.

### Admin Users

- Admin emails (hardcoded in `UserService`): `binkhalidabdullahv@gmail.com`, `ibra7bi@gmail.com`
- Admins log in via Google OAuth2 like normal users.
- On first login, their `is_admin` flag is set to `true` in the database.
- Admins do **not** create menus.
- Admins can **view all menus** (across all owners) via `GET /api/admin/menus`.
- Admins can **delete any menu** (and its items cascade) via `DELETE /api/admin/menus/{menuId}`.

### Public / Unauthenticated Access

- Anyone can browse menus and their items in read-only mode.
- No authentication required for `GET /api/menus` and `GET /api/menus/{menuId}`.

### Shareable URL

- Each menu gets a public URL that displays it: `/api/menus/{menuId}`
- This endpoint requires **no authentication**.
- The URL can be shared by the restaurant owner with customers.

---

## Seed Data (DataInitializer)

Runs on startup only if the `USERS` table is empty. Seeds 4 Omani-themed records:

| # | User | is_admin | Menu | Category | Menu Item | Price |
|---|---|---|---|---|---|---|
| 1 | `ahmed.albalushi@gmail.com` / Ahmed Al Balushi | false | Al Bahja Traditional Menu | Omani Cuisine | Shuwa Laham — Slow-cooked spiced lamb wrapped in banana leaves, served with rice | 12.500 OMR |
| 2 | `fatma.alwahaibi@gmail.com` / Fatma Al Wahaibi | false | Dhofar Coastal Delights | Seafood | Mashuai — Spiced kingfish with aromatic lemon rice | 8.000 OMR |
| 3 | `salim.alharthi@gmail.com` / Salim Al Harthi | false | Muscat BBQ Selection | Grills | Mishkak Beef — Omani-style skewered beef with traditional spices | 5.500 OMR |
| 4 | `aisha.alamri@gmail.com` / Aisha Al Amri | false | Nizwa Oasis Sweets | Desserts | Omani Halwa with Kahwa — Traditional date halwa served with Omani coffee | 4.000 OMR |

Admin users are not seeded — they are created on first Google login.

---

## REST API Endpoints

### Auth Endpoints (Authenticated)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/me` | Returns current user: email, name, roles[], OIDC id_token, Google access token, token expiry |

### Public Endpoints (No Auth Required)

| Method | Path                        | Description                                    |
|--------|-----------------------------|------------------------------------------------|
| `GET`  | `/api/menus`               | List all menus (read-only, all owners)         |
| `GET`  | `/api/menus/{menuId}`      | View a single menu with its items (shareable URL) |

### Owner Endpoints (Google OAuth2 Authenticated)

| Method   | Path                                     | Description                           |
|----------|------------------------------------------|---------------------------------------|
| `POST`   | `/api/menus`                            | Create a new menu (owner = authenticated user) |
| `PUT`    | `/api/menus/{menuId}`                   | Update own menu (title, category)     |
| `DELETE` | `/api/menus/{menuId}`                   | Delete own menu (cascades to items)   |
| `POST`   | `/api/menus/{menuId}/items`             | Add a menu item to own menu           |
| `PUT`    | `/api/menus/{menuId}/items/{itemId}`    | Update a menu item in own menu        |
| `DELETE` | `/api/menus/{menuId}/items/{itemId}`    | Delete a menu item from own menu      |

### Admin Endpoints (is_admin = true in DB)

| Method   | Path                           | Description                        |
|----------|--------------------------------|------------------------------------|
| `GET`    | `/api/admin/menus`            | View all menus (all owners)        |
| `DELETE` | `/api/admin/menus/{menuId}`   | Delete any menu (cascades to items) |

---

## Security Configuration

Path matchers in `SecurityConfig` (evaluated top-to-bottom):

| Path pattern | Access |
|---|---|
| `/api/admin/**` | `hasRole("ADMIN")` |
| `GET /api/menus/**` | `permitAll()` — public |
| `/api/menus/**` (other methods) | `authenticated()` — owner-scoped in service |
| `/swagger-ui/**`, `/v3/api-docs/**` | `permitAll()` — public API docs |
| `/`, `/index.html`, `/dashboard.html`, `/menu.html`, `/admin.html`, `/js/**` | `permitAll()` — static frontend |
| Everything else | `authenticated()` |

CSRF is disabled. Session-based auth (no JWT tokens).

**401 entry point:** Unauthenticated requests to any `/api/**` path return HTTP `401` with JSON `{"error":"Unauthorized"}` instead of a `302` redirect, so `fetch()` in the browser can detect the response without following the OAuth redirect chain.

**Post-login redirect:** After a successful Google OAuth2 login, the user is redirected to `/dashboard.html`.

---

## Frontend (Static UI)

Served by Spring Boot's static resource handler from `src/main/resources/static/`. All pages use Tailwind CSS via CDN (`https://cdn.tailwindcss.com`) and vanilla JS ES modules. No build tool required.

### Pages

| File | URL | Auth | Description |
|------|-----|------|-------------|
| `index.html` | `/` or `/index.html` | Public | Landing page with Google sign-in button. Auto-redirects to `/dashboard.html` if already logged in. |
| `dashboard.html` | `/dashboard.html` | Required | User's own menus: create/edit/delete menus, add/edit/delete items. Expandable items panel per card. |
| `menu.html` | `/menu.html?id=X` | Public | Shareable read-only restaurant menu view. Includes available-only filter toggle. |
| `admin.html` | `/admin.html` | ROLE_ADMIN | Table of all menus across all owners. Shows "Access Denied" for non-admin accounts. |

### JS Module: `static/js/api.js`

All pages import from `/js/api.js` using `<script type="module">`. Exports:

| Export | Description |
|--------|-------------|
| `checkAuth()` | Calls `/api/auth/me`, redirects to `/index.html` on 401, returns user object |
| `logout()` | POST to `/logout`, then redirects to `/index.html` |
| `api.menus.list/get/create/update/delete` | Full CRUD for menus |
| `api.items.add/update/delete` | Full CRUD for menu items |
| `api.admin.menus / admin.deleteMenu` | Admin-only endpoint wrappers |

All `fetch()` calls use `credentials: 'include'` so the JSESSIONID session cookie is sent automatically on every same-origin request.

---

## OpenAPI / Swagger

- Swagger UI: `http://localhost:8888/swagger-ui.html`
- API docs JSON: `http://localhost:8888/v3/api-docs`
- All controllers and DTOs are annotated with `@Tag`, `@Operation`, `@ApiResponses`, `@Parameter` for rich auto-generated documentation
- Security scheme defined as Google OAuth2

---

## Environment Variables & .env

| Variable | Source | Description |
|---|---|---|
| `DB_PASSWORD` | `.env` file | Oracle database password |
| `GOOGLE_CLIENT_ID` | `.env` file | Google OAuth2 Client ID |
| `GOOGLE_CLIENT_SECRET` | `.env` file | Google OAuth2 Client Secret |

---

## Coding Conventions

- **No unnecessary comments.** Write self-documenting code. (Doc comments on controllers are the exception — they serve both dev understanding and OpenAPI generation.)
- **Use constructor injection** via `@RequiredArgsConstructor` (Lombok) — no `@Autowired` field injection.
- **Use `@RestController`** for controllers, `@Service` for services, `@Repository` for repos.
- **DTOs**: Return DTOs from controllers, not raw entities. Use `@Valid` + `@RequestBody` for validation.
- **Validation**: Use `jakarta.validation` annotations (`@NotBlank`, `@NotNull`, `@Positive`) on DTOs.
- **Exception Handling**: Use `@RestControllerAdvice` + `@ExceptionHandler` for consistent error responses.
- **Lombok**: Use `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Builder` on entities and DTOs.
- **Database ID generation**: Use `GenerationType.SEQUENCE` with `@SequenceGenerator(allocationSize = 1)` for Oracle.
- **Boolean mapping**: `BooleanToNumberConverter` (`@Converter(autoApply = true)`) converts `Boolean` ↔ `NUMBER(1)`.
- **Cascade**: `Menu.items` uses `cascade = CascadeType.ALL, orphanRemoval = true`.
- **Bidirectional relationships**: Use `@ToString.Exclude` on `@ManyToOne` sides to prevent circular toString.
- **Naming**: Package `com.menugate.app`. Controller URLs use `/api/` prefix. Table/column names use UPPER_SNAKE_CASE. Java uses camelCase.
- **OpenAPI annotations**: Every controller method should have `@Operation(summary=, description=)` and `@ApiResponses`. Path variables should have `@Parameter(description=)`.
- **OAuth2 scope**: The `application.yml` Google registration must include `openid` in the scope (`openid,profile,email`). Without it, Google does not return an ID token, causing a `ClassCastException` in `OAuth2LoginAuthenticationProvider`.

---

## All Dependencies (pom.xml)

```xml
<!-- All dependencies currently present: -->
- spring-boot-starter-oauth2-authorization-server   <!-- OAuth2 server support -->
- spring-boot-starter-web                            <!-- REST + Tomcat -->
- spring-boot-starter-data-jpa                       <!-- JPA + Hibernate -->
- spring-boot-starter-security                       <!-- Spring Security -->
- spring-boot-starter-oauth2-client                  <!-- Google OAuth client login -->
- spring-boot-starter-validation                     <!-- Bean Validation -->
- com.oracle.database.jdbc:ojdbc8                    <!-- Oracle JDBC driver -->
- org.projectlombok:lombok (optional)                <!-- Boilerplate reduction -->
- org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.13  <!-- Swagger UI -->
- spring-boot-starter-test (test scope)              <!-- JUnit 5 + Mockito -->
```

---

## API Testing Reference

**Base URL:** `http://localhost:8888`

All `curl` examples can be imported directly into Postman via **Import → Raw Text**.

---

### Auth Endpoint

#### `GET /api/auth/me` — Current user info + tokens
```bash
curl -X GET http://localhost:8888/api/auth/me \
  -H "Cookie: JSESSIONID=<your-session-id>"
```
**200 OK:**
```json
{
  "email": "user@gmail.com",
  "name": "John Doe",
  "roles": ["ROLE_USER", "OIDC_USER"],
  "idToken": "eyJhbGciOiJSUzI1NiJ9...",
  "accessToken": "ya29.a0AfH6SM...",
  "tokenExpiresAt": "2026-06-30T16:00:00Z"
}
```
**401 (no session):** `{"error":"Unauthorized"}`

---

### Public Endpoints — No Auth Needed

#### `GET /api/menus` — List all menus
```bash
curl -X GET http://localhost:8888/api/menus
```
**200 OK:**
```json
[
  {
    "menuId": 1,
    "title": "Al Bahja Traditional Menu",
    "category": "Omani Cuisine",
    "ownerEmail": "ahmed.albalushi@gmail.com",
    "items": [
      {
        "menuItemId": 1,
        "name": "Shuwa Laham",
        "description": "Slow-cooked spiced lamb wrapped in banana leaves",
        "price": 12.50,
        "available": true
      }
    ]
  }
]
```

#### `GET /api/menus/{menuId}` — Single menu (shareable)
```bash
curl -X GET http://localhost:8888/api/menus/1
```
**200 OK:** Same shape as one element above.
**404:**
```json
{ "status": 404, "message": "Menu not found with ID: 99", "timestamp": "2026-06-30T14:00:00" }
```

---

### Owner Endpoints — Auth Required

Replace `<JSESSIONID>` with your session cookie value in every request.

#### `POST /api/menus` — Create a menu
```bash
curl -X POST http://localhost:8888/api/menus \
  -H "Content-Type: application/json" \
  -H "Cookie: JSESSIONID=<JSESSIONID>" \
  -d '{"title": "Lunch Special", "category": "Italian"}'
```
**201 Created:**
```json
{ "menuId": 5, "title": "Lunch Special", "category": "Italian", "ownerEmail": "user@gmail.com", "items": [] }
```
**400 (missing title):**
```json
{ "status": 400, "message": "title: Menu title is required", "timestamp": "..." }
```

#### `PUT /api/menus/{menuId}` — Update a menu
```bash
curl -X PUT http://localhost:8888/api/menus/5 \
  -H "Content-Type: application/json" \
  -H "Cookie: JSESSIONID=<JSESSIONID>" \
  -d '{"title": "Dinner Special", "category": "French"}'
```
**200 OK:** Updated `MenuResponse`.
**403:** Menu belongs to a different owner.

#### `DELETE /api/menus/{menuId}` — Delete a menu
```bash
curl -X DELETE http://localhost:8888/api/menus/5 \
  -H "Cookie: JSESSIONID=<JSESSIONID>"
```
**204 No Content.**

#### `POST /api/menus/{menuId}/items` — Add an item
```bash
curl -X POST http://localhost:8888/api/menus/5/items \
  -H "Content-Type: application/json" \
  -H "Cookie: JSESSIONID=<JSESSIONID>" \
  -d '{"name": "Risotto", "description": "Creamy mushroom risotto", "price": 14.99}'
```
**201 Created:**
```json
{ "menuItemId": 10, "name": "Risotto", "description": "Creamy mushroom risotto", "price": 14.99, "available": true }
```

#### `PUT /api/menus/{menuId}/items/{itemId}` — Update an item
```bash
curl -X PUT http://localhost:8888/api/menus/5/items/10 \
  -H "Content-Type: application/json" \
  -H "Cookie: JSESSIONID=<JSESSIONID>" \
  -d '{"name": "Truffle Risotto", "description": "Creamy risotto with black truffle", "price": 18.50}'
```
**200 OK:** Updated `MenuItemResponse`.

#### `DELETE /api/menus/{menuId}/items/{itemId}` — Delete an item
```bash
curl -X DELETE http://localhost:8888/api/menus/5/items/10 \
  -H "Cookie: JSESSIONID=<JSESSIONID>"
```
**204 No Content.**

---

### Admin Endpoints — ROLE_ADMIN Required

#### `GET /api/admin/menus` — All menus across all owners
```bash
curl -X GET http://localhost:8888/api/admin/menus \
  -H "Cookie: JSESSIONID=<admin-JSESSIONID>"
```
**200 OK:** Array of all `MenuResponse` objects.
**403:** Authenticated user lacks `ROLE_ADMIN`.

#### `DELETE /api/admin/menus/{menuId}` — Delete any menu
```bash
curl -X DELETE http://localhost:8888/api/admin/menus/3 \
  -H "Cookie: JSESSIONID=<admin-JSESSIONID>"
```
**204 No Content.**

---

## Postman OAuth2 Testing — Two Methods

### Method 1: Session Cookie (Recommended — fastest)

Reuses an active browser session. No Postman OAuth2 configuration needed.

**Steps:**
1. Open `http://localhost:8888/` in Chrome or Firefox
2. Click **Sign in with Google** and complete the login
3. Browser lands on `/dashboard.html`
4. Open **DevTools** (F12) → **Application** tab → **Storage** → **Cookies** → select `http://localhost:8888`
5. Copy the value of the `JSESSIONID` cookie
6. In Postman → any request → **Headers** tab → add:
   - Key: `Cookie`
   - Value: `JSESSIONID=<paste value here>`
7. Send — you are now authenticated as the Google-logged-in user

**Recommended test sequence:**
```
GET  http://localhost:8888/api/auth/me
GET  http://localhost:8888/api/menus
POST http://localhost:8888/api/menus           body: {"title":"Test Menu","category":"Test"}
GET  http://localhost:8888/api/menus/{{menuId}}
POST http://localhost:8888/api/menus/{{menuId}}/items   body: {"name":"Item 1","price":9.99}
PUT  http://localhost:8888/api/menus/{{menuId}}         body: {"title":"Updated Menu","category":"Updated"}
DELETE http://localhost:8888/api/menus/{{menuId}}
```

> **Session lifetime:** JSESSIONID expires on server restart or after 30 minutes of inactivity. Repeat steps 1–6 for a fresh value.

---

### Method 2: Postman Built-in OAuth2 Flow (for inspecting tokens)

Use this to drive the full Authorization Code flow inside Postman and capture the raw Google tokens.

> **Note:** This app uses server-side sessions, not Bearer tokens. Postman cannot call the Spring Boot API endpoints using the captured access token directly. Use this method to inspect/verify tokens, then fall back to Method 1 for API calls.

**Setup steps:**
1. In Postman, create a new **Collection**
2. Go to the **Authorization** tab of the collection
3. Set **Auth Type** → `OAuth 2.0`
4. Under **Configure New Token**, fill in:

   | Field | Value |
   |-------|-------|
   | Token Name | `MenuGate Google` |
   | Grant Type | `Authorization Code` |
   | Callback URL | `http://localhost:8888/login/oauth2/code/google` |
   | Auth URL | `https://accounts.google.com/o/oauth2/v2/auth` |
   | Access Token URL | `https://oauth2.googleapis.com/token` |
   | Client ID | `<GOOGLE_CLIENT_ID from .env>` |
   | Client Secret | `<GOOGLE_CLIENT_SECRET from .env>` |
   | Scope | `openid profile email` |
   | Client Authentication | `Send as Basic Auth header` |

5. Click **Get New Access Token**
6. A browser window opens → complete Google login
7. Postman captures the token → click **Use Token**

**What you can verify with the token:**
- **Google UserInfo:** `GET https://www.googleapis.com/oauth2/v3/userinfo` with `Authorization: Bearer <accessToken>` → returns `{sub, email, name, picture}`
- **Decode the ID token:** paste the `idToken` value at `https://jwt.io` → inspect claims: `sub`, `email`, `name`, `aud`, `iat`, `exp`, `iss`

**To call the Spring Boot API after step 7:**
After the Postman browser completed step 6, it created a JSESSIONID in that browser window. Copy it using DevTools (Method 1 steps 4–5) and add it to your Postman requests as described in Method 1 step 6.
