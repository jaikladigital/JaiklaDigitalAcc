import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import {
  getStorage,
  FirebaseStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  listAll,
  getMetadata,
  deleteObject,
} from 'firebase/storage';
import appletConfig from '../firebase-applet-config.json';

/**
 * Firebase configuration supports both:
 * 1) Vercel / Vite environment variables (VITE_FIREBASE_*)
 * 2) AI Studio auto-provisioned firebase-applet-config.json
 */
const envApiKey = import.meta.env.VITE_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: envApiKey || appletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId,
  firestoreDatabaseId:
    import.meta.env.VITE_FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId || '(default)',
};

export const app: FirebaseApp = initializeApp(firebaseConfig);

const databaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';

export const db: Firestore =
  databaseId && databaseId !== '(default)'
    ? getFirestore(app, databaseId)
    : getFirestore(app);

export const auth: Auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const storage: FirebaseStorage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
      return false;
    }
    return true;
  }
}

/**
 * Compresses an image file to a lightweight Data URL fallback when Firebase Storage
 * bucket permissions are restricted, or uploads directly to Firebase Storage.
 */
async function compressImageToDataUrl(
  file: File,
  maxWidth = 800,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImageFileToLimit(
  file: File,
  maxLen = 52000
): Promise<string> {
  const attempts: Array<[number, number]> = [
    [820, 0.72],
    [600, 0.62],
    [440, 0.52],
    [320, 0.42],
  ];
  for (const [w, q] of attempts) {
    const out = await compressImageToDataUrl(file, w, q);
    if (out.length <= maxLen) return out;
  }
  return compressImageToDataUrl(file, 240, 0.35);
}

export async function uploadAssetFile(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  try {
    const storageRef = ref(storage, storagePath);
    const task = uploadBytesResumable(storageRef, file);

    const url = await new Promise<string>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Storage upload timeout'));
      }, 15000);

      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          }
        },
        (err) => {
          window.clearTimeout(timeout);
          reject(err);
        },
        async () => {
          window.clearTimeout(timeout);
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref);
            resolve(downloadUrl);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
    return url;
  } catch {
    // Fallback to compact WebP Data URL if Storage bucket CORS/rules block direct upload
    if (file.type.startsWith('image/')) {
      const dataUrl = await compressImageToDataUrl(file, 720, 0.72);
      if (dataUrl.length <= 50000) {
        return dataUrl;
      }
      const smaller = await compressImageToDataUrl(file, 460, 0.58);
      if (smaller.length <= 55000) {
        return smaller;
      }
      return await compressImageToDataUrl(file, 320, 0.45);
    }
    throw new Error('ไม่สามารถอัปโหลดไฟล์ไปยัง Firebase Storage ได้ กรุณาตรวจสอบสิทธิ์ Storage Bucket');
  }
}

export interface StorageAssetItem {
  name: string;
  fullPath: string;
  folder: string;
  sizeBytes: number;
  contentType: string;
  timeCreated: string;
  updated: string;
  downloadUrl: string;
}

export interface StorageScanResult {
  available: boolean;
  error?: string;
  files: StorageAssetItem[];
  totalBytes: number;
}

async function collectFolderFiles(
  folderPath: string,
  bucket: StorageAssetItem[],
  depth = 0
): Promise<void> {
  if (depth > 3) return;
  const folderRef = ref(storage, folderPath);
  const res = await listAll(folderRef);

  await Promise.all(
    res.items.map(async (itemRef) => {
      try {
        const [meta, downloadUrl] = await Promise.all([
          getMetadata(itemRef),
          getDownloadURL(itemRef).catch(() => ''),
        ]);
        bucket.push({
          name: itemRef.name,
          fullPath: itemRef.fullPath,
          folder: folderPath.split('/')[0] || 'root',
          sizeBytes: Number(meta.size) || 0,
          contentType: meta.contentType || 'application/octet-stream',
          timeCreated: meta.timeCreated || '',
          updated: meta.updated || '',
          downloadUrl,
        });
      } catch {
        // Skip unreadable individual object metadata
      }
    })
  );

  for (const prefixRef of res.prefixes) {
    await collectFolderFiles(prefixRef.fullPath, bucket, depth + 1);
  }
}

export async function listStorageUsage(): Promise<StorageScanResult> {
  const folders = ['expense_receipts', 'emergency_cash', 'company_assets'];
  const collected: StorageAssetItem[] = [];
  let hadPermissionError = false;
  let lastError = '';

  for (const folder of folders) {
    try {
      await collectFolderFiles(folder, collected);
    } catch (err) {
      hadPermissionError = true;
      lastError = err instanceof Error ? err.message : 'Storage access restricted';
    }
  }

  if (hadPermissionError && collected.length === 0) {
    return {
      available: false,
      error: lastError,
      files: [],
      totalBytes: 0,
    };
  }

  const totalBytes = collected.reduce((sum, f) => sum + f.sizeBytes, 0);
  return {
    available: true,
    files: collected.sort((a, b) => b.sizeBytes - a.sizeBytes),
    totalBytes,
  };
}

export async function deleteStorageFile(fullPathOrUrl: string): Promise<boolean> {
  if (!fullPathOrUrl || fullPathOrUrl.startsWith('data:')) return false;
  try {
    const fileRef = ref(storage, fullPathOrUrl);
    await deleteObject(fileRef);
    return true;
  } catch (err) {
    console.warn('Could not delete Storage file:', err);
    return false;
  }
}

