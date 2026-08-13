import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, getDocs } from "firebase/firestore";

export class RoleService {
  static async getAllRoles() {
    await ensureAuth();
    const snapshot = await getDocs(collection(db, "roles"));
    return snapshot.docs.map((docSnap: any) => docSnap.data());
  }

  static async getAllPermissions() {
    await ensureAuth();
    const snapshot = await getDocs(collection(db, "permissions"));
    return snapshot.docs.map((docSnap: any) => docSnap.data());
  }
}
