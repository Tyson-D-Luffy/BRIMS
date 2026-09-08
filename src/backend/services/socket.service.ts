import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { adminAuth } from "../config/firebase-admin.ts";

export class SocketService {
  private static io: SocketServer | null = null;

  static initialize(server: HttpServer) {
    this.io = new SocketServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: Token missing"));
      }

      try {
        try {
          const decodedToken = await adminAuth.verifyIdToken(token);
          socket.data.user = decodedToken;
          return next();
        } catch (adminErr) {
          const jwtSecret = process.env.JWT_SECRET || "brims-super-secret-key-123";
          const jwt = await import("jsonwebtoken");
          const decoded = jwt.default.verify(token, jwtSecret) as any;
          if (decoded && (decoded.uid || decoded.id || decoded.userId)) {
            socket.data.user = {
              uid: decoded.uid || decoded.id || decoded.userId,
              email: decoded.email || decoded.userEmail || "user@brims.internal",
              ...decoded
            };
            return next();
          }
          throw adminErr;
        }
      } catch (err) {
        next(new Error("Authentication error: Invalid token"));
      }
    });

    this.io.on("connection", (socket) => {
      const user = socket.data.user;
      console.log(`User connected: ${user.uid} (${user.email})`);

      // Join personal room for direct notifications
      socket.join(`user:${user.uid}`);

      // Join role-based rooms
      // Note: We'd ideally fetch the role from Firestore here if not in custom claims
      // For now, we'll assume the client might send it or we fetch it
      socket.on("join-role", (role: string) => {
        socket.join(`role:${role}`);
        console.log(`User ${user.uid} joined role room: ${role}`);
      });

      socket.on("disconnect", () => {
        console.log(`User disconnected: ${user.uid}`);
      });
    });

    return this.io;
  }

  static getInstance(): SocketServer {
    if (!this.io) {
      throw new Error("Socket.io not initialized");
    }
    return this.io;
  }

  /**
   * Send a real-time notification to a specific user
   */
  static notifyUser(userId: string, notification: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit("notification", notification);
    }
  }

  /**
   * Send a real-time notification to all users with a specific role
   */
  static notifyRole(role: string, notification: any) {
    if (this.io) {
      this.io.to(`role:${role}`).emit("notification", notification);
    }
  }

  /**
   * Broadcast to all connected users
   */
  static broadcast(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}
