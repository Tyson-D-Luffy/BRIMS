import { Request, Response } from "express";
import { StorageService } from "../services/storage.service.ts";

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const folder = req.body.folder || "uploads";
    const url = await StorageService.uploadFile(req.file, folder);

    res.status(200).json({
      success: true,
      data: {
        name: req.file.originalname,
        url: url,
      },
    });
  } catch (error: any) {
    console.error("Upload Controller: Error", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to upload file",
      error: error.message,
    });
  }
};
