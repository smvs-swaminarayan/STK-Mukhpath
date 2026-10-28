// Firebase Initialization & Dedicated Collections Services
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  getDocs, 
  onSnapshot, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  orderBy,
  serverTimestamp,
  writeBatch
} from "firebase/firestore";
import { 
  DEFAULT_SWAMIS, 
  DEFAULT_MUKTOS, 
  DEFAULT_STANDUP_GROUPS, 
  VACHANAMRUTS, 
  KIRTANS 
} from "./data/masterData";

// User's provided Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAOJERDppn5ngxPKl8xEaKoIbZZ9p4ManA",
  authDomain: "mukhpath-15e33.firebaseapp.com",
  projectId: "mukhpath-15e33",
  storageBucket: "mukhpath-15e33.firebasestorage.app",
  messagingSenderId: "212202188264",
  appId: "1:212202188264:web:b9fba40ef34b9a4c15485d"
};

// Initialize Firebase App & Cloud Firestore
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Firestore Dedicated Collection Names
export const VACHANAMRUT_COL = "vachanamruts";
export const KIRTAN_COL = "kirtans";
export const MEMBER_COL = "members";
export const GROUP_COL = "groups";
export const ENTRIES_COL = "entries";
export const SETTINGS_COL = "settings";
export const CUSTOM_REPORTS_COL = "customReports";

// ================= 1. AUTO-SEED COLLECTIONS TO FIREBASE =================
export async function seedAllCollectionsToFirebase(force = false) {
  try {
    console.log("🔥 Checking & Seeding Firebase Collections...");

    // 1. Seed Vachanamruts Collection
    const vachSnap = await getDocs(collection(db, VACHANAMRUT_COL));
    if (vachSnap.empty || force) {
      console.log("🌱 Seeding vachanamruts collection...");
      const batch = writeBatch(db);
      VACHANAMRUTS.forEach(item => {
        const docRef = doc(db, VACHANAMRUT_COL, `vach_${item.num}`);
        batch.set(docRef, { ...item, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      console.log(`✅ Seeded ${VACHANAMRUTS.length} Vachanamruts to Firestore!`);
    }

    // 2. Seed Kirtans Collection
    const kirtanSnap = await getDocs(collection(db, KIRTAN_COL));
    if (kirtanSnap.empty || force) {
      console.log("🌱 Seeding kirtans collection...");
      const batch = writeBatch(db);
      KIRTANS.forEach(item => {
        const docRef = doc(db, KIRTAN_COL, `kirtan_${item.num}`);
        batch.set(docRef, { ...item, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      console.log(`✅ Seeded ${KIRTANS.length} Kirtans to Firestore!`);
    }

    // 3. Seed Members Collection (Swamis + Muktos)
    const memberSnap = await getDocs(collection(db, MEMBER_COL));
    if (memberSnap.empty || force) {
      console.log("🌱 Seeding members collection...");
      const batch = writeBatch(db);
      let mIdx = 1;
      DEFAULT_SWAMIS.forEach(s => {
        const docRef = doc(db, MEMBER_COL, `member_${mIdx++}`);
        batch.set(docRef, { ...s, role: "SWAMI", updatedAt: new Date().toISOString() });
      });
      DEFAULT_MUKTOS.forEach(m => {
        const docRef = doc(db, MEMBER_COL, `member_${mIdx++}`);
        batch.set(docRef, { ...m, role: "MUKTO", updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      console.log(`✅ Seeded members to Firestore!`);
    }

    // 4. Seed Groups Collection
    const groupSnap = await getDocs(collection(db, GROUP_COL));
    if (groupSnap.empty || force) {
      console.log("🌱 Seeding groups collection...");
      const batch = writeBatch(db);
      DEFAULT_STANDUP_GROUPS.forEach((g, idx) => {
        const docRef = doc(db, GROUP_COL, `group_${idx + 1}`);
        batch.set(docRef, { ...g, order: idx + 1, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      console.log(`✅ Seeded groups to Firestore!`);
    }

    // 5. Seed Settings
    const setDocRef = doc(db, SETTINGS_COL, "portalAuth");
    const setSnap = await getDoc(setDocRef);
    if (!setSnap.exists() || force) {
      await setDoc(setDocRef, {
        adminPin: "1234",
        muktoPin: "0000",
        updatedAt: new Date().toISOString()
      });
    }

    return true;
  } catch (err) {
    console.error("Firebase seedAllCollections error:", err);
    return false;
  }
}

// ================= 2. VACHANAMRUT CRUD OPERATIONS =================
export async function saveVachanamrutDoc(vachItem) {
  try {
    const docRef = doc(db, VACHANAMRUT_COL, `vach_${vachItem.num}`);
    await setDoc(docRef, {
      ...vachItem,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveVachanamrutDoc error:", err);
    return false;
  }
}

export async function deleteVachanamrutDoc(num) {
  try {
    const docRef = doc(db, VACHANAMRUT_COL, `vach_${num}`);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("deleteVachanamrutDoc error:", err);
    return false;
  }
}

// ================= 3. KIRTAN CRUD OPERATIONS =================
export async function saveKirtanDoc(kirtanItem) {
  try {
    const docRef = doc(db, KIRTAN_COL, `kirtan_${kirtanItem.num}`);
    await setDoc(docRef, {
      ...kirtanItem,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveKirtanDoc error:", err);
    return false;
  }
}

export async function deleteKirtanDoc(num) {
  try {
    const docRef = doc(db, KIRTAN_COL, `kirtan_${num}`);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("deleteKirtanDoc error:", err);
    return false;
  }
}

// ================= 4. MEMBER CRUD OPERATIONS =================
export async function saveMemberDoc(memberItem) {
  try {
    const id = memberItem.id || `member_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const docRef = doc(db, MEMBER_COL, id);
    await setDoc(docRef, {
      ...memberItem,
      id,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveMemberDoc error:", err);
    return false;
  }
}

export async function deleteMemberDoc(docId) {
  try {
    const docRef = doc(db, MEMBER_COL, docId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("deleteMemberDoc error:", err);
    return false;
  }
}

// ================= 5. SETTINGS CRUD =================
export async function saveSettingsDoc(adminPin, muktoPin, extra = {}) {
  try {
    const docRef = doc(db, SETTINGS_COL, "portalAuth");
    await setDoc(docRef, {
      adminPin,
      muktoPin,
      ...extra,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveSettingsDoc error:", err);
    return false;
  }
}

// ================= 6. RECITATION ENTRIES CRUD =================
export async function addEntriesToFirebase(newEntries) {
  try {
    const promises = newEntries.map(entry => {
      const entryId = entry.id || `REC_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const docRef = doc(db, ENTRIES_COL, entryId);
      return setDoc(docRef, {
        ...entry,
        id: entryId,
        createdAt: entry.createdAt || new Date().toISOString(),
        serverTimestamp: serverTimestamp()
      });
    });
    await Promise.all(promises);
    return true;
  } catch (err) {
    console.error("Firebase addEntries error:", err);
    return false;
  }
}

export async function deleteEntryFromFirebase(entryId) {
  try {
    const docRef = doc(db, ENTRIES_COL, entryId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("Firebase deleteEntry error:", err);
    return false;
  }
}

// Soft delete entry by Mukto (hidden from Mukto, kept in Admin archive)
export async function softDeleteEntryInFirebase(entryId) {
  try {
    const docRef = doc(db, ENTRIES_COL, entryId);
    await setDoc(docRef, {
      deletedByMukto: true,
      deletedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("Firebase softDeleteEntry error:", err);
    return false;
  }
}

// Restore soft-deleted entry back to active
export async function restoreEntryInFirebase(entryId) {
  try {
    const docRef = doc(db, ENTRIES_COL, entryId);
    await setDoc(docRef, {
      deletedByMukto: false,
      restoredAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("Firebase restoreEntry error:", err);
    return false;
  }
}

// Bulk delete entries (Permanent for Admin, Soft-Delete for Mukto)
export async function bulkDeleteEntriesFromFirebase(entryIds, isPermanent = false) {
  try {
    const batch = writeBatch(db);
    entryIds.forEach(id => {
      const docRef = doc(db, ENTRIES_COL, id);
      if (isPermanent) {
        batch.delete(docRef);
      } else {
        batch.set(docRef, {
          deletedByMukto: true,
          deletedAt: new Date().toISOString()
        }, { merge: true });
      }
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error("Firebase bulkDeleteEntries error:", err);
    return false;
  }
}

// ================= 7. STANDUP GROUPS & LEADERS CRUD =================
export async function saveGroupDoc(groupItem) {
  try {
    const id = groupItem.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const docRef = doc(db, GROUP_COL, id);
    await setDoc(docRef, {
      ...groupItem,
      id,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveGroupDoc error:", err);
    return false;
  }
}

export async function deleteGroupDoc(groupId) {
  try {
    const docRef = doc(db, GROUP_COL, groupId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("deleteGroupDoc error:", err);
    return false;
  }
}

// ================= 8. DYNAMIC CUSTOM REPORTS CRUD =================
export async function saveCustomReportDoc(reportItem) {
  try {
    const id = reportItem.id || `report_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const docRef = doc(db, CUSTOM_REPORTS_COL, id);
    await setDoc(docRef, {
      ...reportItem,
      id,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("saveCustomReportDoc error:", err);
    return false;
  }
}

export async function deleteCustomReportDoc(reportId) {
  try {
    const docRef = doc(db, CUSTOM_REPORTS_COL, reportId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("deleteCustomReportDoc error:", err);
    return false;
  }
}
