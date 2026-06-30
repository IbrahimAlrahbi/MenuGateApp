# MenuGate

A Spring Boot REST API that lets restaurant owners manage their menus and menu items. Owners log in via Google OAuth2. Admins can view and delete any menu. Public endpoints allow anyone to browse menus in read-only mode, with shareable URLs per menu.

---

## Architecture

```
Browser / Client
      │
      ▼
Spring Boot REST API (port 8888)
      │
      ├── Public endpoints      ←  No auth (list menus, shareable menu URL)
      ├── Owner endpoints       ←  Google OAuth2 (CRUD own menus + items)
      └── Admin endpoints       ←  Hardcoded admin emails (view/delete any menu)
      │
      ▼
Oracle XE 21c Database
      │
      ├── USERS
      ├── MENUS
      └── MENU_ITEMS
```

### Entity Relationships

```
USERS (1) ──────────> (M) MENUS (1) ──────────> (M) MENU_ITEMS
```

- One User owns many Menus
- One Menu contains many Menu Items
- Deletes cascade: deleting a Menu removes all its Menu Items

---

## Tech Stack

| Component   | Version        |
|-------------|----------------|
| Java        | OpenJDK 17     |
| Spring Boot | 3.5.16         |
| Database    | Oracle XE 21c  |
| Auth        | Google OAuth2  |
| Build Tool  | Maven (wrapper included) |

---

## Prerequisites

- **Java 17** — `java -version`
- **Maven** — The included `./mvnw` wrapper handles this, so no global install needed
- **Oracle XE 21c** — Running and accessible
- **Google OAuth2 credentials** — Client ID and Client Secret from Google Cloud Console

---

## Quick Start

### 1. Clone the repository

```bash
git clone <repo-url>
cd MenuGateApp
```

### 2. Configure database connection

Edit `src/main/resources/application.yml` (or create `application-dev.yml` for dev profile):

```yaml
spring:
  datasource:
    url: jdbc:oracle:thin:@//localhost:1521/XE
    username: your_db_user
    password: your_db_password
    driver-class-name: oracle.jdbc.OracleDriver
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope: profile, email
```

### 3. Set environment variables

```bash
export GOOGLE_CLIENT_ID=your-client-id
export GOOGLE_CLIENT_SECRET=your-client-secret
```

### 4. Run the application

```bash
./mvnw spring-boot:run
```

The server starts on **http://localhost:8888**.

### 5. Verify

```bash
curl http://localhost:8888/api/menus
```

---

## Database Schema

### Table: `USERS`

| Column       | Type            | Constraints                           |
|-------------|-----------------|---------------------------------------|
| `email`     | `VARCHAR2(255)` | **PRIMARY KEY**                       |
| `name`      | `VARCHAR2(255)` | NOT NULL                              |
| `created_at`| `TIMESTAMP`     | NOT NULL, DEFAULT CURRENT_TIMESTAMP   |

### Table: `MENUS`

| Column        | Type            | Constraints                                  |
|--------------|-----------------|----------------------------------------------|
| `menu_id`    | `NUMBER(19)`    | **PRIMARY KEY** (auto-generated sequence)     |
| `title`      | `VARCHAR2(255)` | NOT NULL                                     |
| `category`   | `VARCHAR2(255)` |                                              |
| `owner_email`| `VARCHAR2(255)` | **FOREIGN KEY** → `USERS.email`, NOT NULL    |

### Table: `MENU_ITEMS`

| Column          | Type            | Constraints                                  |
|----------------|-----------------|----------------------------------------------|
| `menu_item_id` | `NUMBER(19)`    | **PRIMARY KEY** (auto-generated sequence)     |
| `name`         | `VARCHAR2(255)` | NOT NULL                                     |
| `description`  | `VARCHAR2(4000)`|                                              |
| `price`        | `DECIMAL(10,2)` | NOT NULL                                     |
| `available`    | `NUMBER(1)`     | NOT NULL, DEFAULT 1 (1 = true, 0 = false)    |
| `menu_id`      | `NUMBER(19)`    | **FOREIGN KEY** → `MENUS.menu_id`, NOT NULL  |

---

## REST API Endpoints

### Public (No Authentication)

| Method | Path                        | Description                              |
|--------|-----------------------------|------------------------------------------|
| `GET`  | `/api/menus`               | Browse all menus (read-only)             |
| `GET`  | `/api/menus/{menuId}`      | View a single menu with items (shareable URL) |

### Owner (Google OAuth2 Required)

| Method   | Path                                     | Description                           |
|----------|------------------------------------------|---------------------------------------|
| `POST`   | `/api/menus`                            | Create a new menu                     |
| `PUT`    | `/api/menus/{menuId}`                   | Update own menu                       |
| `DELETE` | `/api/menus/{menuId}`                   | Delete own menu (cascades to items)   |
| `POST`   | `/api/menus/{menuId}/items`             | Add an item to own menu               |
| `PUT`    | `/api/menus/{menuId}/items/{itemId}`    | Update an item in own menu            |
| `DELETE` | `/api/menus/{menuId}/items/{itemId}`    | Delete an item from own menu          |

### Admin (Hardcoded Emails Only)

Admin emails: `binkhalidabdullahv@gmail.com`, `ibra7bi@gmail.com`

| Method   | Path                           | Description                        |
|----------|--------------------------------|------------------------------------|
| `GET`    | `/api/admin/menus`            | View all menus (across all owners) |
| `DELETE` | `/api/admin/menus/{menuId}`   | Delete any menu                    |

---

## Business Rules

### Authentication Flow
1. Restaurant owner visits the app and is redirected to Google login.
2. On first login, a `USER` record is created with their email and name from Google.
3. Subsequent API calls use the authenticated session to identify the owner.

### Owner Authorization
- Owners can only **create, update, and delete their own** menus and items.
- The authenticated user's email is resolved from `SecurityContextHolder` / `Principal`.

### Admin Access
- Admin emails are hardcoded: `binkhalidabdullahv@gmail.com` and `ibra7bi@gmail.com`.
- Admins cannot create menus but can **view all menus** and **delete any menu**.

### Shareable Menu URL
- Each menu is accessible at `/api/menus/{menuId}` with no authentication required.
- Restaurant owners can share this URL directly with customers.

---

## Project Structure

```
src/main/java/com/menugate/app/
├── AppApplication.java          # Spring Boot entry point
├── config/                      # Security / OAuth2 / CORS config
├── model/                       # JPA entities (User, Menu, MenuItem)
├── repository/                  # Spring Data JPA repositories
├── service/                     # Business logic layer
├── controller/                  # REST controllers
└── dto/                         # Request / Response DTOs

src/main/resources/
├── application.yml              # Main configuration
└── application-dev.yml          # Dev profile overrides

src/test/java/com/menugate/app/
└── AppApplicationTests.java     # Application context tests
```

---

## Running Tests

```bash
./mvnw test
```

---

## Build

```bash
./mvnw clean package
```

The JAR is output to `target/app-0.0.1-SNAPSHOT.jar`.

---

## Containerization (Planned)

Docker support will be added to:

- Package the Spring Boot app into a container image
- Run Oracle XE 21c as a companion container
- Use Docker Compose for one-command local setup

---

## Environment Variables

| Variable               | Description                  |
|-----------------------|------------------------------|
| `GOOGLE_CLIENT_ID`    | Google OAuth2 Client ID      |
| `GOOGLE_CLIENT_SECRET`| Google OAuth2 Client Secret  |
| `DB_URL`              | Oracle JDBC URL (optional)   |
| `DB_USERNAME`         | Database username (optional) |
| `DB_PASSWORD`         | Database password (optional) |

---

## Dependencies

```xml
<!-- Included -->
spring-boot-starter-oauth2-authorization-server
spring-boot-starter-web
spring-boot-starter-test

<!-- To be added -->
spring-boot-starter-data-jpa
spring-boot-starter-security
spring-boot-starter-oauth2-client
spring-boot-starter-validation
com.oracle.database.jdbc:ojdbc8
lombok
```
