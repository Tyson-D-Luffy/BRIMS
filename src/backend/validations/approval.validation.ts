import { z } from "zod";

export const approveSchema = z.object({
  body: z.object({
    comments: z.string().optional(),
    password: z.string().min(1, "Password confirmation is required"),
  }),
});

export const submitSchema = z.object({
  body: z.object({
    password: z.string().min(1, "Password confirmation is required"),
  }),
});

export const rejectSchema = z.object({
  body: z.object({
    comments: z.string().min(5, "Comments are required for rejection and must be at least 5 characters"),
    password: z.string().min(1, "Password confirmation is required"),
  }),
});
