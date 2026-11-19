# Security Specification — Jaikla Digital Accounting Suite

## 1. Data Invariants
1. **Verified Identity**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
2. **RBAC Non-Escalation**: Users creating their own `/users/{uid}` document cannot set `role: 'admin'` unless their verified email is the bootstrapped owner email (`jaikladigital@gmail.com`). Users cannot modify their own `role` after creation.
3. **Referential Integrity**: Every `Project` must reference an existing `Customer`. Every `Supplier` must reference an existing `ServiceCategory`. Every `AccountingDocument` must reference an existing `Customer`. Every `Expense` must reference an existing `Project`.
4. **Immutable Audit Trail**: `createdBy` and `createdAt` cannot be modified after creation. `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
5. **Terminal State Locking**: Once an `AccountingDocument` reaches `status: 'paid'` or `status: 'cancelled'`, non-admin staff cannot modify the document.
6. **Strict Payload Boundaries**: Every string has `.size()` caps, `items` array is bounded (`1..50`), `teamUids` array is bounded (`1..30`), and `hasOnly` / `affectedKeys().hasOnly()` blocks ghost fields.
7. **Zero-Cost List Isolation**: `allow list` never invokes `get()` or `exists()`; it checks `isEmailAdmin() || resource.data.createdBy == request.auth.uid || request.auth.uid in resource.data.teamUids`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Promotion on User Create**: Non-owner user sends `{ uid, email, role: 'admin', ... }` to `/users/{uid}` -> DENIED.
2. **Role Escalation on User Update**: Staff user sends `{ role: 'admin' }` in update to `/users/{uid}` -> DENIED.
3. **Unverified Email Spoof**: User with `email: 'jaikladigital@gmail.com'` and `email_verified: false` tries to read/write `/settings/company_profile` -> DENIED.
4. **Shadow Ghost Field**: User sends `{ companyName: 'Acme', isSuperAdmin: true, ... }` to `/customers/{id}` -> DENIED by `hasOnly()`.
5. **1MB ID Poisoning**: User attempts to write `/customers/<1500-char-id>` -> DENIED by `isValidId()`.
6. **Orphaned Expense**: User creates an expense with non-existent `projectId: 'fake_proj'` -> DENIED by `exists()`.
7. **Orphaned Document**: User creates a quotation with non-existent `customerId: 'fake_cust'` -> DENIED by `exists()`.
8. **Empty Items Array**: User creates a document with `items: []` -> DENIED by `items.size() >= 1`.
9. **Terminal Document Tampering**: Staff user updates `grandTotal` on a document whose `status == 'paid'` -> DENIED.
10. **Timestamp Backdating**: User sends `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time` -> DENIED.
11. **PII Cross-User Scrape**: Staff user calls `get` or `list` on another user's `/users/{otherUid}` -> DENIED.
12. **Non-Admin Settings Override**: Staff user attempts to update `defaultVatRate` in `/settings/company_profile` -> DENIED.
