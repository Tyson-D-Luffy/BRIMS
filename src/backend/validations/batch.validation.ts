import { z } from "zod";

export const batchIssuanceSchema = z.object({
  body: z.object({
    recordId: z.string().min(1, "Batch sheet record ID is required"),
    manufacturingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Manufacturing date must be in YYYY-MM-DD format"),
    batchNumberSeries: z.string().optional(),
    dropdownBatchSeries: z.string().optional(),
    singlePagesBatchNumber: z.string().optional(),
    requestType: z.string().optional(),
    reprintReason: z.string().optional(),
    comments: z.string().optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
    status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ISSUED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED", "READY_FOR_PRODUCTION_HANDOVER", "PRODUCTION_IN_PROGRESS", "READY_FOR_QA_REVIEW", "HANDED_OVER"]).optional(),
    signaturePassword: z.string().min(1, "Signature password is required").optional(),
  }).refine((data) => {
    const today = new Date();
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const todayDate = new Date(todayUTC);
    // Subtract 1 day to be extremely forgiving for near boundaries
    todayDate.setUTCDate(todayDate.getUTCDate() - 1);
    
    const parseDateToUTC = (dateStr: string) => {
      const parts = dateStr.split('-').map(Number);
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    };

    const mfgDate = parseDateToUTC(data.manufacturingDate);
    const startDate = parseDateToUTC(data.startDate);
    const endDate = parseDateToUTC(data.endDate);

    // Basic validity checks
    if (mfgDate < todayDate) return false;
    if (startDate < todayDate) return false;
    if (endDate < startDate) return false;

    return true;
  }, {
    message: "Invalid dates provided. Dates cannot be in the past, and end date must be after start date.",
    path: ["manufacturingDate"]
  }),
});

export const updateBatchStatusSchema = z.object({
  body: z.object({
    status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ISSUED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED", "READY_FOR_PRODUCTION_HANDOVER", "PRODUCTION_IN_PROGRESS", "READY_FOR_QA_REVIEW", "HANDED_OVER"]),
    changeReason: z.string().min(5, "Reason for status change must be at least 5 characters"),
    password: z.string().optional(),
    signaturePassword: z.string().optional(),
  }),
});
