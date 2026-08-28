import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, setDoc, updateDoc, runTransaction } from "firebase/firestore";
import { AuditService } from "./audit.service.ts";
import { BatchSheetRecord, RecordStatus } from "../../types.ts";

export class BatchSheetRecordService {
  static async createRecord(masterId: string, changeReason: string, user: any, transaction?: any, initialMasterData?: any) {
    if (!changeReason) {
      throw new Error("Reason for change is required for record control compliance");
    }

    const execute = async (t: any) => {
      let masterData = initialMasterData;
      
      if (!masterData) {
        const masterRef = doc(db, "batch_sheet_masters", masterId);
        const masterDoc = await t.get(masterRef);

        if (!masterDoc.exists()) {
          throw new Error("Batch Sheet Master not found");
        }
        masterData = masterDoc.data();
      }
      
      const recordRef = doc(collection(db, "batch_sheet_records"));
      
      const newRecord: any = {
        masterId,
        masterSnapshot: masterData,
        status: 'DRAFT' as RecordStatus,
        changeReason: changeReason,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        branch: masterData.branch || "Masulkhana",
      };

      t.set(recordRef, newRecord);

      await AuditService.logAction(
        user.uid,
        user.email,
        "CREATE_BATCH_SHEET_RECORD",
        recordRef.id,
        "BATCH_SHEET_RECORD",
        null,
        newRecord,
        changeReason,
        t
      );

      return { id: recordRef.id, ...newRecord };
    };

    if (transaction) {
      await ensureAuth();
      return await execute(transaction);
    } else {
      await ensureAuth();
      return await runTransaction(db, execute);
    }
  }

  static async getRecordsByMasterId(masterId: string, selectedBranch?: string) {
    await ensureAuth();
    let q = query(
      collection(db, "batch_sheet_records"),
      where("masterId", "==", masterId)
    );
    if (selectedBranch) {
      q = query(q, where("branch", "==", selectedBranch));
    }
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    // Sort in-memory to avoid index limitations
    records.sort((a: any, b: any) => {
      const timeA = a.createdAt || "";
      const timeB = b.createdAt || "";
      return timeB.localeCompare(timeA);
    });
    return records;
  }

  static async getAllRecords(selectedBranch?: string) {
    try {
      await ensureAuth();
      let q = collection(db, "batch_sheet_records") as any;
      if (selectedBranch) {
        q = query(q, where("branch", "==", selectedBranch));
      }
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      records.sort((a: any, b: any) => {
        const timeA = a.createdAt || "";
        const timeB = b.createdAt || "";
        return timeB.localeCompare(timeA);
      });
      return records;
    } catch (error) {
      await ensureAuth();
      console.error("Error fetching all records, falling back to unordered fetch:", error);
      let q = collection(db, "batch_sheet_records") as any;
      if (selectedBranch) {
        q = query(q, where("branch", "==", selectedBranch));
      }
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      return records;
    }
  }

  static async getRecordById(id: string) {
    await ensureAuth();
    const recordDoc = await getDoc(doc(db, "batch_sheet_records", id));
    if (!recordDoc.exists()) {
      throw new Error("Batch Sheet Record not found");
    }
    return { id: recordDoc.id, ...recordDoc.data() };
  }

  static async updateRecord(id: string, updateData: any, user: any) {
    const { changeReason, ...restOfData } = updateData;

    if (!changeReason) {
      throw new Error("Reason for change is required");
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const recordRef = doc(db, "batch_sheet_records", id);
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const currentData = recordDoc.data();

      if (currentData?.isLocked === true) {
        throw new Error("This record is APPROVED and LOCKED. Modifications are strictly prohibited.");
      }

      if (currentData?.status !== 'DRAFT') {
        throw new Error(`Cannot edit record in ${currentData?.status} status. Only DRAFT records can be edited.`);
      }

      const updatedRecord = {
        ...restOfData,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, updatedRecord);

      await AuditService.logAction(
        user.uid,
        user.email,
        "UPDATE_BATCH_SHEET_RECORD",
        id,
        "BATCH_SHEET_RECORD",
        currentData,
        updatedRecord,
        changeReason,
        transaction
      );

      return { id, ...updatedRecord };
    });
  }

  static async getLatestApprovedRecord(masterId: string) {
    await ensureAuth();
    const q = query(
      collection(db, "batch_sheet_records"),
      where("masterId", "==", masterId),
      where("status", "==", "APPROVED"),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  }

  static async autoInitializeRecord(masterId: string, user: any, masterData: any) {
    await ensureAuth();
    const sysUser = { uid: user?.uid || "system", email: user?.email || "system@brims.com" };
    
    return await runTransaction(db, async (transaction) => {
      const masterRef = doc(db, "batch_sheet_masters", masterId);
      const masterDocSnap = await transaction.get(masterRef);
      const masterDocData = masterDocSnap.exists() ? masterDocSnap.data() : masterData;

      const recordRef = doc(collection(db, "batch_sheet_records"));
      const timestamp = new Date().toISOString();
      
      const newRecord: any = {
        masterId,
        masterSnapshot: masterDocData || masterData,
        status: 'APPROVED' as RecordStatus,
        changeReason: "System auto-initialization of approved master template record",
        createdBy: sysUser.uid,
        createdAt: timestamp,
        updatedAt: timestamp,
        branch: masterDocData?.branch || masterData?.branch || "Masulkhana",
        approvedBy: sysUser.uid,
        approvedAt: timestamp,
        isLocked: true,
      };

      transaction.set(recordRef, newRecord);

      // Log creation in audit
      await AuditService.logAction(
        sysUser.uid,
        sysUser.email,
        "CREATE_BATCH_SHEET_RECORD",
        recordRef.id,
        "BATCH_SHEET_RECORD",
        null,
        newRecord,
        "System auto-initialization of approved master template record",
        transaction
      );

      // Update the master template status if it exists
      if (masterDocSnap.exists()) {
        const nextVerStr = masterDocData?.version || masterData?.version || "1.0";
        transaction.update(masterRef, {
          status: 'APPROVED',
          isLocked: true,
          version: nextVerStr,
          updatedAt: timestamp
        });
      }

      return { id: recordRef.id, ...newRecord };
    });
  }

  static async approveRecord(id: string, changeReason: string, user: any) {
    if (!changeReason) {
      throw new Error("Reason for approval is required for audit compliance");
    }

    await ensureAuth();
    const recordRef = doc(db, "batch_sheet_records", id);
    const recordDocSnapshot = await getDoc(recordRef);
    
    if (!recordDocSnapshot.exists()) {
      throw new Error("Batch Sheet Record not found");
    }
    
    const preliminaryData = recordDocSnapshot.data() as any;
    const masterId = preliminaryData.masterId;

    // 1. Find currently approved record for this master (OUTSIDE transaction)
    const q = query(
      collection(db, "batch_sheet_records"),
      where("masterId", "==", masterId),
      where("status", "==", "APPROVED")
    );
    const approvedSnapshot = await getDocs(q);
    const oldApprovedDocIds = approvedSnapshot.docs.map(d => d.id);

    return await runTransaction(db, async (transaction) => {
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found during transaction");
      }

      const recordData = recordDoc.data() as any;

      if (recordData?.status === 'APPROVED') {
        throw new Error("Record is already approved");
      }

      // Read master document before any writes
      const masterRef = doc(db, "batch_sheet_masters", masterId as string);
      const masterDoc = await transaction.get(masterRef);
      if (!masterDoc.exists()) {
        throw new Error("Batch Sheet Master not found");
      }
      const masterData = masterDoc.data();

      // 2. "Un-approve" existing approved records if they exist
      for (const oldDocId of oldApprovedDocIds) {
        transaction.update(doc(db, "batch_sheet_records", oldDocId), {
          status: 'ARCHIVED', 
          updatedAt: new Date().toISOString()
        });
      }

      // 3. Approve the new record
      const approvalData = {
        status: 'APPROVED' as RecordStatus,
        approvedBy: user.uid,
        approvedAt: new Date().toISOString(),
        isLocked: true,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, approvalData);

      // 4. Update the master template status to APPROVED as well
      let nextVerStr = masterData.version || "1.0";
      if (oldApprovedDocIds.length > 0) {
        let prevVer = masterData.version || "1.0";
        const prevApprovedRecord = approvedSnapshot.docs.find(d => d.data().status === "APPROVED");
        if (prevApprovedRecord) {
          prevVer = prevApprovedRecord.data().masterSnapshot?.version || prevVer;
        }
        const parsedVer = parseFloat(prevVer);
        nextVerStr = isNaN(parsedVer) ? "2.0" : (parsedVer + 1.0).toFixed(1);
      }

      transaction.update(masterRef, {
        status: 'APPROVED',
        isLocked: true,
        version: nextVerStr,
        updatedAt: new Date().toISOString()
      });

      // Update approved record's snapshot version to match
      transaction.update(recordRef, {
        "masterSnapshot.version": nextVerStr
      });

      await AuditService.logAction(
        user.uid,
        user.email,
        "BATCH_SHEET_RECORD_APPROVED",
        id,
        "BATCH_SHEET_RECORD",
        { status: recordData?.status },
        approvalData,
        changeReason,
        transaction
      );

      return { id, ...approvalData };
    });
  }

  static async rejectRecord(id: string, changeReason: string, user: any) {
    if (!changeReason) {
      throw new Error("Reason for rejection is required");
    }

    await ensureAuth();
    return await runTransaction(db, async (transaction) => {
      const recordRef = doc(db, "batch_sheet_records", id);
      const recordDoc = await transaction.get(recordRef);

      if (!recordDoc.exists()) {
        throw new Error("Batch Sheet Record not found");
      }

      const recordData = recordDoc.data();

      if (recordData?.status === "REJECTED") {
        throw new Error("Record is already rejected");
      }

      const rejectionData = {
        status: "REJECTED" as RecordStatus,
        updatedAt: new Date().toISOString(),
      };

      transaction.update(recordRef, rejectionData);

      await AuditService.logAction(
        user.uid,
        user.email,
        "BATCH_SHEET_RECORD_REJECTED",
        id,
        "BATCH_SHEET_RECORD",
        { status: recordData?.status },
        rejectionData,
        changeReason,
        transaction
      );

      return { id, ...rejectionData };
    });
  }

  static async isEditable(id: string) {
    await ensureAuth();
    const recordDoc = await getDoc(doc(db, "batch_sheet_records", id));
    if (!recordDoc.exists()) {
      throw new Error("Batch Sheet Record not found");
    }
    const data = recordDoc.data();
    const isLocked = data?.isLocked === true;
    const isDraft = data?.status === "DRAFT";
    
    return {
      id,
      isLocked,
      status: data?.status,
      isEditable: !isLocked && isDraft,
      reason: isLocked ? "LOCKED" : (!isDraft ? "NOT_DRAFT" : null)
    };
  }
}
