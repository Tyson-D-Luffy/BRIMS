import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.ts";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const isOperational = err instanceof AppError && err.statusCode < 500;

  if (isOperational) {
    console.warn(`[API WARN] ${req.method} ${req.path} - Status ${err.statusCode}: ${err.message}`);
  } else {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      status: "error",
      message: err.message,
    });
  }

  // Handle unexpected errors
  return res.status(500).json({
    success: false,
    status: "error",
    message: err.message || "Something went wrong on our end. Please try again later.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
