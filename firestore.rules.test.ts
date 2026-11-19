/**
 * Phase 0 Adversarial Security Rule Verification Spec
 * Maps the "Dirty Dozen" payloads against Firestore Rules invariants.
 */

export interface DirtyDozenCase {
  id: string;
  name: string;
  collection: string;
  operation: 'create' | 'update' | 'get' | 'list';
  payload: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    name: 'Self-Promotion on User Create',
    collection: 'users',
    operation: 'create',
    payload: { uid: 'staff_1', email: 'staff@example.com', displayName: 'Staff', role: 'admin' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    name: 'Role Escalation on User Update',
    collection: 'users',
    operation: 'update',
    payload: { role: 'admin' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    name: 'Unverified Email Admin Spoof',
    collection: 'settings',
    operation: 'update',
    payload: { defaultVatRate: 0 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    name: 'Shadow Ghost Field Injection',
    collection: 'customers',
    operation: 'create',
    payload: { companyName: 'Test', address: 'BKK', isApprovedOverride: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    name: 'Oversized Document ID Poisoning',
    collection: 'customers',
    operation: 'create',
    payload: { idLength: 1500 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    name: 'Orphaned Expense Without Valid Project',
    collection: 'expenses',
    operation: 'create',
    payload: { projectId: 'nonexistent_project_999', amount: 5000 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    name: 'Orphaned Document Without Valid Customer',
    collection: 'documents',
    operation: 'create',
    payload: { customerId: 'nonexistent_customer_999', type: 'QT' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    name: 'Empty Line Items Array in Document',
    collection: 'documents',
    operation: 'create',
    payload: { items: [] },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    name: 'Terminal Paid Document Mutation by Non-Admin',
    collection: 'documents',
    operation: 'update',
    payload: { grandTotal: 1, status: 'paid' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    name: 'Client-Forged Timestamp Backdating',
    collection: 'projects',
    operation: 'create',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    name: 'Cross-User PII Profile List Scrape',
    collection: 'users',
    operation: 'list',
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    name: 'Non-Admin Company Settings Tampering',
    collection: 'settings',
    operation: 'update',
    payload: { bankAccountNo: '999-999999-9' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
