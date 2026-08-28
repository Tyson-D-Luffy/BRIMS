import { z } from "zod";

export const batchIssuanceSchema = z.object({
  body: z.object({
    recordId: z.string().optional().nullable(),
    batchSheetRecordId: z.string().optional().nullable(),
    productId: z.string().optional().nullable(),
    manufacturingDate: z.string().optional().nullable(),
    batchNumberSeries: z.string().optional().nullable(),
    dropdownBatchSeries: z.string().optional().nullable(),
    singlePagesBatchNumber: z.string().optional().nullable(),
    requestType: z.string().optional().nullable(),
    reprintReason: z.string().optional().nullable(),
    comments: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ISSUED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED", "READY_FOR_PRODUCTION_HANDOVER", "PRODUCTION_IN_PROGRESS", "READY_FOR_QA_REVIEW", "HANDED_OVER"]).optional().nullable(),
    signaturePassword: z.string().optional().nullable(),
  }).passthrough().refine((data) => {
    // If both startDate and endDate are provided as valid dates, check that endDate is not strictly before startDate
    if (data.startDate && data.endDate) {
      try {
        const start = new Date(data.startDate.split('T')[0]).getTime();
        const end = new Date(data.endDate.split('T')[0]).getTime();
        if (!isNaN(start) && !isNaN(end) && end < start) {
          return false;
        }
      } catch {
        // Continue if parsing fails
      }
    }
    return true;
  }, {
    message: "Invalid dates provided. End date cannot be earlier than start date.",
    path: ["endDate"]
  }),
});

export const updateBatchStatusSchema = z.object({
  body: z.object({
    status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ISSUED", "IN_PROGRESS", "COMPLETED", "RETURNED", "CANCELLED", "READY_FOR_PRODUCTION_HANDOVER", "PRODUCTION_IN_PROGRESS", "READY_FOR_QA_REVIEW", "HANDED_OVER"]),
    changeReason: z.string().optional().nullable().transform(val => (val && val.trim().length > 0 ? val.trim() : "Batch status updated")),
    reason: z.string().optional().nullable(),
    password: z.string().optional().nullable(),
    signaturePassword: z.string().optional().nullable(),
  }).passthrough(),
});

