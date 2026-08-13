import { db, ensureAuth } from "../config/firebase-client.ts";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, addDoc, updateDoc } from "firebase/firestore";
import { SocketService } from "./socket.service.ts";
import { getEquivalentBackendRoles } from "../utils/auth-utils.ts";

export enum NotificationType {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  SUCCESS = "SUCCESS"
}

export enum TargetType {
  USER = "USER",
  ROLE = "ROLE"
}

export class NotificationService {
  /**
   * Sends a notification to a specific user or role.
   */
  static async sendNotification(params: {
    title: string;
    message: string;
    type: NotificationType;
    targetType: TargetType;
    targetId: string;
    link?: string;
    eventType?: string;
  }) {
    // Map common words in titles and messages to specific Roles/Permissions Matrix task IDs
    let resolvedEventType = params.eventType || "";
    
    if (!resolvedEventType) {
      const titleLower = params.title.toLowerCase();
      const msgLower = params.message.toLowerCase();
      
      if (titleLower.includes("pending review") || titleLower.includes("pending for review") || (titleLower.includes("issuance request") && msgLower.includes("pending review"))) {
        resolvedEventType = "batch:review";
      } else if (titleLower.includes("approved") && titleLower.includes("issuance")) {
        resolvedEventType = "batch:approve";
      } else if (titleLower.includes("issued") && titleLower.includes("batch")) {
        resolvedEventType = "batch:issue";
      } else if (titleLower.includes("printed") || titleLower.includes("print")) {
        resolvedEventType = "batch:print";
      } else if (titleLower.includes("status changed") || titleLower.includes("production status")) {
        resolvedEventType = "batch:status";
      } else if (titleLower.includes("close") || titleLower.includes("closed")) {
        resolvedEventType = "batch:close";
      } else if (titleLower.includes("product master") && (titleLower.includes("created") || titleLower.includes("new"))) {
        resolvedEventType = "create:product";
      } else if (titleLower.includes("product master") && titleLower.includes("edited")) {
        resolvedEventType = "edit:product";
      } else if (titleLower.includes("product master") && titleLower.includes("approved")) {
        resolvedEventType = "product:approve";
      } else if (titleLower.includes("critical") || titleLower.includes("audit")) {
        resolvedEventType = "audit:view";
      } else if (titleLower.includes("user")) {
        resolvedEventType = "user:manage";
      } else if (titleLower.includes("department") && (titleLower.includes("created") || titleLower.includes("new"))) {
        resolvedEventType = "department:create";
      } else if (titleLower.includes("department") && titleLower.includes("submitted")) {
        resolvedEventType = "department:submit";
      } else if (titleLower.includes("department") && titleLower.includes("approved")) {
        resolvedEventType = "department:approve";
      } else if (titleLower.includes("designation") && (titleLower.includes("created") || titleLower.includes("new"))) {
        resolvedEventType = "designation:create";
      } else if (titleLower.includes("designation") && titleLower.includes("submitted")) {
        resolvedEventType = "designation:submit";
      } else if (titleLower.includes("designation") && titleLower.includes("approved")) {
        resolvedEventType = "designation:approve";
      } else if (titleLower.includes("batch number") && (titleLower.includes("created") || titleLower.includes("new"))) {
        resolvedEventType = "batch_number:create";
      } else if (titleLower.includes("batch number") && titleLower.includes("submitted")) {
        resolvedEventType = "batch_number:submit";
      } else if (titleLower.includes("batch number") && titleLower.includes("approved")) {
        resolvedEventType = "batch_number:approve";
      } else if (titleLower.includes("format") && (titleLower.includes("created") || titleLower.includes("new") || titleLower.includes("edited"))) {
        resolvedEventType = "format:create";
      } else if (titleLower.includes("format") && titleLower.includes("submitted")) {
        resolvedEventType = "format:submit";
      } else if (titleLower.includes("format") && titleLower.includes("approved")) {
        resolvedEventType = "format:approve";
      } else if (titleLower.includes("lookup") && (titleLower.includes("created") || titleLower.includes("new"))) {
        resolvedEventType = "lookup:create";
      } else if (titleLower.includes("lookup") && titleLower.includes("submitted")) {
        resolvedEventType = "lookup:submit";
      } else if (titleLower.includes("lookup") && titleLower.includes("approved")) {
        resolvedEventType = "lookup:approve";
      } else if (titleLower.includes("completed") || titleLower.includes("finish")) {
        resolvedEventType = "op:completed";
      } else if (titleLower.includes("return")) {
        resolvedEventType = "batch:status";
      } else {
        resolvedEventType = "batch:issue"; // Default fallback
      }
    }

    const notification = {
      title: params.title,
      message: params.message,
      type: params.type,
      targetType: params.targetType,
      targetId: params.targetId,
      link: params.link,
      isRead: false,
      readBy: [],
      createdAt: new Date().toISOString(),
      eventType: resolvedEventType
    };

    await ensureAuth();
    const docRef = await addDoc(collection(db, "notifications"), notification);
    const notificationWithId = { id: docRef.id, ...notification };

    // Send real-time notification via WebSockets
    if (params.targetType === TargetType.USER) {
      SocketService.notifyUser(params.targetId, notificationWithId);
    } else if (params.targetType === TargetType.ROLE) {
      SocketService.notifyRole(params.targetId, notificationWithId);
    }
    
    // Check for subscriptions and send emails
    await this.processSubscriptions({ ...params, eventType: resolvedEventType });

    return docRef.id;
  }

  /**
   * Processes subscriptions for the given event and sends emails.
   */
  private static async processSubscriptions(params: {
    title: string;
    message: string;
    type: NotificationType;
    targetType: TargetType;
    targetId: string;
    link?: string;
    eventType?: string;
  }) {
    try {
      // Map common words in titles and messages to specific Roles/Permissions Matrix task IDs
      let eventType = params.eventType || "";
      
      if (!eventType) {
        const titleLower = params.title.toLowerCase();
        const msgLower = params.message.toLowerCase();
        
        if (titleLower.includes("pending review") || titleLower.includes("pending for review") || (titleLower.includes("issuance request") && msgLower.includes("pending review"))) {
          eventType = "batch:review";
        } else if (titleLower.includes("approved") && titleLower.includes("issuance")) {
          eventType = "batch:approve";
        } else if (titleLower.includes("issued") && titleLower.includes("batch")) {
          eventType = "batch:issue";
        } else if (titleLower.includes("printed") || titleLower.includes("print")) {
          eventType = "batch:print";
        } else if (titleLower.includes("status changed") || titleLower.includes("production status")) {
          eventType = "batch:status";
        } else if (titleLower.includes("close") || titleLower.includes("closed")) {
          eventType = "batch:close";
        } else if (titleLower.includes("product master") && (titleLower.includes("created") || titleLower.includes("new"))) {
          eventType = "create:product";
        } else if (titleLower.includes("product master") && titleLower.includes("edited")) {
          eventType = "edit:product";
        } else if (titleLower.includes("product master") && titleLower.includes("approved")) {
          eventType = "product:approve";
        } else if (titleLower.includes("critical") || titleLower.includes("audit")) {
          eventType = "audit:view";
        } else if (titleLower.includes("user")) {
          eventType = "user:manage";
        } else if (titleLower.includes("department") && (titleLower.includes("created") || titleLower.includes("new"))) {
          eventType = "department:create";
        } else if (titleLower.includes("department") && titleLower.includes("submitted")) {
          eventType = "department:submit";
        } else if (titleLower.includes("department") && titleLower.includes("approved")) {
          eventType = "department:approve";
        } else if (titleLower.includes("designation") && (titleLower.includes("created") || titleLower.includes("new"))) {
          eventType = "designation:create";
        } else if (titleLower.includes("designation") && titleLower.includes("submitted")) {
          eventType = "designation:submit";
        } else if (titleLower.includes("designation") && titleLower.includes("approved")) {
          eventType = "designation:approve";
        } else if (titleLower.includes("batch number") && (titleLower.includes("created") || titleLower.includes("new"))) {
          eventType = "batch_number:create";
        } else if (titleLower.includes("batch number") && titleLower.includes("submitted")) {
          eventType = "batch_number:submit";
        } else if (titleLower.includes("batch number") && titleLower.includes("approved")) {
          eventType = "batch_number:approve";
        } else if (titleLower.includes("format") && (titleLower.includes("created") || titleLower.includes("new") || titleLower.includes("edited"))) {
          eventType = "format:create";
        } else if (titleLower.includes("format") && titleLower.includes("submitted")) {
          eventType = "format:submit";
        } else if (titleLower.includes("format") && titleLower.includes("approved")) {
          eventType = "format:approve";
        } else if (titleLower.includes("lookup") && (titleLower.includes("created") || titleLower.includes("new"))) {
          eventType = "lookup:create";
        } else if (titleLower.includes("lookup") && titleLower.includes("submitted")) {
          eventType = "lookup:submit";
        } else if (titleLower.includes("lookup") && titleLower.includes("approved")) {
          eventType = "lookup:approve";
        } else if (titleLower.includes("completed") || titleLower.includes("finish")) {
          eventType = "op:completed";
        } else if (titleLower.includes("return")) {
          eventType = "batch:status";
        } else {
          eventType = "batch:issue"; // Default fallback
        }
      }
      
      console.log(`[NOTIFICATION]: Processing subscriptions for ${params.title} (Mapped Event Type: ${eventType})`);

      await ensureAuth();
      const subsSnapshot = await getDocs(collection(db, "subscriptions"));
      const usersSnapshot = await getDocs(collection(db, "users"));
      
      const usersMap = new Map<string, any>();
      usersSnapshot.docs.forEach(doc => {
        usersMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const promises: Promise<any>[] = [];

      for (const subDoc of subsSnapshot.docs) {
        const subData = subDoc.data();
        const userId = subDoc.id;
        const user = usersMap.get(userId);

        if (!user) continue;

        const eventTypes = subData.eventTypes || [];
        const channels = subData.channels || [];

        // Check user permissions to see if they are automatically subscribed via the Permission Matrix
        const userPermissions = user.permissions || [];
        const hasPermission = userPermissions.includes(eventType) || user.role?.toLowerCase() === "admin" || userPermissions.includes("admin");

        const isSubscribedToEvent = eventTypes.includes(eventType) || hasPermission;
        const hasEmailChannel = channels.includes("EMAIL");

        if (!isSubscribedToEvent || !hasEmailChannel) {
          continue;
        }

        // Match target logic:
        // A user receives the notification if:
        // 1. It directly targets their user ID
        // 2. It directly targets their role
        // 3. OR they have the corresponding permission in the Roles/Permissions Matrix (auto-routed)
        let isTarget = false;
        if (params.targetType === TargetType.USER) {
          isTarget = userId === params.targetId;
        } else if (params.targetType === TargetType.ROLE) {
          const userRole = (user.role || "").toUpperCase();
          const targetRole = (params.targetId || "").toUpperCase();
          const equivalentBackendRoles = getEquivalentBackendRoles(user.role);
          isTarget = userRole === targetRole || equivalentBackendRoles.includes(targetRole);
        }

        if (!isTarget && hasPermission) {
          isTarget = true;
        }

        if (!isTarget) {
          continue;
        }

        const recipientEmail = user.email || "";
        if (!recipientEmail || !recipientEmail.includes("@")) {
          console.warn(`[NOTIFICATION]: Subscription email skipped for user ${userId} due to missing/invalid email address.`);
          continue;
        }

        console.log(`[NOTIFICATION]: Sending email notification to ${recipientEmail} for event ${eventType}`);
        promises.push(this.sendEmail(recipientEmail, params.title, params.message, params.link));
      }

      await Promise.all(promises);
    } catch (err: any) {
      console.error("[NOTIFICATION]: Failed to process subscriptions:", err);
    }
  }

  /**
   * Sends an email notification to user.
   */
  public static async sendEmail(to: string, title: string, message: string, link?: string) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmail = process.env.FROM_EMAIL || "noreply@brims.app";
    const appUrl = process.env.APP_URL || "https://ais-pre-wysee4ygq75kbr25ncdy7n-813258841581.asia-southeast1.run.app"; // Default URL based on environment metadata

    const linkHtml = link 
      ? `<p style="margin-top: 24px;"><a href="${appUrl}${link}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Details</a></p>`
      : "";

    const htmlContent = `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin: 0; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">BRIMS Alert</h1>
        </div>
        <h2 style="font-size: 16px; font-weight: 600; color: #1e293b; margin: 0 0 12px 0;">${title}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">${message}</p>
        ${linkHtml}
        <div style="margin-top: 36px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">This email is sent on behalf of the Batch Record Information Management System (BRIMS).</p>
          <p style="color: #94a3b8; font-size: 11px; margin: 4px 0 0 0;">Compliance ID: 21-CFR-PART-11-ALERT</p>
        </div>
      </div>
    `;

    console.log(`[EMAIL DISPATCH]: Delivering notification to ${to}. Subject: "${title}".`);

    let deliveryStatus = "SIMULATED";
    let deliveryError = "";

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort || "587"),
          secure: parseInt(smtpPort || "587") === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

        await transporter.sendMail({
          from: `"BRIMS Portal" <${fromEmail}>`,
          to,
          subject: title,
          text: message,
          html: htmlContent
        });

        console.log(`[NOTIFICATION]: Successfully sent SMTP email alert to ${to}`);
        deliveryStatus = "SENT";
      } catch (smtpErr: any) {
        console.log(`[NOTIFICATION]: SMTP dispatch attempt completed with status: FAILED for ${to}. Error message: ${smtpErr.message}. For live Gmail SMTP, please ensure a 16-character Google App Password is used with 2-Step Verification enabled.`);
        deliveryStatus = "FAILED";
        deliveryError = smtpErr.message;
      }
    } else {
      console.log(`[NOTIFICATION]: Email simulated successfully. SMTP credentials are required in configuration to deliver live internet emails.`);
    }

    // Persist to email outbox for full verification logging under all sandbox states
    try {
      await addDoc(collection(db, "email_outbox"), {
        to,
        subject: title,
        message,
        htmlContent,
        sentAt: new Date().toISOString(),
        deliveryType: (smtpHost && smtpUser) ? "SMTP" : "SIMULATION",
        status: deliveryStatus,
        error: deliveryError
      });
    } catch (dbErr) {
      console.error("[NOTIFICATION]: Failed to write log to email_outbox:", dbErr);
    }

    return { status: deliveryStatus, error: deliveryError };
  }

  /**
   * Marks a notification as read for a specific user.
   */
  static async markAsRead(notificationId: string, userId: string) {
    await ensureAuth();
    const docRef = doc(db, "notifications", notificationId);
    const notificationDoc = await getDoc(docRef);

    if (!notificationDoc.exists()) throw new Error("Notification not found");

    const data = notificationDoc.data();
    if (data?.targetType === TargetType.USER) {
      await updateDoc(docRef, { isRead: true });
    } else {
      // For role-based, we track who read it
      const readBy = data?.readBy || [];
      if (!readBy.includes(userId)) {
        await updateDoc(docRef, {
          readBy: [...readBy, userId]
        });
      }
    }
  }

  /**
   * Marks all notifications as read for a specific user.
   */
  static async markAllAsRead(userId: string, role: string) {
    await ensureAuth();
    
    // 1. Get user document to find permissions
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.exists() ? userDoc.data() : null;
    const permissions: string[] = userData?.permissions || [];
    const isAdmin = (role || "").toUpperCase() === "ADMIN" || userData?.role?.toUpperCase() === "ADMIN";

    // 2. Get user's custom event subscriptions
    const subDoc = await getDoc(doc(db, "subscriptions", userId));
    const eventSubscriptions: string[] = subDoc.exists() ? (subDoc.data()?.eventTypes || []) : [];

    // 3. Get all notifications in the last 100 documents
    // and check which ones the user is authorized to see and hasn't read yet.
    const qAll = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
    const snapshot = await getDocs(qAll);
    
    const promises: Promise<any>[] = [];

    for (const d of snapshot.docs) {
      const data = d.data();
      const nId = d.id;
      
      // Determine if user matches this notification
      let isMatched = false;

      // Match by User
      if (data.targetType === "USER" && data.targetId === userId) {
        isMatched = true;
      }
      // Match by Role
      else if (data.targetType === "ROLE" && data.targetId?.toUpperCase() === role?.toUpperCase()) {
        isMatched = true;
      }
      // Match by Event Type subscription or permission
      else if (data.eventType) {
        const hasSubscribed = eventSubscriptions.includes(data.eventType);
        const hasPermission = permissions.includes(data.eventType) || isAdmin;
        if (hasSubscribed || hasPermission) {
          isMatched = true;
        }
      }

      if (isMatched) {
        if (data.targetType === "USER") {
          if (!data.isRead) {
            promises.push(updateDoc(doc(db, "notifications", nId), { isRead: true }));
          }
        } else {
          const readBy: string[] = data.readBy || [];
          if (!readBy.includes(userId)) {
            promises.push(updateDoc(doc(db, "notifications", nId), {
              readBy: [...readBy, userId]
            }));
          }
        }
      }
    }

    await Promise.all(promises);
  }

  /**
   * Gets notifications for a user based on their UID and Role.
   */
  static async getNotificationsForUser(userId: string, role: string) {
    await ensureAuth();
    const userQ = query(
      collection(db, "notifications"),
      where("targetType", "==", TargetType.USER),
      where("targetId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const userNotifications = await getDocs(userQ);

    const roleQ = query(
      collection(db, "notifications"),
      where("targetType", "==", TargetType.ROLE),
      where("targetId", "==", role),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const roleNotifications = await getDocs(roleQ);

    const all = [
      ...userNotifications.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })),
      ...roleNotifications.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }))
    ];

    return all.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Retrieves the logged outbound emails.
   */
  static async getOutbox() {
    await ensureAuth();
    const q = query(
      collection(db, "email_outbox"),
      orderBy("sentAt", "desc"),
      limit(50)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
}
