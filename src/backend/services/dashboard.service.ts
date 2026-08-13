import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, getDocs, query, where, orderBy, limit, count, getCountFromServer } from "firebase/firestore";
import { CacheService } from "./cache.service.ts";

export class DashboardService {
  private static getDateRange(range: string, startDate?: string, endDate?: string) {
    const now = new Date();
    let start = new Date();

    switch (range) {
      case "today":
        start.setHours(0, 0, 0, 0);
        break;
      case "7days":
        start.setDate(now.getDate() - 7);
        break;
      case "30days":
        start.setDate(now.getDate() - 30);
        break;
      case "custom":
        if (startDate) start = new Date(startDate);
        if (endDate) now.setTime(new Date(endDate).getTime());
        break;
      default:
        start.setDate(now.getDate() - 30); // Default 30 days
    }

    return { start: start.toISOString(), end: now.toISOString() };
  }

  static async getSummary(selectedBranch?: string) {
    const branchSuffix = selectedBranch ? `_${selectedBranch}` : "";
    const cacheKey = `dashboard_summary${branchSuffix}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    try {
      await ensureAuth();
      
      let qBatches = collection(db, "production_batches") as any;
      let qProducts = collection(db, "product_masters") as any;
      let qUsers = collection(db, "users") as any;

      if (selectedBranch) {
        qBatches = query(qBatches, where("branch", "==", selectedBranch));
        qProducts = query(qProducts, where("branch", "==", selectedBranch));
        qUsers = query(qUsers, where("defaultBranch", "==", selectedBranch));
      }

      const [batchesSnapshot, productsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(qBatches),
        getDocs(qProducts),
        getDocs(qUsers)
      ]);

      let batches = batchesSnapshot.docs.map(doc => doc.data() as any);
      let products = productsSnapshot.docs.map(doc => doc.data() as any);
      let users = usersSnapshot.docs.map(doc => doc.data() as any);

      // Deduplicate users to ensure statistics are correct
      const uniqueUsersMap = new Map<string, any>();
      users.forEach((u: any) => {
        const key = u.uid || u.email;
        if (key) uniqueUsersMap.set(key, u);
      });
      users = Array.from(uniqueUsersMap.values());

      // Filter active products and users
      const activeProducts = products.filter(p => p.status === "active");
      const activeUsers = users.filter(u => u.status === "active");

      const summary = {
        ISSUED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        RETURNED: 0,
        CANCELLED: 0,
        PENDING_REVIEW: 0,
        TOTAL: batches.length
      };

      batches.forEach(b => {
        const status = b.status as keyof typeof summary;
        if (summary[status] !== undefined) {
          summary[status]++;
        }
      });

      const result = {
        batch_summary: summary,
        total_products: activeProducts.length,
        total_users: activeUsers.length
      };

      CacheService.set(cacheKey, result, 60);
      return result;
    } catch (error) {
      console.error("DashboardService.getSummary Error:", error);
      return {
        batch_summary: { ISSUED: 0, IN_PROGRESS: 0, COMPLETED: 0, RETURNED: 0, CANCELLED: 0, TOTAL: 0 },
        total_products: 0,
        total_users: 0
      };
    }
  }

  static async getBatchTrends(range: string, startDate?: string, endDate?: string, selectedBranch?: string) {
    const branchSuffix = selectedBranch ? `_${selectedBranch}` : "";
    const cacheKey = `batch_trends_${range}_${startDate}_${endDate}${branchSuffix}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    try {
      await ensureAuth();
      const { start, end } = this.getDateRange(range, startDate, endDate);
      
      let q = collection(db, "production_batches") as any;
      if (selectedBranch) {
        q = query(q, where("branch", "==", selectedBranch));
      }
      
      const snapshot = await getDocs(q);
      
      let docs = snapshot.docs.map(doc => doc.data() as any);
      
      // Sort in-memory to prevent index errors
      docs.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
      
      // Filter in-memory
      docs = docs.filter(data => {
        if (!data.createdAt) return false;
        if (data.createdAt < start || data.createdAt > end) return false;
        return true;
      });
      
      const trends: Record<string, number> = {};
      
      docs.forEach(data => {
        const date = data.createdAt.split("T")[0];
        trends[date] = (trends[date] || 0) + 1;
      });

      const result = Object.entries(trends).map(([date, count]) => ({ date, count }));
      CacheService.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      console.error("DashboardService.getBatchTrends Error:", error);
      return [];
    }
  }

  static async getProductUsage(selectedBranch?: string) {
    const branchSuffix = selectedBranch ? `_${selectedBranch}` : "";
    const cacheKey = `product_usage_all${branchSuffix}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    try {
      await ensureAuth();
      
      let batchesQ = collection(db, "production_batches") as any;
      let productsQ = collection(db, "product_masters") as any;

      if (selectedBranch) {
        batchesQ = query(batchesQ, where("branch", "==", selectedBranch));
        productsQ = query(productsQ, where("branch", "==", selectedBranch));
      }

      const [batchesSnapshot, productsSnapshot] = await Promise.all([
        getDocs(batchesQ),
        getDocs(productsQ)
      ]);
      
      const batches = batchesSnapshot.docs.map(doc => doc.data() as any);
      const products = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const activeProducts = products.filter(p => p.status === "active");

      const usage: Record<string, { id: string; name: string; count: number }> = {};
      activeProducts.forEach(p => {
        usage[p.id] = { id: p.id, name: p.title, count: 0 };
      });

      batches.forEach(b => {
        const productId = b.productId;
        if (productId && usage[productId]) {
          usage[productId].count++;
        }
      });

      const result = Object.values(usage)
        .sort((a, b) => b.count - a.count);

      CacheService.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      console.error("DashboardService.getProductUsage Error:", error);
      return [];
    }
  }

  static async getUserActivity(selectedBranch?: string) {
    const branchSuffix = selectedBranch ? `_${selectedBranch}` : "";
    const cacheKey = `user_activity_top5${branchSuffix}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    try {
      await ensureAuth();
      
      let q = collection(db, "audit_trail") as any;
      if (selectedBranch) {
        q = query(q, where("selectedBranch", "==", selectedBranch));
      }
      q = query(q, limit(1000));
      const logsSnapshot = await getDocs(q);

      const logs = logsSnapshot.docs.map(doc => doc.data() as any);
      // Sort in-memory
      logs.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

      const activity: Record<string, { email: string; count: number }> = {};
      
      logs.forEach(data => {
        if (data.userId) {
          if (!activity[data.userId]) {
            activity[data.userId] = { email: data.userEmail || "Unknown", count: 0 };
          }
          activity[data.userId].count++;
        }
      });

      const result = Object.values(activity)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      CacheService.set(cacheKey, result, 300);
      return result;
    } catch (error) {
      console.error("DashboardService.getUserActivity Error:", error);
      return [];
    }
  }

  static async getAuditActivity(selectedBranch?: string) {
    try {
      await ensureAuth();
      let q = collection(db, "audit_trail") as any;
      if (selectedBranch) {
        q = query(q, where("selectedBranch", "==", selectedBranch));
      }
      q = query(q, limit(1000));
      const snapshot = await getDocs(q);
      
      const docs = snapshot.docs.map(doc => doc.data() as any);

      const counts: Record<string, number> = {};
      
      docs.forEach(data => {
        const action = data.action;
        if (action) {
          counts[action] = (counts[action] || 0) + 1;
        }
      });

      return Object.entries(counts).map(([action, count]) => ({ action, count }));
    } catch (error) {
      console.error("DashboardService.getAuditActivity Error:", error);
      return [];
    }
  }

  static async getRecentActivities(selectedBranch?: string) {
    try {
      await ensureAuth();
      
      let q = collection(db, "audit_trail") as any;
      if (selectedBranch) {
        q = query(q, where("selectedBranch", "==", selectedBranch));
      }
      q = query(q, limit(500));
      const snapshot = await getDocs(q);

      const docs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() as any }));
      // Sort in-memory
      docs.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

      return docs.slice(0, 10);
    } catch (error) {
      console.error("DashboardService.getRecentActivities Error:", error);
      return [];
    }
  }
}
