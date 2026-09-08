import { z } from "zod";
import { changeReasonSchema } from "./common.validation.ts";

export const approveSchema = z.object({
  body: z.object({
    comments: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional(),
    reason: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
  }).passthrough(),
});

export const reviewSchema = z.object({
  body: z.object({
    comments: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional(),
    reason: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
  }).passthrough(),
});

export const submitSchema = z.object({
  body: z.object({
    password: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional(),
  }).passthrough(),
});

export const rejectSchema = z.object({
  body: z.object({
    comments: z.string().optional().nullable().transform(val => (val && val.trim().length > 0 ? val.trim() : "Rejected")),
    reason: z.string().optional().nullable(),
    changeReason: changeReasonSchema.optional(),
    password: z.string().optional().nullable(),
  }).passthrough(),
});

