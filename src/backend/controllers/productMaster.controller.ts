import { Response } from "express";
import { ProductMasterService } from "../services/productMaster.service.ts";
import { AuthRequest } from "../middleware/auth.middleware.ts";

export class ProductMasterController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.createProduct({
        ...req.body,
        branch: (req as any).selectedBranch
      }, req.user, req.metadata);
      res.status(201).json({
        success: true,
        data: product,
        message: "Product created successfully"
      });
    } catch (error: any) {
      console.error("ProductMasterController.create Error Details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error("Payload was:", req.body);
      res.status(400).json({ 
        success: false, 
        message: error.message || "Failed to create product master",
        error: error.name || "Error",
        code: error.code,
        details: error.details || [] 
      });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    try {
      const { name, status, page, limit } = req.query;
      const products = await ProductMasterService.getAllProducts({ name, status, page, limit, selectedBranch: (req as any).selectedBranch });
      res.json({
        success: true,
        data: products
      });
    } catch (error: any) {
      console.error("ProductMasterController.getAll Error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "An unexpected error occurred while fetching products" 
      });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.getProductById(req.params.id);
      if (product && (product as any).branch && (product as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      res.json({
        success: true,
        data: product
      });
    } catch (error: any) {
      res.status(404).json({ success: false, message: error.message });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const productObj = await ProductMasterService.getProductById(req.params.id);
      if (productObj && (productObj as any).branch && (productObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const product = await ProductMasterService.updateProduct(req.params.id, req.body, req.user, req.metadata);
      res.json({
        success: true,
        data: product,
        message: "Product updated successfully"
      });
    } catch (error: any) {
      console.error("ProductMasterController.update Error:", error);
      console.error("Payload was:", req.body);
      res.status(400).json({ 
        success: false, 
        message: error.message || "Failed to update product master",
        error: error.name || "Error",
        details: error.details || []
      });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const productObj = await ProductMasterService.getProductById(req.params.id);
      if (productObj && (productObj as any).branch && (productObj as any).branch !== (req as any).selectedBranch) {
        return res.status(403).json({ success: false, message: "Access denied. You are not authorized to access this branch data." });
      }
      const changeReason = req.body?.changeReason || req.query?.changeReason;
      await ProductMasterService.softDeleteProduct(req.params.id, changeReason as string, req.user, req.signatureInfo);
      res.json({
        success: true,
        message: "Product deactivated successfully"
      });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getWithMasters(req: AuthRequest, res: Response) {
    try {
      const products = await ProductMasterService.getProductMastersWithMasters((req as any).selectedBranch);
      res.json({
        success: true,
        data: products
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // WORKFLOW TRANSITION CALLS
  static async submit(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "submit", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product master submitted for review" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async startReview(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "start-review", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product master review initiated" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async review(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "review", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product master reviewed successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async approve(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "approve", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product approved successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async reject(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "reject", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product rejected successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  static async returnCorrection(req: AuthRequest, res: Response) {
    try {
      const product = await ProductMasterService.transitionWorkflow(req.params.id, "return-correction", req.body, req.user, req.signatureInfo);
      res.json({ success: true, data: product, message: "Product returned for correction successfully" });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
