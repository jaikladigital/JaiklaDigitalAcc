import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  Copy,
  FileText,
  HardDrive,
  Landmark,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Truck,
  X,
} from 'lucide-react';
import Swal from 'sweetalert2';
import {
  app,
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testConnection,
} from './firebase';
import {
  AccountingDocument,
  AnnualFinancialLedger,
  COMPANY_BILLING_HEADER_TEXT,
  CompanyProfile,
  Customer,
  DEFAULT_COMPANY_LOGO,
  DEFAULT_COMPANY_PROFILE,
  Expense,
  Project,
  ServiceCategory,
  Supplier,
  UrgentExpenseRequest,
  UserProfile,
} from './types/accounting';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JaiklaLogoSVG } from './components/BrandAssets';
import { PublicUrgentExpenseView } from './components/PublicUrgentExpenseView';
import { DashboardView } from './views/DashboardView';
import { DocumentsView } from './views/DocumentsView';
import { CustomersView } from './views/CustomersView';
import { SuppliersView } from './views/SuppliersView';
import { ExpensesView } from './views/ExpensesView';
import { EmergencyCashView } from './views/EmergencyCashView';
import { StorageView } from './views/StorageView';
import { SettingsView } from './views/SettingsView';
import { AnnualReportsView } from './views/AnnualReportsView';
import { toastError, toastSuccess } from './utils/swal';
import { formatThaiLineBreaks } from './utils/thaiText';

type ActiveTab =
  | 'dashboard'
  | 'documents'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'emergency'
  | 'annual'
  | 'storage'
  | 'settings';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'dashboard', label: 'งบประมาณและภาษี', icon: LayoutDashboard },
  { id: 'documents', label: 'ออกเอกสาร (QT/INV/REC)', icon: FileText },
  { id: 'customers', label: 'ลูกค้าและวิเคราะห์', icon: Building2 },
  { id: 'suppliers', label: 'ซัพพลายเยอร์และเทียบราคา', icon: Truck },
  { id: 'expenses', label: 'รายจ่ายและ 50 ทวิ', icon: Receipt },
  { id: 'emergency', label: 'เบิกจ่ายฉุกเฉิน (LINE)', icon: AlertTriangle },
  { id: 'annual', label: 'งบดุลและภาษีประจำปี', icon: Landmark },
  { id: 'storage', label: 'คลังข้อมูลและพื้นที่', icon: HardDrive },
  { id: 'settings', label: 'ตั้งค่าระบบและภาษี', icon: Settings },
];

const INITIAL_CATEGORIES = [
  { name: 'Production & Video Shooting', description: 'ทีมถ่ายทำ ตัดต่อ และโปรดักชัน', defaultWhtRate: 3 },
  { name: 'Graphic Design & Motion', description: 'ออกแบบกราฟิก Key Visual และ Motion', defaultWhtRate: 3 },
  { name: 'Event & Booth Setup', description: 'จัดงานอีเวนต์ ฉาก เวที และอุปกรณ์', defaultWhtRate: 3 },
  { name: 'KOL / Influencer Marketing', description: 'ค่าจ้างรีวิวและอินฟลูเอนเซอร์', defaultWhtRate: 3 },
  { name: 'Digital Media & Ads', description: 'ค่าโฆษณาออนไลน์และสื่อดิจิทัล', defaultWhtRate: 2 },
];

function MainApp() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [documents, setDocuments] = useState<AccountingDocument[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [annualLedgers, setAnnualLedgers] = useState<AnnualFinancialLedger[]>([]);
  const [urgentRequests, setUrgentRequests] = useState<UrgentExpenseRequest[]>([]);

  const [publicUrgentOpen, setPublicUrgentOpen] = useState<boolean>(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mode') === 'urgent'
  );

  const [preselectedCustomer, setPreselectedCustomer] = useState<Customer | null>(null);

  // Startup connection check
  useEffect(() => {
    testConnection();
  }, []);

  // Auth listener + User/Admin/Settings bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser) {
        setUserProfile(null);
        return;
      }

      const isOwnerEmail =
        firebaseUser.email === 'jaikladigital@gmail.com' && firebaseUser.emailVerified;

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const initialRole = isOwnerEmail ? 'admin' : 'staff';
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || firebaseUser.email || 'Staff User',
            photoURL: firebaseUser.photoURL || '',
            role: initialRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          if (isOwnerEmail) {
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              createdAt: serverTimestamp(),
            });
          }
        } else if (isOwnerEmail) {
          const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
          if (!adminSnap.exists()) {
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              createdAt: serverTimestamp(),
            });
          }
        }

        // Bootstrap default company profile if admin & missing
        if (isOwnerEmail) {
          const settingsRef = doc(db, 'settings', 'company_profile');
          const settingsSnap = await getDoc(settingsRef);
          if (!settingsSnap.exists()) {
            await setDoc(settingsRef, {
              ...DEFAULT_COMPANY_PROFILE,
              updatedBy: firebaseUser.uid,
              updatedAt: serverTimestamp(),
            });
          }

          // Bootstrap initial service categories if empty
          const catSnap = await getDocs(collection(db, 'service_categories'));
          if (catSnap.empty) {
            await Promise.all(
              INITIAL_CATEGORIES.map((c) =>
                addDoc(collection(db, 'service_categories'), {
                  ...c,
                  createdBy: firebaseUser.uid,
                  teamUids: [firebaseUser.uid],
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                })
              )
            );
          }
        }
      } catch (err) {
        console.error('Bootstrap warning:', err);
      }
    });

    return () => unsub();
  }, []);

  // Firestore Real-time Subscriptions (only when authenticated)
  useEffect(() => {
    if (!authReady || !user) return;

    const isEmailAdmin = user.email === 'jaikladigital@gmail.com' && user.emailVerified;

    const scopedQuery = (colName: string) =>
      isEmailAdmin
        ? collection(db, colName)
        : query(collection(db, colName), where('teamUids', 'array-contains', user.uid));

    const unsubUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'company_profile'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CompanyProfile;
          setCompany({
            ...DEFAULT_COMPANY_PROFILE,
            ...data,
            logoUrl: data.logoUrl || DEFAULT_COMPANY_LOGO,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/company_profile')
    );

    const unsubCustomers = onSnapshot(
      scopedQuery('customers'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Customer, 'id'>) }));
        rows.sort((a, b) => a.companyName.localeCompare(b.companyName, 'th'));
        setCustomers(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers')
    );

    const unsubCategories = onSnapshot(
      scopedQuery('service_categories'),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceCategory, 'id'>),
        }));
        rows.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setCategories(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'service_categories')
    );

    const unsubSuppliers = onSnapshot(
      scopedQuery('suppliers'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Supplier, 'id'>) }));
        rows.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setSuppliers(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
    );

    const unsubProjects = onSnapshot(
      scopedQuery('projects'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
        rows.sort((a, b) => a.eventName.localeCompare(b.eventName, 'th'));
        setProjects(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'projects')
    );

    const unsubDocs = onSnapshot(
      scopedQuery('documents'),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AccountingDocument, 'id'>),
        }));
        rows.sort((a, b) => (b.docDate || '').localeCompare(a.docDate || ''));
        setDocuments(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'documents')
    );

    const unsubExpenses = onSnapshot(
      scopedQuery('expenses'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }));
        rows.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
        setExpenses(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenses')
    );

    const unsubAnnualLedgers = onSnapshot(
      scopedQuery('annual_ledgers'),
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AnnualFinancialLedger, 'id'>),
        }));
        rows.sort((a, b) => (b.fiscalYearBe || 0) - (a.fiscalYearBe || 0));
        setAnnualLedgers(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'annual_ledgers')
    );

    let unsubTeam: () => void = () => {};
    let unsubUrgentRequests: () => void = () => {};
    if (isEmailAdmin) {
      unsubTeam = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setTeamMembers(snap.docs.map((d) => d.data() as UserProfile));
        },
        () => {}
      );
      unsubUrgentRequests = onSnapshot(
        collection(db, 'urgent_requests'),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UrgentExpenseRequest, 'id'>),
          }));
          rows.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
          setUrgentRequests(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'urgent_requests')
      );
    }

    return () => {
      unsubUser();
      unsubSettings();
      unsubCustomers();
      unsubCategories();
      unsubSuppliers();
      unsubProjects();
      unsubDocs();
      unsubExpenses();
      unsubAnnualLedgers();
      unsubTeam();
      unsubUrgentRequests();
    };
  }, [authReady, user]);

  const teamUids = useMemo(() => {
    const uids = new Set<string>();
    if (user?.uid) uids.add(user.uid);
    teamMembers.forEach((m) => uids.add(m.uid));
    return Array.from(uids);
  }, [user, teamMembers]);

  const pendingEmergencyCount = useMemo(
    () =>
      expenses.filter(
        (e) =>
          e.isEmergencyCash &&
          (e.emergencyStatus === 'pending_reimburse' || !e.emergencyStatus)
      ).length +
      urgentRequests.filter((r) => r.status === 'pending_review').length,
    [expenses, urgentRequests]
  );

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      toastSuccess('เข้าสู่ระบบสำเร็จ', 'ยินดีต้อนรับเข้าสู่ระบบบัญชี บริษัท ใจกล้า ดิจิตอล จำกัด');
    } catch (error: unknown) {
      const errObj = error as { code?: string; message?: string };
      const errCode = errObj?.code || '';
      const errMsg = error instanceof Error ? error.message : String(error || '');

      if (errCode === 'auth/unauthorized-domain' || errMsg.includes('auth/unauthorized-domain')) {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
        const projectId = app.options.projectId || 'gen-lang-client-0436034249';
        const consoleUrl = `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/authentication/settings`;
        const safeHost = currentHost
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const safeProject = projectId
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        await Swal.fire({
          icon: 'warning',
          title: 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Auth',
          width: 580,
          customClass: { popup: 'jkd-swal-popup' },
          showConfirmButton: true,
          confirmButtonText: 'ปิดหน้าต่าง',
          confirmButtonColor: '#0f172a',
          html: `
            <div class="text-left text-xs sm:text-sm text-slate-700 space-y-3" style="line-height: 1.65;">
              <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
                ระบบไม่สามารถล็อกอิน Google ได้ เนื่องจากโดเมนปัจจุบันยังไม่ถูกเพิ่มในรายการ <strong>Authorized domains</strong> ของ Firebase
              </div>
              <div>
                <div class="font-semibold text-slate-900 mb-1">โดเมนที่ต้องเพิ่ม (คัดลอกค่านี้):</div>
                <div class="flex items-center gap-2">
                  <code class="flex-1 p-2 rounded bg-slate-100 border border-slate-200 text-xs font-mono break-all text-slate-900">${safeHost}</code>
                  <button type="button" id="jkd-copy-domain-btn" class="btn btn-sm btn-outline-primary whitespace-nowrap">คัดลอกโดเมน</button>
                </div>
              </div>
              <ol class="pl-5 space-y-1 text-xs text-slate-600 mb-0">
                <li>เปิดหน้า <strong>Firebase Console</strong> ของโปรเจกต์ <code class="font-mono">${safeProject}</code></li>
                <li>ไปที่เมนู <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong></li>
                <li>กดปุ่ม <strong>Add domain</strong> แล้ววางโดเมนด้านบน จากนั้นกด <strong>Add</strong> แล้วลองเข้าสู่ระบบใหม่อีกครั้ง</li>
              </ol>
              <div class="pt-1">
                <a href="${consoleUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary w-100 text-white text-decoration-none">
                  เปิดหน้าตั้งค่า Firebase Authentication (${safeProject})
                </a>
              </div>
            </div>
          `,
          didOpen: () => {
            const btn = document.getElementById('jkd-copy-domain-btn');
            if (btn) {
              btn.addEventListener('click', async () => {
                try {
                  await navigator.clipboard.writeText(currentHost);
                  btn.textContent = 'คัดลอกแล้ว ✓';
                } catch {
                  btn.textContent = 'คัดลอกไม่สำเร็จ';
                }
              });
            }
          },
        });
      } else if (errCode === 'auth/popup-blocked') {
        toastError(
          'เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป Google Login',
          'กรุณาอนุญาตป๊อปอัป (Allow Pop-ups) สำหรับเว็บไซต์นี้ แล้วกดเข้าสู่ระบบอีกครั้ง'
        );
      } else {
        toastError(
          'เข้าสู่ระบบไม่สำเร็จ',
          errMsg || 'กรุณาลองใหม่อีกครั้ง'
        );
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    toastSuccess('ออกจากระบบเรียบร้อย');
  };

  // Auth Loading State
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <JaiklaLogoSVG className="w-12 h-12 mx-auto" />
          <div className="text-sm font-medium text-slate-600">กำลังเชื่อมต่อระบบบัญชี...</div>
        </div>
      </div>
    );
  }

  // Login Gate / Public Urgent Expense Form
  if (!user) {
    if (publicUrgentOpen) {
      return (
        <PublicUrgentExpenseView
          company={company}
          onBackToLogin={() => {
            setPublicUrgentOpen(false);
            if (window.location.search.includes('mode=urgent')) {
              window.history.replaceState({}, '', window.location.pathname);
            }
          }}
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full figma-card p-6 sm:p-8 animate-figma-in text-center">
          <div className="flex flex-col items-center gap-2.5 mb-5">
            <JaiklaLogoSVG className="w-20 h-20 shrink-0" logoUrl={company.logoUrl} />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 m-0 leading-[1.48] thai-heading thai-title-center">
                {company.companyNameTh}
              </h1>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5 leading-[1.4]">
                {company.companyNameEn}
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-6 thai-heading thai-title-center leading-[1.48]">
            {formatThaiLineBreaks('ระบบออกเอกสารบัญชีและงบประมาณบริษัท')}
          </h2>

          <div className="space-y-3">
            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleSignIn}
              className="figma-btn w-full py-3 px-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 inline-flex items-center justify-center gap-2.5"
            >
              <LogIn className="w-4 h-4" />
              {signingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google Account'}
            </button>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setPublicUrgentOpen(true)}
                className="figma-btn w-full py-3 px-4 bg-rose-50 text-rose-800 border border-rose-200 font-semibold rounded-xl hover:bg-rose-100 inline-flex items-center justify-center gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
                แจ้งค่าใช้จ่ายฉุกเฉินด่วน (ไม่ต้องเข้าสู่ระบบ)
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-600 text-center space-y-2 leading-relaxed">
            <div className="select-all">
              <div className="font-semibold text-slate-800">
                บริษัท ใจกล้า ดิจิตอล จำกัด
              </div>
              <div className="font-mono-num">
                เลขประจำตัวผู้เสียภาษี : 0105562067888
              </div>
              <div>
                สถานที่ตั้ง 70/574 ซ.คลองหลวง24 หมู่บ้านกฤษดานคร19 หมู่3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120
              </div>
              <div className="font-mono-num">โทรศัพท์ 083-899-9698</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(COMPANY_BILLING_HEADER_TEXT);
                  toastSuccess('คัดลอกข้อมูลหัวบิลบริษัทเรียบร้อย', 'สามารถนำไปวางส่งต่อให้ร้านค้าเพื่อออกใบกำกับภาษีได้ทันที');
                } catch {
                  toastError('ไม่สามารถคัดลอกข้อความได้');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
            >
              <Copy className="w-3.5 h-3.5" />
              คัดลอกข้อมูลหัวบิลบริษัท
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="p-4 border-b border-slate-200 flex flex-col items-center text-center gap-2">
          <JaiklaLogoSVG className="w-14 h-14 shrink-0" logoUrl={company.logoUrl} />
          <div className="min-w-0 w-full">
            <div className="text-sm font-bold text-slate-900 leading-[1.48] truncate py-0.5">
              {company.companyNameTh}
            </div>
            <div className="text-[11px] font-medium text-slate-500 truncate leading-[1.4]">
              Accounting &amp; Doc Suite
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium leading-[1.55] transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate py-0.5 flex-1 text-left">{item.label}</span>
                {item.id === 'emergency' && pendingEmergencyCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono-num rounded bg-rose-600 text-white">
                    {pendingEmergencyCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-2.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                {(user.displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 truncate leading-[1.48]">
                {user.displayName || user.email}
              </div>
              <div className="text-[11px] text-slate-500 uppercase font-mono-num">
                {userProfile?.role || (user.email === 'jaikladigital@gmail.com' ? 'admin' : 'staff')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="no-print lg:hidden bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <JaiklaLogoSVG className="w-9 h-9 shrink-0" logoUrl={company.logoUrl} />
          <span className="text-sm font-bold text-slate-900 truncate leading-[1.5] py-0.5">
            {company.companyNameTh}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-700 rounded-lg hover:bg-slate-100"
          aria-label="Toggle Menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print lg:hidden fixed inset-x-0 top-[57px] bg-white border-b border-slate-200 z-30 p-3 space-y-1 shadow-lg">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-700 bg-rose-50 rounded-lg"
            >
              <LogOut className="w-3.5 h-3.5" />
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 min-w-0">
        <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              documents={documents}
              expenses={expenses}
              projects={projects}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsView
              documents={documents}
              customers={customers}
              projects={projects}
              company={company}
              teamUids={teamUids}
              currentUserProfile={userProfile}
              preselectedCustomer={preselectedCustomer}
              onClearPreselectedCustomer={() => setPreselectedCustomer(null)}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              customers={customers}
              documents={documents}
              projects={projects}
              teamUids={teamUids}
              onCreateQuotationForCustomer={(customer) => {
                setPreselectedCustomer(customer);
                setActiveTab('documents');
              }}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersView
              suppliers={suppliers}
              categories={categories}
              expenses={expenses}
              teamUids={teamUids}
            />
          )}

          {activeTab === 'expenses' && (
            <ExpensesView
              expenses={expenses}
              projects={projects}
              customers={customers}
              suppliers={suppliers}
              categories={categories}
              company={company}
              teamUids={teamUids}
              onOpenEmergencyTab={() => setActiveTab('emergency')}
            />
          )}

          {activeTab === 'emergency' && (
            <EmergencyCashView
              expenses={expenses}
              projects={projects}
              customers={customers}
              suppliers={suppliers}
              categories={categories}
              company={company}
              teamUids={teamUids}
              urgentRequests={urgentRequests}
              isEmailAdmin={user.email === 'jaikladigital@gmail.com' && user.emailVerified}
            />
          )}

          {activeTab === 'annual' && (
            <AnnualReportsView
              documents={documents}
              expenses={expenses}
              company={company}
              annualLedgers={annualLedgers}
              teamUids={teamUids}
            />
          )}

          {activeTab === 'storage' && (
            <StorageView
              documents={documents}
              expenses={expenses}
              customers={customers}
              suppliers={suppliers}
              projects={projects}
              categories={categories}
              company={company}
              currentUserProfile={userProfile}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              company={company}
              currentUserProfile={userProfile}
              teamMembers={teamMembers}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
