import { runArmCalibrationTest } from "@/lib/kinematics";
import { SEED_ASSEMBLIES } from "@/lib/seed-assemblies";
import type { AssemblyRecord } from "@/lib/types";

const STORAGE_KEY = "jointbench.assemblies.v2";
const IDB_NAME = "jointbench_glb_archive";
const IDB_STORE = "blobs";

function buildHydratedSeeds(): AssemblyRecord[] {
  return SEED_ASSEMBLIES.map((seed) => {
    const initialRun = runArmCalibrationTest(seed);
    return {
      ...seed,
      lastRun: initialRun,
      runHistory: [initialRun],
    };
  });
}

export function loadAssemblies(): AssemblyRecord[] {
  if (typeof window === "undefined") {
    return buildHydratedSeeds();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeds = buildHydratedSeeds();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    const parsed = JSON.parse(raw) as AssemblyRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeds = buildHydratedSeeds();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
      return seeds;
    }
    return parsed;
  } catch {
    return buildHydratedSeeds();
  }
}

export function saveAssemblies(records: AssemblyRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore storage quota warnings cleanly
  }
}

export function upsertAssembly(record: AssemblyRecord): AssemblyRecord[] {
  const current = loadAssemblies();
  const idx = current.findIndex((a) => a.id === record.id);
  const next =
    idx >= 0
      ? current.map((a, i) => (i === idx ? record : a))
      : [record, ...current];
  saveAssemblies(next);
  return next;
}

export function removeAssembly(id: string): AssemblyRecord[] {
  const next = loadAssemblies().filter((a) => a.id !== id);
  saveAssemblies(next);
  return next;
}

export function resetSeedAssemblies(): AssemblyRecord[] {
  const seeds = buildHydratedSeeds();
  saveAssemblies(seeds);
  return seeds;
}

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGlbBlob(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openBlobDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(buffer, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadGlbBlob(key: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openBlobDb();
    const res = await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as ArrayBuffer) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res;
  } catch {
    return null;
  }
}

export async function resolveAssemblyGlbBuffer(
  assembly: AssemblyRecord
): Promise<ArrayBuffer | null> {
  if (assembly.localBlobKey) {
    const local = await loadGlbBlob(assembly.localBlobKey);
    if (local) return local;
  }
  if (assembly.splitGlbUrl) {
    const fetchUrl = assembly.splitGlbUrl.startsWith("http")
      ? `/api/lux3d/fetch-glb?url=${encodeURIComponent(assembly.splitGlbUrl)}`
      : assembly.splitGlbUrl;
    const res = await fetch(fetchUrl);
    if (res.ok) return res.arrayBuffer();
  }
  return null;
}
