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
  ArrowRight,
  BarChart3,
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
  ScanLine,
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
  buildCompanyBillingHeaderText,
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
import { FriendlyExpenseIconSVG, JaiklaLogoSVG } from './components/BrandAssets';
import { BrandLockup } from './components/BrandLockup';
import { DecorativeGraphicsLayer, LoginHeroDecor } from './components/DecorativeGraphicsLayer';
import { PortalQrCard } from './components/PortalQrCard';
import { PublicUrgentExpenseView } from './components/PublicUrgentExpenseView';
import {
  VisualEffectsProvider,
  useVisualEffects,
} from './contexts/VisualEffectsContext';
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

type NavGroup = 'งานขายและเอกสาร' | 'รายจ่ายและคู่ค้า' | 'บัญชีและตั้งค่า';

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  shortLabel: string;
  group: NavGroup;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'งบประมาณและภาษี', shortLabel: 'ภาพรวม', group: 'งานขายและเอกสาร', icon: LayoutDashboard },
  { id: 'documents', label: 'ออกเอกสาร (QT/INV/REC)', shortLabel: 'เอกสาร', group: 'งานขายและเอกสาร', icon: FileText },
  { id: 'customers', label: 'ลูกค้าและวิเคราะห์', shortLabel: 'ลูกค้า', group: 'งานขายและเอกสาร', icon: Building2 },
  { id: 'suppliers', label: 'ซัพพลายเยอร์และเทียบราคา', shortLabel: 'คู่ค้า', group: 'รายจ่ายและคู่ค้า', icon: Truck },
  { id: 'expenses', label: 'รายจ่ายและ 50 ทวิ', shortLabel: 'รายจ่าย', group: 'รายจ่ายและคู่ค้า', icon: Receipt },
  { id: 'emergency', label: 'เบิกจ่ายฉุกเฉิน (LINE)', shortLabel: 'เบิกด่วน', group: 'รายจ่ายและคู่ค้า', icon: AlertTriangle },
  { id: 'annual', label: 'งบดุลและภาษีประจำปี', shortLabel: 'งบประจำปี', group: 'บัญชีและตั้งค่า', icon: Landmark },
  { id: 'storage', label: 'คลังข้อมูลและพื้นที่', shortLabel: 'คลังข้อมูล', group: 'บัญชีและตั้งค่า', icon: HardDrive },
  { id: 'settings', label: 'ตั้งค่าระบบและภาษี', shortLabel: 'ตั้งค่า', group: 'บัญชีและตั้งค่า', icon: Settings },
];

const MOBILE_BOTTOM_TABS: ActiveTab[] = ['dashboard', 'documents', 'expenses', 'emergency'];

const INITIAL_CATEGORIES = [
  { name: 'Production & Video Shooting', description: 'ทีมถ่ายทำ ตัดต่อ และโปรดักชัน', defaultWhtRate: 3 },
  { name: 'Graphic Design & Motion', description: 'ออกแบบกราฟิก Key Visual และ Motion', defaultWhtRate: 3 },
  { name: 'Event & Booth Setup', description: 'จัดงานอีเวนต์ ฉาก เวที และอุปกรณ์', defaultWhtRate: 3 },
  { name: 'KOL / Influencer Marketing', description: 'ค่าจ้างรีวิวและอินฟลูเอนเซอร์', defaultWhtRate: 3 },
  { name: 'Digital Media & Ads', description: 'ค่าโฆษณาออนไลน์และสื่อดิจิทัล', defaultWhtRate: 2 },
];

function MainApp() {
  const { showGraphics, setShowGraphics } = useVisualEffects();
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
          if (typeof data.showGraphics === 'boolean') {
            setShowGraphics(data.showGraphics);
          }
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
  }, [authReady, user, setShowGraphics]);

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
      <div className="relative min-h-screen bg-slate-50 flex items-center justify-center p-4 overflow-hidden">
        <DecorativeGraphicsLayer variant="login" />
        <div className="relative z-10 max-w-sm w-full">
          <BrandLockup
            size="md"
            companyNameTh={company.companyNameTh}
            companyNameEn={company.companyNameEn}
            logoUrl={company.logoUrl}
            subtitle="กำลังเชื่อมต่อระบบบัญชี..."
          />
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

    const resolvedAddress =
      company.address && company.address !== 'กรุงเทพมหานคร ประเทศไทย'
        ? company.address
        : DEFAULT_COMPANY_PROFILE.address;
    const subdistrictSplitIdx = resolvedAddress.search(/\s+(?=ต\.|แขวง)/);
    const addrLine1 =
      subdistrictSplitIdx > 0 ? resolvedAddress.slice(0, subdistrictSplitIdx).trim() : resolvedAddress;
    const addrLine2 =
      subdistrictSplitIdx > 0 ? resolvedAddress.slice(subdistrictSplitIdx).trim() : '';

    return (
      <div className="relative min-h-screen bg-slate-50 flex flex-col items-center justify-center p-3.5 sm:p-6 overflow-x-hidden">
        <DecorativeGraphicsLayer variant="login" />

        <div
          className={`relative z-10 max-w-[560px] w-full figma-card p-5 sm:p-7 animate-figma-in text-center overflow-hidden ${
            showGraphics ? 'shadow-xl border-indigo-100/90' : ''
          }`}
        >
          <LoginHeroDecor />

          <div className="relative z-10">
            {/* Uniform Centered Brand Lockup */}
            <BrandLockup
              size="lg"
              companyNameTh={company.companyNameTh}
              companyNameEn={company.companyNameEn}
              logoUrl={company.logoUrl}
              subtitle="ระบบออกเอกสารบัญชีและงบประมาณบริษัท"
              className="mb-4 pt-1"
            />

            {/* Switchable 3-Column Architectural Capability Highlights */}
            {showGraphics && (
              <div className="grid grid-cols-3 divide-x divide-slate-200/80 rounded-xl border border-indigo-100/80 bg-slate-50/80 py-2.5 px-1.5 mb-4">
                <div className="flex flex-col items-center justify-center gap-1 px-1">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-700 leading-tight">
                    ออกบิล QT·INV·REC
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 px-1">
                  <ScanLine className="w-4 h-4 text-teal-600 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-700 leading-tight">
                    สแกนบิล &amp; 50 ทวิ
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 px-1">
                  <BarChart3 className="w-4 h-4 text-violet-600 shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-700 leading-tight">
                    งบดุล &amp; LINE OA
                  </span>
                </div>
              </div>
            )}

            {/* Primary & Friendly Actions with clear Thai vowel breathing room */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
                className="figma-btn !rounded-xl w-full py-2.5 px-4 bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 inline-flex items-center justify-center gap-2 border-0 shadow-xs"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                <span>{signingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google Account'}</span>
              </button>

              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setPublicUrgentOpen(true)}
                  className="figma-btn friendly-expense-btn !rounded-xl w-full py-2.5 px-4 bg-teal-50 hover:bg-teal-100/80 text-teal-900 border border-teal-200 hover:border-teal-300 font-semibold inline-flex items-center justify-center gap-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                >
                  <FriendlyExpenseIconSVG className="w-5 h-5" />
                  <span className="whitespace-nowrap">แจ้งเบิกค่าใช้จ่ายโครงการ</span>
                  <ArrowRight className="w-4 h-4 text-teal-700 friendly-arrow shrink-0" />
                </button>
                <div className="mt-2 text-[11px] text-slate-500 leading-[1.6]">
                  ส่งบิลหน้างานได้ทันที ไม่ต้องเข้าสู่ระบบ
                </div>
              </div>
            </div>

            {/* QR Code Quick Access for LINE Sharing */}
            <PortalQrCard
              companyNameTh={company.companyNameTh || DEFAULT_COMPANY_PROFILE.companyNameTh}
              companyNameEn={company.companyNameEn || DEFAULT_COMPANY_PROFILE.companyNameEn}
            />

            {/* Compact Billing Header Footer */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-600 text-center space-y-1.5 leading-[1.45]">
              <div className="select-all space-y-0.5">
                <div className="font-semibold text-slate-800 leading-[1.4]">
                  {company.companyNameTh || DEFAULT_COMPANY_PROFILE.companyNameTh} · เลขประจำตัวผู้เสียภาษี :{' '}
                  <span className="font-mono-num">
                    {(company.taxId || DEFAULT_COMPANY_PROFILE.taxId).replace(/\D/g, '') || DEFAULT_COMPANY_PROFILE.taxId}
                  </span>
                </div>
                <div className="leading-[1.45]">สถานที่ตั้ง {addrLine1}</div>
                {addrLine2 && (
                  <div className="leading-[1.45] whitespace-nowrap">{addrLine2}</div>
                )}
                <div className="font-mono-num leading-[1.4]">
                  โทรศัพท์{' '}
                  {company.phone && company.phone !== '02-000-0000'
                    ? company.phone
                    : DEFAULT_COMPANY_PROFILE.phone}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(buildCompanyBillingHeaderText(company));
                    toastSuccess('คัดลอกข้อมูลหัวบิลบริษัทเรียบร้อย', 'สามารถนำไปวางส่งต่อให้ร้านค้าเพื่อออกใบกำกับภาษีได้ทันที');
                  } catch {
                    toastError('ไม่สามารถคัดลอกข้อความได้');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 !rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
              >
                <Copy className="w-3 h-3" />
                คัดลอกข้อมูลหัวบิลบริษัท
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col lg:flex-row overflow-x-hidden">
      <DecorativeGraphicsLayer variant="workspace" />

      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="px-3.5 py-4 border-b border-slate-200">
          <BrandLockup
            size="sm"
            companyNameTh={company.companyNameTh}
            companyNameEn={company.companyNameEn}
            logoUrl={company.logoUrl}
            subtitle="Accounting & Doc Suite"
          />
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

      {/* Mobile & Tablet Top App Bar (< lg) — Symmetric 3-column Centered Frame */}
      <header className="no-print lg:hidden bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30">
        <div className="px-3 sm:px-5 py-2 min-h-[62px] grid grid-cols-[44px_1fr_auto] sm:grid-cols-[128px_1fr_128px] items-center gap-2">
          {/* Left Symmetry Slot */}
          <div className="flex items-center min-w-0">
            <div className="hidden md:flex flex-col min-w-0 leading-tight">
              <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[115px]">
                {user.displayName || user.email}
              </span>
              <span className="text-[10px] font-bold uppercase font-mono-num text-slate-400">
                {userProfile?.role || (user.email === 'jaikladigital@gmail.com' ? 'admin' : 'staff')}
              </span>
            </div>
          </div>

          {/* Centered Brand Identity Block */}
          <div className="flex flex-col items-center justify-center text-center min-w-0">
            <div className="flex items-center justify-center gap-1.5 max-w-full">
              <JaiklaLogoSVG className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" logoUrl={company.logoUrl} />
              <span className="text-[12.5px] sm:text-[13.5px] font-bold text-slate-900 truncate leading-tight">
                {company.companyNameTh}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-indigo-700 truncate max-w-full leading-tight mt-0.5">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'ระบบบัญชีบริษัท'}
            </div>
          </div>

          {/* Right Menu Trigger */}
          <div className="flex items-center justify-end shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="relative min-h-[40px] min-w-[40px] px-2.5 inline-flex items-center justify-center gap-1.5 text-slate-700 !rounded-xl bg-slate-100 hover:bg-slate-200 border-0 text-xs font-semibold"
              aria-label="เปิดเมนูทั้งหมด"
            >
              <Menu className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">เมนูทั้งหมด</span>
              {pendingEmergencyCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono-num rounded-full bg-rose-600 text-white leading-none">
                  {pendingEmergencyCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tablet Quick-Switch Ribbon (md to <lg, 768px-1023px) */}
        <nav
          aria-label="เมนูแท็บเล็ต"
          className="hidden md:flex lg:hidden items-center gap-1.5 px-4 py-1.5 border-t border-slate-100 overflow-x-auto no-scrollbar bg-slate-50/70"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[36px] px-3 py-1.5 !rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border transition-colors ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{item.shortLabel}</span>
                {item.id === 'emergency' && pendingEmergencyCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold font-mono-num rounded-full leading-none ${
                      active ? 'bg-rose-500 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {pendingEmergencyCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Mobile & Tablet Slide-Over Drawer */}
      {mobileMenuOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="เมนูนำทางระบบ"
            className="relative w-full max-w-[330px] h-full bg-white shadow-2xl flex flex-col animate-figma-in z-10"
          >
            {/* Drawer Header — Centered Uniform Brand Lockup */}
            <div className="relative px-4 pt-4 pb-3 border-b border-slate-200">
              <BrandLockup
                size="sm"
                companyNameTh={company.companyNameTh}
                companyNameEn={company.companyNameEn}
                logoUrl={company.logoUrl}
                subtitle="เมนูจัดการระบบทั้งหมด"
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-3 right-3 min-h-[38px] min-w-[38px] inline-flex items-center justify-center !rounded-xl text-slate-600 hover:bg-slate-100 border-0 bg-transparent"
                aria-label="ปิดเมนู"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Identity Card */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 truncate leading-tight">
                  {user.displayName || user.email}
                </div>
                <div className="text-[11px] text-slate-500 truncate leading-tight">
                  {user.email} ·{' '}
                  <span className="uppercase font-mono-num font-semibold text-slate-700">
                    {userProfile?.role || (user.email === 'jaikladigital@gmail.com' ? 'admin' : 'staff')}
                  </span>
                </div>
              </div>
            </div>

            {/* Grouped Navigation Items */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {(['งานขายและเอกสาร', 'รายจ่ายและคู่ค้า', 'บัญชีและตั้งค่า'] as NavGroup[]).map(
                (groupName) => (
                  <div key={groupName} className="space-y-1">
                    <div className="px-2 text-[11px] font-bold text-slate-400 tracking-wide">
                      {groupName}
                    </div>
                    {NAV_ITEMS.filter((item) => item.group === groupName).map((item) => {
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
                          className={`w-full min-h-[44px] flex items-center gap-3 px-3 py-2 !rounded-xl text-sm font-medium transition-colors border-0 ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 bg-transparent hover:bg-slate-100'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="flex-1 text-left truncate">{item.label}</span>
                          {item.id === 'emergency' && pendingEmergencyCount > 0 && (
                            <span className="px-2 py-0.5 text-[10px] font-bold font-mono-num rounded-full bg-rose-600 text-white">
                              {pendingEmergencyCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-3.5 border-t border-slate-200 bg-white">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 !rounded-xl border border-rose-200"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Fixed Thumb-Zone Bottom Navigation (< md) */}
      <nav
        aria-label="เมนูลัดมือถือ"
        className="no-print md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-[60px] items-center">
          {MOBILE_BOTTOM_TABS.map((tabId) => {
            const item = NAV_ITEMS.find((n) => n.id === tabId)!;
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative h-full flex flex-col items-center justify-center gap-0.5 px-1 border-0 bg-transparent transition-colors ${
                  active ? 'text-slate-900 font-bold' : 'text-slate-500 font-medium'
                }`}
              >
                <div
                  className={`relative flex items-center justify-center w-9 h-6 rounded-full transition-colors ${
                    active ? 'bg-slate-900 text-white' : ''
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.id === 'emergency' && pendingEmergencyCount > 0 && (
                    <span className="absolute -top-1 -right-2 px-1 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold font-mono-num rounded-full bg-rose-600 text-white">
                      {pendingEmergencyCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px] leading-tight whitespace-nowrap mt-0.5">
                  {item.shortLabel}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`relative h-full flex flex-col items-center justify-center gap-0.5 px-1 border-0 bg-transparent transition-colors ${
              !MOBILE_BOTTOM_TABS.includes(activeTab)
                ? 'text-slate-900 font-bold'
                : 'text-slate-500 font-medium'
            }`}
          >
            <div
              className={`flex items-center justify-center w-9 h-6 rounded-full transition-colors ${
                !MOBILE_BOTTOM_TABS.includes(activeTab) ? 'bg-slate-900 text-white' : ''
              }`}
            >
              <Menu className="w-4 h-4" />
            </div>
            <span className="text-[11px] leading-tight whitespace-nowrap mt-0.5">เมนูอื่น</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 lg:pl-64 min-w-0 pb-20 md:pb-6 lg:pb-0">
        <div className="max-w-[1440px] mx-auto p-3.5 sm:p-6 lg:p-8">
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
              annualLedgers={annualLedgers}
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
      <VisualEffectsProvider>
        <MainApp />
      </VisualEffectsProvider>
    </ErrorBoundary>
  );
}
