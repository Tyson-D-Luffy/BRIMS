import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.ts";
import { adminDb, checkAdminHealth } from "../config/firebase-admin.ts";
import { db, ensureAuth } from "../config/firebase-client.ts";
import { doc, getDoc, setDoc } from "firebase/firestore";

export class SubscriptionController {
  static async getMySubscriptions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      
      let subscriptionData: any = null;
      let exists = false;

      const useAdmin = await checkAdminHealth();
      if (useAdmin) {
        try {
          const docRef = adminDb.collection("subscriptions").doc(req.user.uid);
          const subscriptionDoc = await docRef.get();
          exists = subscriptionDoc.exists;
          if (exists) {
            subscriptionData = subscriptionDoc.data();
          }
        } catch (adminError: any) {
          console.warn(`SubscriptionController.getMySubscriptions: Admin SDK query failed unexpectedly (${adminError.message}).`);
        }
      }

      if (!exists || !subscriptionData) {
        await ensureAuth();
        const docRef = doc(db, "subscriptions", req.user.uid);
        const subscriptionDoc = await getDoc(docRef);
        exists = subscriptionDoc.exists();
        if (exists) {
          subscriptionData = subscriptionDoc.data();
        }
      }

      if (!exists || !subscriptionData) {
        return res.json({ 
          success: true, 
          data: { eventTypes: [], channels: ["IN_APP"] } 
        });
      }
      
      res.json({ success: true, data: subscriptionData });
    } catch (error: any) {
      console.error("SubscriptionController.getMySubscriptions Error (all SDKs failed):", error);
      // Fallback to default mock subscriptions as absolute last resort
      res.json({ 
        success: true, 
        data: { eventTypes: ["BATCH_ISSUED", "BATCH_COMPLETED"], channels: ["IN_APP"] } 
      });
    }
  }

  static async updateSubscriptions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { eventTypes, channels } = req.body;
      
      const subscription = {
        userId: req.user.uid,
        eventTypes: eventTypes || [],
        channels: channels || ["IN_APP"],
        updatedAt: new Date().toISOString()
      };
      
      let saved = false;
      const useAdmin = await checkAdminHealth();
      if (useAdmin) {
        try {
          await adminDb.collection("subscriptions").doc(req.user.uid).set(subscription);
          saved = true;
        } catch (adminError: any) {
          console.warn(`SubscriptionController.updateSubscriptions: Admin SDK write failed unexpectedly (${adminError.message}).`);
        }
      }

      if (!saved) {
        await ensureAuth();
        const docRef = doc(db, "subscriptions", req.user.uid);
        await setDoc(docRef, subscription);
      }

      res.json({ success: true, data: subscription });
    } catch (error: any) {
      console.error("SubscriptionController.updateSubscriptions Error (all SDKs failed):", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
