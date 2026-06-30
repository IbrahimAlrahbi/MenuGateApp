# MenuGate App — Agent Reference

## Project Overview

MenuGate is a Spring Boot REST API that lets restaurant owners manage their menus and menu items. Owners log in via Google OAuth2. Admins (hardcoded emails) can view and delete any menu. Public endpoints allow anyone to browse menus in read-only mode, with shareable URLs per menu.

---

## Tech Stack

- **Java**: OpenJDK 17
- **Spring Boot**: 3.5.16
- **Build Tool**: Maven (wrapper included — use `./mvnw`)
- **Database**: Oracle XE 21c
- **Auth**: Google OAuth2 (Spring Security OAuth2 Client)
- **Server Port**: `8888`

---

## Build / Run / Test Commands

```bash
./mvnw spring-boot:run          # Start the app
./mvnw test                      # Run all tests
./mvnw clean package             # Build the JAR
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev   # Run with dev profile
```

---

## Project Structure

```
src/main/java/com/menugate/app/
├── AppApplication.java          # Spring Boot entry point
├── config/                      # Security / OAuth / CORS config
├── model/                       # JPA entities (User, Menu, MenuItem)
├── repository/                  # Spring Data JPA repositories
├── service/                     # Business logic layer
├── controller/                  # REST controllers
└── dto/                         # Request / Response DTOs

src/main/resources/
├── application.yml              # Main config (port, datasource, oauth)
└── application-dev.yml          # Dev profile overrides (if needed)
```

---

## Database Schema (Oracle XE 21c)

### Table: `USERS`

| Column       | Type          | Constraints          |
|-------------|---------------|----------------------|
| `email`     | `VARCHAR2(255)` | **PRIMARY KEY**       |
| `name`      | `VARCHAR2(255)` | NOT NULL              |
| `created_at`| `TIMESTAMP`    | NOT NULL, DEFAULT CURRENT_TIMESTAMP |

### Table: `MENUS`

| Column        | Type            | Constraints                          |
|--------------|-----------------|--------------------------------------|
| `menu_id`    | `NUMBER(19)`    | **PRIMARY KEY** (auto-generated sequence) |
| `title`      | `VARCHAR2(255)` | NOT NULL                             |
| `category`   | `VARCHAR2(255)` |                                      |
| `owner_email`| `VARCHAR2(255)` | **FOREIGN KEY** → `USERS.email`, NOT NULL |

### Table: `MENU_ITEMS`

| Column           | Type            | Constraints                          |
|-----------------|-----------------|--------------------------------------|
| `menu_item_id`  | `NUMBER(19)`    | **PRIMARY KEY** (auto-generated sequence) |
| `name`          | `VARCHAR2(255)` | NOT NULL                             |
| `description`   | `VARCHAR2(4000)`|                                      |
| `price`         | `DECIMAL(10,2)` | NOT NULL                             |
| `available`     | `NUMBER(1)`     | NOT NULL, DEFAULT 1 (1 = true, 0 = false) |
| `menu_id`       | `NUMBER(19)`    | **FOREIGN KEY** → `MENUS.menu_id`, NOT NULL |

### Entity Relationships

```
USERS (1) ──────────> (M) MENUS (1) ──────────> (M) MENU_ITEMS
  email ──FK──> owner_email              menu_id ──FK──> menu_id
```

- One User can create many Menus. Each Menu belongs to exactly one User.
- One Menu can contain many MenuItems. Each MenuItem belongs to exactly one Menu.
- Foreign keys: `MENUS.owner_email` → `USERS.email`, `MENU_ITEMS.menu_id` → `MENUS.menu_id`.

---

## JPA Entity Design (Java Classes)

```
User.java
  @Id String email
  String name
  LocalDateTime createdAt
  @OneToMany(mappedBy = "owner") List<Menu> menus

Menu.java
  @Id @GeneratedValue Long menuId
  String title
  String category
  @ManyToOne @JoinColumn(name = "owner_email") User owner
  @OneToMany(mappedBy = "menu", cascade = ALL, orphanRemoval = true) List<MenuItem> items

MenuItem.java
  @Id @GeneratedValue Long menuItemId
  String name
  String description
  BigDecimal price
  Boolean available = true
  @ManyToOne @JoinColumn(name = "menu_id") Menu menu
```

---

## Business Rules

### Authentication

- Restaurant owners log in via Google OAuth2.
- On first login, if the user record does not exist in `USERS`, create it with `name` and `email` from the Google profile.
- After login, issue a session / JWT so subsequent API calls are authenticated.

### Owner Authorization

- Owners can only **create, update, delete their own** menus and items.
- When fetching the authenticated user's email, use `SecurityContextHolder` / `Principal` from Spring Security.

### Admin Users

- Admin emails (hardcoded): `binkhalidabdullahv@gmail.com`, `ibra7bi@gmail.com`
- Admins do **not** create menus.
- Admins can **view all menus** (across all owners).
- Admins can **delete any menu** (and its items cascade).

### Public / Unauthenticated Access

- Anyone can browse menus and their items in read-only mode.
- No authentication required for public endpoints.

### Shareable URL

- Each menu gets a public URL that displays it: `/api/menus/{menuId}`
- This endpoint requires **no authentication**.
- The URL can be shared by the restaurant owner with customers.

---

## REST API Endpoints

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

### Admin Endpoints (Admin Emails Only)

| Method   | Path                           | Description                        |
|----------|--------------------------------|------------------------------------|
| `GET`    | `/api/admin/menus`            | View all menus (all owners)        |
| `DELETE` | `/api/admin/menus/{menuId}`   | Delete any menu (cascades to items) |

---

## Coding Conventions

- **No unnecessary comments.** Write self-documenting code.
- **Use constructor injection** (not `@Autowired` field injection).
- **Use `@RestController`** for controllers, `@Service` for services, `@Repository` for repos.
- **DTOs**: Return DTOs from controllers, not raw entities. Use `@RequestBody` / `@ResponseBody`.
- **Validation**: Use `jakarta.validation` annotations (`@NotBlank`, `@NotNull`, `@Positive`, etc.) on DTOs and validate with `@Valid`.
- **Exception Handling**: Use `@ControllerAdvice` / `@ExceptionHandler` for consistent error responses.
- **Lombok**: Use `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Builder` on entities and DTOs if Lombok is added as a dependency.
- **Database ID generation**: Use `GenerationType.SEQUENCE` with `@SequenceGenerator` for Oracle compatibility.
- **Boolean mapping**: Use `@Type(YesNoConverter.class)` or a custom converter since Oracle has no native BOOLEAN — store as `NUMBER(1)` (0/1).
- **Cascade**: `Menu.menuItems` should use `cascade = CascadeType.ALL, orphanRemoval = true`.
- **Naming**: Follow standard Java conventions. Package: `com.menugate.app`. Controller URLs use `/api/` prefix.

---

## Dependencies (pom.xml)

```xml
<!-- Key dependencies already present: -->
- spring-boot-starter-oauth2-authorization-server   <!-- OAuth2 -->
- spring-boot-starter-web                            <!-- REST + Tomcat -->
- spring-boot-starter-test                           <!-- JUnit 5 + Mockito -->

<!-- To be added when building out the app: -->
- spring-boot-starter-data-jpa                       <!-- JPA + Hibernate -->
- spring-boot-starter-security                       <!-- Spring Security -->
- spring-boot-starter-oauth2-client                  <!-- Google OAuth client -->
- spring-boot-starter-validation                     <!-- Bean Validation -->
- com.oracle.database.jdbc:ojdbc8                    <!-- Oracle JDBC driver -->
- lombok                                            <!-- Boilerplate reduction -->
```
