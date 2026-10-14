
## LEARN DATABASE REALTIONS!!!!!!!!!!
# To handle later

## Security: admin-only endpoints are not enforced

Noted on 2026-10-03.

**Problem.** `@PreAuthorize` only works when `@EnableMethodSecurity` is on a configuration class, and it is missing from the whole project. Every `@PreAuthorize` is silently ignored.

**Affected endpoints:**

- **`POST /api/v1/forms/NewForm`** in `CheckListController`. Creating checklist forms is meant for admins, but any logged-in user (any technician) can do it today. It falls under `anyRequest().authenticated()` in `SecurityConfig`.
- **The delete-user endpoint** in `UserController`. It has `@PreAuthorize("hasRole('ADMIN')")`, but the annotation is ignored, so any logged-in user can delete users.

**Fix (recommended).**

1. Add `@EnableMethodSecurity` next to `@EnableWebSecurity` on `SecurityConfig`.
2. Add `@PreAuthorize("hasRole('ADMIN')")` on `makeNewForm` in `CheckListController`.

This also activates the existing annotation on the delete-user endpoint.

**Alternative.** Move the endpoint under `/api/admin/forms`. The `/api/admin/**` rule in `SecurityConfig` already requires the admin role. This does not fix the delete-user endpoint.

**How to check it works.**

- Post a form as an admin: expect 201.
- Post a form as a technician: expect 403.
- Delete a user as a technician: expect 403.
