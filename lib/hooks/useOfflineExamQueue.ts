'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueuedAnswerItem {
  questionNo: string;
  answerText: string;
}

export interface QueuedSubmissionPayload {
  sessionId: string;
  answers: QueuedAnswerItem[];
}

interface PendingRecord {
  id: string;
  sessionId: string;
  answers: QueuedAnswerItem[];
  enqueuedAt: string;
  attempts: number;
}

export type SubmitOutcome =
  | { status: 'success'; data: unknown }
  | { status: 'queued'; message: string }
  | { status: 'error'; message: string };

const DB_NAME = 'vidyapath-offline';
const STORE_NAME = 'pending_submissions';
const DB_VERSION = 1;
const SUBMIT_ENDPOINT = '/api/exam/session/submit';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeRecord(db: IDBDatabase, record: PendingRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getAllRecords(db: IDBDatabase): Promise<PendingRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as PendingRecord[]);
    req.onerror = () => reject(req.error);
  });
}

function deleteRecord(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function attemptSubmit(payload: QueuedSubmissionPayload): Promise<{ ok: boolean; data: unknown; networkError: boolean }> {
  try {
    const response = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, data, networkError: false };
  } catch {
    return { ok: false, data: null, networkError: true };
  }
}

export function useOfflineExamQueue(): {
  enqueueSubmission: (payload: QueuedSubmissionPayload) => Promise<SubmitOutcome>;
  pendingCount: number;
} {
  const dbRef = useRef<IDBDatabase | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.indexedDB) return;
    openDb()
      .then(async (db) => {
        dbRef.current = db;
        const records = await getAllRecords(db);
        setPendingCount(records.length);
      })
      .catch(() => {
        // IDB unavailable — hook degrades to online-only mode
      });
  }, []);

  const syncPending = useCallback(async () => {
    const db = dbRef.current;
    if (!db || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const records = await getAllRecords(db);
      for (const record of records) {
        const { ok, networkError } = await attemptSubmit({
          sessionId: record.sessionId,
          answers: record.answers,
        });
        if (ok) {
          await deleteRecord(db, record.id).catch(() => undefined);
        } else if (!networkError) {
          // Server rejected — treat as unrecoverable, remove from queue
          await deleteRecord(db, record.id).catch(() => undefined);
        }
        // On network error, leave in queue to retry next online event
      }
      const remaining = await getAllRecords(db);
      setPendingCount(remaining.length);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, [syncPending]);

  const enqueueSubmission = useCallback(async (payload: QueuedSubmissionPayload): Promise<SubmitOutcome> => {
    // Skip fetch if already offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const db = dbRef.current;
      if (db) {
        const record: PendingRecord = {
          id: `${payload.sessionId}-${Date.now()}`,
          sessionId: payload.sessionId,
          answers: payload.answers,
          enqueuedAt: new Date().toISOString(),
          attempts: 0,
        };
        await storeRecord(db, record).catch(() => undefined);
        setPendingCount((n) => n + 1);
      }
      return { status: 'queued', message: 'You are offline. Your submission has been saved and will be sent automatically when you reconnect.' };
    }

    const { ok, data, networkError } = await attemptSubmit(payload);

    if (ok) {
      return { status: 'success', data };
    }

    if (networkError) {
      const db = dbRef.current;
      if (db) {
        const record: PendingRecord = {
          id: `${payload.sessionId}-${Date.now()}`,
          sessionId: payload.sessionId,
          answers: payload.answers,
          enqueuedAt: new Date().toISOString(),
          attempts: 1,
        };
        await storeRecord(db, record).catch(() => undefined);
        setPendingCount((n) => n + 1);
      }
      return { status: 'queued', message: 'Network error. Your submission has been saved and will be sent automatically when you reconnect.' };
    }

    // Server error — do not queue; surface to caller
    const errMsg =
      data && typeof data === 'object' && 'message' in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : 'Submission failed.';
    return { status: 'error', message: errMsg };
  }, []);

  return { enqueueSubmission, pendingCount };
}
