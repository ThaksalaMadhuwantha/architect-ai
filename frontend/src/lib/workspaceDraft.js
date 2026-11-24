// Helper to save and restore workspace state in IndexedDB across OAuth redirects
const DB_NAME = 'architect_ai_workspace_db';
const STORE_NAME = 'drafts';
const DRAFT_KEY = 'pending_oauth_workspace';

const openDraftDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Save current workspace state into IndexedDB
export const saveWorkspaceDraft = async (draft) => {
  try {
    const db = await openDraftDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ...draft, savedAt: Date.now() }, DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch (err) {
    console.warn('Failed to save workspace draft:', err);
    return false;
  }
};

// Load saved workspace state (expires after 2 hours)
export const loadWorkspaceDraft = async () => {
  try {
    const db = await openDraftDB();
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!data) return null;
    if (Date.now() - (data.savedAt || 0) > 2 * 60 * 60 * 1000) {
      await clearWorkspaceDraft();
      return null;
    }
    return data;
  } catch (err) {
    console.warn('Failed to load workspace draft:', err);
    return null;
  }
};

// Clear saved draft from IndexedDB after restoring
export const clearWorkspaceDraft = async () => {
  try {
    const db = await openDraftDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore cleanup errors
  }
};