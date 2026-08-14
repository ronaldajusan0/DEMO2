# SPEC — Salon Booking Website

## 1. Overview

A web application that lets salon clients discover services, view staff availability,
and book, reschedule, or cancel appointments online. Salon staff manage their
schedules, services, and clients through an admin dashboard.

- **Goal:** Reduce phone-based booking load and no-shows; give clients 24/7 self-service.
- **Primary users:** Clients (guests + registered), Stylists/Staff, Salon Admin/Owner.
- **Platforms:** Responsive web (mobile-first), works on modern browsers.

## 2. Goals & Non-Goals

### Goals
- Real-time, conflict-free appointment booking.
- Service catalog with price, duration, and category.
- Staff schedules with working hours, breaks, and time off.
- Automated email/SMS reminders to cut no-shows.
- Admin dashboard for services, staff, bookings, and reporting.

### Non-Goals (v1)
- In-app payment processing (deposits noted as future work).
- Native mobile apps.
- Inventory/point-of-sale.
- Multi-location franchise management.

## 3. Personas

| Persona | Needs |
|---------|-------|
| Guest client | Browse services, book without account. |
| Registered client | Faster rebooking, history, favorites. |
| Stylist | See own daily schedule, block time off. |
| Admin/Owner | Manage catalog, staff, view reports, override bookings. |

## 4. Functional Requirements

### 4.1 Service Catalog
- List services grouped by category (hair, nails, spa, etc.).
- Each service: name, description, duration (minutes), price, assigned staff.
- Search and filter by category, price, and duration.

### 4.2 Booking Flow
1. Select service(s).
2. Select staff (or "any available").
3. Pick date; system shows open time slots based on staff hours, existing bookings,
   and service duration.
4. Enter client details (guest) or log in.
5. Confirm; receive confirmation email/SMS.

- Slot computation must prevent double-booking (server-side lock/transaction).
- Support multi-service bookings with combined duration.
- Buffer time between appointments configurable per service.

### 4.3 Manage Bookings (Client)
- View upcoming and past appointments.
- Reschedule (subject to cancellation window).
- Cancel (subject to policy window, e.g. 24h).

### 4.4 Staff Dashboard
- Daily/weekly calendar view of own appointments.
- Set working hours, recurring breaks, and one-off time off.
- Mark appointment as completed / no-show.

### 4.5 Admin Dashboard
- CRUD services and categories.
- CRUD staff and assign services.
- View all bookings; manually create/edit/cancel.
- Reports: bookings per period, revenue estimate, no-show rate, staff utilization.

### 4.6 Notifications
- Booking confirmation (email + optional SMS).
- Reminder 24h and/or 2h before appointment.
- Cancellation/reschedule notice.

### 4.7 Authentication
- Client registration/login (email + password, optional OAuth).
- Role-based access: client, staff, admin.
- Password reset via email.

## 5. Non-Functional Requirements
- **Performance:** Slot availability query < 500ms p95.
- **Availability:** 99.5% uptime target.
- **Security:** Hashed passwords (bcrypt/argon2), HTTPS only, input validation,
  rate limiting on auth and booking endpoints, GDPR-compliant data handling.
- **Accessibility:** WCAG 2.1 AA.
- **Timezones:** Store UTC; display in salon local time.
- **Scalability:** Support 10k bookings/month single location.

## 6. Data Model (core entities)

- **User** — id, name, email, phone, password_hash, role, created_at.
- **Service** — id, category_id, name, description, duration_min, price, buffer_min, active.
- **Category** — id, name, sort_order.
- **Staff** — id, user_id, bio, active.
- **StaffService** — staff_id, service_id (many-to-many).
- **WorkingHours** — staff_id, weekday, start_time, end_time.
- **TimeOff** — staff_id, start_at, end_at, reason.
- **Appointment** — id, client_id, staff_id, service_id, start_at, end_at, status
  (pending/confirmed/completed/cancelled/no_show), notes, created_at.
- **Notification** — id, appointment_id, type, channel, scheduled_at, sent_at.

## 7. API Surface (representative)

```
GET    /api/services
GET    /api/services/:id
GET    /api/staff?service_id=
GET    /api/availability?service_id=&staff_id=&date=
POST   /api/appointments
GET    /api/appointments/:id
PATCH  /api/appointments/:id        # reschedule / status
DELETE /api/appointments/:id        # cancel
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/reset

# Admin/staff (auth-scoped)
POST   /api/admin/services
PATCH  /api/admin/services/:id
POST   /api/admin/staff
GET    /api/admin/reports?from=&to=
```

## 8. Tech Stack (proposed)
- **Frontend:** React + TypeScript, Vite, TanStack Query, Tailwind.
- **Backend:** Node.js + Express (or NestJS), TypeScript.
- **DB:** PostgreSQL.
- **Auth:** JWT + refresh tokens.
- **Notifications:** SendGrid (email), Twilio (SMS).
- **Hosting:** Containerized; CI/CD via GitHub Actions.

## 9. Milestones
1. **M1 — Foundation:** Auth, data model, service catalog.
2. **M2 — Booking core:** Availability engine, booking flow, confirmations.
3. **M3 — Management:** Staff + admin dashboards.
4. **M4 — Notifications & reports:** Reminders, reporting, polish.

## 10. Open Questions
- Deposit/payment required at booking?
- SMS in v1 or email-only?
- Cancellation policy window and penalties?
- Waitlist support needed?

## 11. Acceptance Criteria
- A guest can book an available slot end-to-end and receive confirmation.
- Double-booking is impossible under concurrent requests.
- Staff can block time off and it removes those slots.
- Admin can add a service and it appears in the catalog immediately.
- Reminders send at configured intervals.
