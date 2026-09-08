import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import logger from "../config/logger.ts";

// Rate limiting to prevent brute-force and DoS
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased for development/preview reliability
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  validate: { xForwardedForHeader: false }, // Suppress warning as we use app.set('trust proxy')
});

// Strict CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours
};

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    frameguard: false,
  }),
  cors(corsOptions),
];

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Skip logging for static assets and Vite internal requests
  const isStaticAsset = /\.(js|ts|tsx|css|png|jpg|jpeg|svg|ico|json|woff|woff2)$/.test(req.url);
  const isViteRequest = req.url.includes("@vite") || req.url.includes("@fs");

  if (!isStaticAsset && !isViteRequest) {
    logger.info(`${req.method} ${req.url}`, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });
  }
  next();
};

// XSS Protection (Basic)
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    // In a real app, use a library like 'xss' or 'dompurify'
    // This is a placeholder for the concept
    next();
  } else {
    next();
  }
};
