# Requirements Document

## Introduction

This feature adds User CRUD (Create, Read, Update, Delete) management to the Jewellery Inventory system. Users are stored in a relational database table with the columns `id`, `username`, `password`, and `created_at`. Passwords are never stored in plain text — they are hashed before persistence. All user management endpoints are protected by the existing JWT authentication middleware. The feature follows the established project patterns: controllers handle HTTP concerns, services handle business logic and database access, and `ApiError` is used for all error signalling.

## Glossary

- **User_Management_API**: The set of HTTP endpoints that expose CRUD operations for users.
- **User_Service**: The service layer module responsible for database queries and business logic related to users.
- **User_Controller**: The controller module that handles HTTP requests and responses for user management.
- **User_Routes**: The Express router that maps HTTP methods and paths to User_Controller handlers.
- **Password_Hasher**: The utility responsible for hashing plain-text passwords and verifying passwords against stored hashes.
- **Authenticated_Request**: An HTTP request that carries a valid Bearer JWT token verified by `authMiddleware`.
- **User**: A record in the `users` table consisting of `id` (integer, auto-increment primary key), `username` (string, unique), `password` (string, bcrypt hash), and `created_at` (timestamp).
- **Safe_User**: A User record with the `password` field omitted, suitable for API responses.
- **bcrypt**: The password hashing algorithm used by Password_Hasher, with a minimum cost factor of 10.

---

## Requirements

### Requirement 1: List Users

**User Story:** As an authenticated admin, I want to retrieve a list of all users, so that I can see who has access to the system.

#### Acceptance Criteria

1. WHEN an Authenticated_Request is made to `GET /api/users`, THE User_Management_API SHALL return a 200 response containing a JSON array where every element is a Safe_User object (fields: `id`, `username`, `created_at`).
2. WHEN an Authenticated_Request is made to `GET /api/users` and the `users` table contains records, THE User_Management_API SHALL return those records ordered by `id` ascending.
3. IF the `users` table contains no records, THEN THE User_Management_API SHALL return a 200 response with an empty JSON array `[]`.
4. THE response body SHALL NOT contain a `password` field in any element of the returned array.
5. WHEN an unauthenticated request is made to `GET /api/users`, THE User_Management_API SHALL return a 401 response with a JSON error body.
6. IF a database error occurs while querying the `users` table, THEN THE User_Management_API SHALL return a 500 response with a JSON error body.

---

### Requirement 2: Get a Single User

**User Story:** As an authenticated admin, I want to retrieve a specific user by their ID, so that I can inspect or audit a particular account.

#### Acceptance Criteria

1. WHEN an Authenticated_Request is made to `GET /api/users/:id` with a valid positive-integer `id`, THE User_Management_API SHALL return a 200 response containing the matching Safe_User object (fields: `id`, `username`, `created_at`).
2. IF no user exists with the given `id`, THEN THE User_Management_API SHALL return a 404 response with a JSON error body indicating the user was not found.
3. IF the `id` parameter is not a positive integer (e.g., a string, float, zero, or negative number), THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the `id` must be a positive integer.
4. WHEN an unauthenticated request is made to `GET /api/users/:id`, THE User_Management_API SHALL return a 401 response with a JSON error body.
5. THE response body SHALL NOT contain a `password` field.

---

### Requirement 3: Create a User

**User Story:** As an authenticated admin, I want to create a new user account with a username and password, so that I can grant system access to additional staff members.

#### Acceptance Criteria

1. WHEN an Authenticated_Request is made to `POST /api/users` with a non-empty `username` (1–50 characters, alphanumeric/underscore/hyphen) and a `password` of at least 6 characters and at most 72 bytes (UTF-8), THE User_Management_API SHALL hash the password using Password_Hasher and insert a new row into the `users` table.
2. WHEN a user is created successfully, THE User_Management_API SHALL return a 201 response containing the Safe_User object (fields: `id`, `username`, `created_at`) of the newly created user.
3. IF the `username` field is missing or empty, THEN THE User_Management_API SHALL return a 400 response with the message `"Username is required"`.
4. IF the `username` field exceeds 50 characters or contains characters outside alphanumeric, underscore, and hyphen, THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the username format is invalid.
5. IF the `password` field is missing or empty, THEN THE User_Management_API SHALL return a 400 response with the message `"Password is required"`.
6. IF the `password` value is shorter than 6 characters, THEN THE User_Management_API SHALL return a 400 response with the message `"Password must be at least 6 characters"`.
7. IF the `password` value exceeds 72 bytes (UTF-8), THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the password is too long.
8. IF a user with the same `username` already exists, THEN THE User_Management_API SHALL return a 409 response with the message `"Username already exists"`.
9. THE Password_Hasher SHALL hash plain-text passwords using bcrypt with a cost factor of at least 10 before any database write.
10. THE User_Service SHALL never store, return, or log a plain-text password.
11. WHEN an unauthenticated request is made to `POST /api/users`, THE User_Management_API SHALL return a 401 response with a JSON error body.

---

### Requirement 4: Update a User

**User Story:** As an authenticated admin, I want to update a user's username or password, so that I can manage account credentials.

#### Acceptance Criteria

1. WHEN an Authenticated_Request is made to `PUT /api/users/:id` with at least one of `username` or `password` present and non-empty, THE User_Management_API SHALL update only the fields present in the request body for the user with the given `id`.
2. WHEN a user is updated successfully, THE User_Management_API SHALL return a 200 response containing the updated Safe_User object (fields: `id`, `username`, `created_at`).
3. IF neither `username` nor `password` is provided in the request body, OR if all provided fields are empty strings, THEN THE User_Management_API SHALL return a 400 response with the message `"At least one of username or password must be provided"`.
4. IF the provided `password` is an empty string or shorter than 6 characters, THEN THE User_Management_API SHALL return a 400 response with the message `"Password must be at least 6 characters"`.
5. IF the provided `password` exceeds 72 bytes (UTF-8), THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the password is too long.
6. IF no user exists with the given `id`, THEN THE User_Management_API SHALL return a 404 response with the message `"User not found"`.
7. IF the new `username` already belongs to a different user, THEN THE User_Management_API SHALL return a 409 response with the message `"Username already exists"`.
8. IF the `id` parameter is not a positive integer, THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the `id` must be a positive integer.
9. WHEN a `password` field is included in an update request, THE Password_Hasher SHALL hash the new password using bcrypt with a cost factor of at least 10 before writing to the database.
10. THE User_Service SHALL never store, return, or log a plain-text password.
11. IF the provided `username` exceeds 50 characters or contains characters outside alphanumeric, underscore, and hyphen, THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the username format is invalid.
12. WHEN an unauthenticated request is made to `PUT /api/users/:id`, THE User_Management_API SHALL return a 401 response with a JSON error body.

---

### Requirement 5: Delete a User

**User Story:** As an authenticated admin, I want to delete a user account, so that I can revoke system access when it is no longer needed.

#### Acceptance Criteria

1. WHEN an Authenticated_Request is made to `DELETE /api/users/:id` with a valid positive-integer `id` that exists in the `users` table, THE User_Management_API SHALL delete the user record with that `id` from the `users` table.
2. WHEN a user is deleted successfully, THE User_Management_API SHALL return a 200 response with the message `"User deleted successfully"`.
3. IF no user exists with the given `id`, THEN THE User_Management_API SHALL return a 404 response with the message `"User not found"`.
4. IF the `id` parameter is not a positive integer, THEN THE User_Management_API SHALL return a 400 response with a JSON error body indicating the `id` must be a positive integer.
5. WHEN an authenticated admin makes a `DELETE /api/users/:id` request where `:id` matches their own user `id`, THE User_Management_API SHALL return a 403 response with a JSON error body indicating self-deletion is not allowed.
6. WHEN an unauthenticated request is made to `DELETE /api/users/:id`, THE User_Management_API SHALL return a 401 response with a JSON error body.

---

### Requirement 6: Password Hashing

**User Story:** As a system owner, I want all user passwords to be stored as bcrypt hashes, so that plain-text passwords are never persisted or exposed.

#### Acceptance Criteria

1. WHEN Password_Hasher hashes a valid plain-text password (1–72 bytes UTF-8), IT SHALL use bcrypt with a cost factor of 10 and return a hash string.
2. WHEN Password_Hasher hashes the same plain-text password twice, IT SHALL produce two different hash strings (bcrypt salt uniqueness).
3. WHEN Password_Hasher verifies a plain-text password `p` against `hash(p)`, IT SHALL return `true` (round-trip property).
4. WHEN Password_Hasher verifies a plain-text password `p1` against `hash(p2)` where `p1 !== p2`, IT SHALL return `false` (cross-password non-match property).
5. IF a plain-text password exceeds 72 bytes (UTF-8), THEN Password_Hasher SHALL throw an error rather than silently truncate the input.
6. IF a system-level error occurs during hashing or verification, THEN THE User_Management_API SHALL return a 500 response with a JSON error body.
7. THE User_Service SHALL never return or log the `password` column value from any database query result, and SHALL never log plain-text passwords from request bodies.

---

### Requirement 7: Database Migration

**User Story:** As a developer, I want a SQL migration script that creates the `users` table, so that the schema is version-controlled and reproducible.

#### Acceptance Criteria

1. THE migration file SHALL be named following the sequential numbering convention already established in the project (e.g., `002_create_users_table.sql`) and placed under `src/database/migrations/`.
2. THE migration file SHALL contain a `CREATE TABLE IF NOT EXISTS users` statement with the following columns: `id` INT AUTO_INCREMENT PRIMARY KEY, `username` VARCHAR(100) UNIQUE NOT NULL, `password` VARCHAR(255) NOT NULL, `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP.
3. WHEN the migration is run on a database that already contains the `users` table with its existing rows and column definitions, THE migration script SHALL complete without error and leave existing data and schema unchanged.
