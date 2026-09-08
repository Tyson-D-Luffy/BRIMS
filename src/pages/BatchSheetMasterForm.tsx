import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Save, 
  ArrowLeft, 
  Package,
  FileText,
  Settings2,
  Lock,
  AlertCircle,
  Upload,
  FileIcon,
  X,
  CheckCircle2,
  CheckSquare,
  AlertTriangle
} from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '../lib/utils';
import { ProductMaster } from '../types';

const masterSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  productId: z.string().min(1, 'Product selection is required'),
  stage: z.string().min(1, 'Stage is required'),
  type: z.string().min(1, 'Type is required'),
  batchNumberSeries: z.string().min(1, 'Batch number series is required'),
  documentNumber: z.string().min(1, 'Document number is required'),
  version: z.string().min(1, 'Version is required'),
});

type MasterFormValues = z.infer<typeof masterSchema>;

export default function BatchSheetMasterForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [currentMaster, setCurrentMaster] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [availableStages, setAvailableStages] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [stageMasters, setStageMasters] = useState<any[]>([]);
  const [processMasters, setProcessMasters] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{ name: string; url: string }[]>([]);
  const [batchRecords, setBatchRecords] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const form = useForm<MasterFormValues>({
    resolver: zodResolver(masterSchema),
    defaultValues: {
      title: '',
      productId: '',
      stage: '',
      type: '',
      batchNumberSeries: '',
      documentNumber: '',
      version: '1.0',
    },
  });

  const selectedProductId = form.watch('productId');
  const selectedStage = form.watch('stage');
  const selectedType = form.watch('type');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await api.get('/product-masters?status=active');
        if (response.data.success) {
          setProducts(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch products', error);
      }
    };

    const fetchMaster = async () => {
      if (!id) return;
      setLoading(true);
      setIsEdit(true);
      try {
        const response = await api.get(`/batch-sheet-masters/${id}`);
        if (response.data.success) {
          const master = response.data.data;
          setCurrentMaster(master);
          
          if ((master.isLocked && !['UNDER_UPDATE', 'DRAFT', 'REJECTED', 'RETURNED'].includes(master.status)) || master.status === 'APPROVED' || master.status === 'RETIRED' || master.status === 'UNDER_REVIEW' || master.status === 'PENDING_APPROVAL') {
            setIsLocked(true);
            setLockReason(
              master.status === 'APPROVED' ? "APPROVED" :
              master.status === 'RETIRED' ? "RETIRED" :
              master.status === 'UNDER_REVIEW' ? "UNDER_REVIEW" :
              master.status === 'PENDING_APPROVAL' ? "PENDING_APPROVAL" : "LOCKED"
            );
          } else {
            setIsLocked(false);
          }

          form.reset({
            title: master.masterName || master.title || '',
            productId: master.productId,
            stage: master.stage || '',
            type: master.type || '',
            batchNumberSeries: master.batchNumberSeries || '',
            documentNumber: master.documentNumber || '',
            version: master.version || '1.0',
          });

          if (master.files) {
            setExistingFiles(master.files);
          }
        }
      } catch (error) {
        console.error('Failed to fetch master', error);
        toast.error('Failed to load master');
        navigate('/batch-sheet-masters');
      } finally {
        setLoading(false);
      }
    };

    const fetchStageMasters = async () => {
      try {
        const response = await api.get('/batch-number-engine/masters');
        if (response.data.success) {
          setStageMasters(response.data.data.filter((m: any) => m.type === 'stage' && m.status === 'ACTIVE'));
          setProcessMasters(response.data.data.filter((m: any) => m.type === 'process' && m.status === 'ACTIVE'));
        }
      } catch (error) {
        console.error('Failed to fetch stage masters', error);
      }
    };

    const fetchBatchRecords = async () => {
      try {
        const response = await api.get('/batch-number-engine/records');
        if (response.data.success) {
          // get all records that are APPROVED
          setBatchRecords(response.data.data.filter((r: any) => r.status === 'APPROVED'));
        }
      } catch (error) {
        console.error('Failed to fetch batch records', error);
      }
    };

    fetchProducts();
    fetchStageMasters();
    fetchBatchRecords();
    fetchMaster();
  }, [id, form, navigate]);

  // Handle field updates
  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        // Filter from stageMasters containing active stages specifically for this product (match by ID, title or name)
        const productStages = stageMasters
          .filter((m: any) => 
            m.productId === selectedProductId || 
            (product.title && m.productId === product.title) ||
            (product.title && m.productName === product.title) ||
            (product.title && m.product === product.title)
          )
          .map((m: any) => m.code);

        // Combine findings from stage masters and product.stage split to display all unique active stages under this product name
        const productStringStages = product.stage
          ? product.stage.split(',').map(s => s.trim()).filter(Boolean)
          : [];

        const stages = Array.from(new Set([...productStages, ...productStringStages]))
          .filter(Boolean);

        // Filter from processMasters containing active processes
        const masterTypes = processMasters.map((m: any) => m.code);
        const types = masterTypes.length > 0
          ? masterTypes
          : product.type.split(',').map(t => t.trim()).filter(Boolean);

        setAvailableStages(stages);
        setAvailableTypes(types);
      }
    } else {
      setAvailableStages([]);
      setAvailableTypes([]);
    }
  }, [selectedProductId, products, stageMasters, processMasters]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      if (files.length === 0) {
        toast.error('Only PDF files are allowed.');
        return;
      }
      if (files.length > 1) {
        toast.warning('Only one PDF file can be uploaded at a time. Selecting the first file.');
      }
      setSelectedFiles([files[0]]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
      if (files.length === 0) {
        toast.error('Only PDF files are allowed.');
        return;
      }
      if (files.length > 1) {
        toast.warning('Only one PDF file can be uploaded at a time. Selecting the first file.');
      }
      setSelectedFiles([files[0]]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getProcessLabel = (code: string) => {
    const pm = processMasters.find(p => p.code === code);
    return pm && pm.name ? `${pm.code} - ${pm.name}` : code;
  };

  const onSubmit = async (values: MasterFormValues) => {
    setLoading(true);
    const uploadToastId = selectedFiles.length > 0 ? toast.loading(`Uploading ${selectedFiles.length} file(s)...`) : null;
    
    try {
      const newFilesData = [];
      
      // Upload new files through server-side proxy to bypass CORS/retry issues
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            console.log(`Starting server-side upload for: ${file.name} (${file.size} bytes)`);
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'batch_sheet_masters');

            const uploadResponse = await api.post('/uploads', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const progress = (progressEvent.loaded / progressEvent.total) * 100;
                  console.log(`Upload for ${file.name} is ${progress.toFixed(1)}% done`);
                }
              }
            });

            if (uploadResponse.data.success) {
              console.log(`Upload complete for: ${file.name}, URL: ${uploadResponse.data.data.url}`);
              newFilesData.push({
                name: uploadResponse.data.data.name,
                url: uploadResponse.data.data.url
              });
            }
          } catch (uploadError: any) {
            console.error(`Failed to upload file: ${file.name}`, uploadError);
            const errorMsg = uploadError.response?.data?.message || `Failed to upload ${file.name}.`;
            toast.error(errorMsg);
            throw uploadError;
          }
        }
      }

      if (uploadToastId) {
        toast.dismiss(uploadToastId);
      }

      const payload: any = {
        ...values,
        masterName: values.title,
        files: [...existingFiles, ...newFilesData]
      };

      // Preserve existing steps if we have them and it's an edit
      if (isEdit && currentMaster) {
        payload.steps_json = currentMaster.steps_json || [];
      } else {
        payload.steps_json = [];
      }

      console.log('Sending payload to server:', payload);

      if (isEdit) {
        await api.put(`/batch-sheet-masters/${id}`, {
          ...payload,
          changeReason: 'Updated batch sheet master info'
        });
        toast.success('Master Batch Sheet updated successfully');
      } else {
        await api.post('/batch-sheet-masters', payload);
        toast.success('Batch Sheet Master created successfully');
      }
      navigate('/batch-sheet-masters');
    } catch (error: any) {
      console.error('Failed to save master', error);
      if (uploadToastId) toast.dismiss(uploadToastId);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to save master. Please check your connection.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading && isEdit) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/batch-sheet-masters')}
            className="rounded-full hover:bg-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {isEdit ? 'Update Master Batch Sheet' : 'Create New Batch Sheet Master'}
            </h1>
            <p className="text-slate-500">Enter Batch Sheet information.</p>
          </div>
        </div>
        <Button 
          onClick={form.handleSubmit(onSubmit)} 
          disabled={loading || isLocked}
          className={cn(
            "px-8 h-12 rounded-full shadow-lg transition-all",
            isLocked 
              ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none" 
              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
          )}
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
          ) : isLocked ? (
            <Lock className="w-4 h-4 mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isLocked ? 'Locked' : (isEdit ? 'Update Master Batch Sheet' : 'Save Master Sheet')}
        </Button>
      </div>

      {isLocked && (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            This master is <strong>LOCKED</strong> and cannot be modified. To make changes, please return to the details page and <strong>Request an Update</strong>.
          </p>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
          {/* Batch Sheet Info */}
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 px-8 py-6">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-600" />
                Batch Sheet Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Product *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''} disabled={isLocked}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-slate-400" />
                              <SelectValue placeholder="Select a product">
                                {field.value ? (products.find(p => p.id === field.value)?.title || field.value) : undefined}
                              </SelectValue>
                            </div>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {products.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Stage *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''} disabled={isLocked || !selectedProductId}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {availableStages.map(stage => (
                            <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                          ))}
                          {availableStages.length === 0 && selectedProductId && (
                            <div className="p-2 text-xs text-slate-400 italic">No stages defined</div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Process *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''} disabled={isLocked || !selectedProductId}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70">
                            <SelectValue placeholder="Select Process" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl">
                          {availableTypes.map(type => (
                            <SelectItem key={type} value={type}>{getProcessLabel(type)}</SelectItem>
                          ))}
                          {availableTypes.length === 0 && selectedProductId && (
                            <div className="p-2 text-xs text-slate-400 italic">No processes defined</div>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="batchNumberSeries"
                  render={({ field }) => {
                    const watchedVal = form.watch('batchNumberSeries') || '';
                    const selectedProdId = form.watch('productId');
                    const selectedType = form.watch('type');
                    const selectedProd = products.find(p => p.id === selectedProdId);

                    // Filter records from Batch Number Engine matching this product & process
                    const matchingBatchNumbers = batchRecords.filter((rec: any) => {
                      const matchesProd = selectedProd && (
                        rec.product === selectedProd.title ||
                        rec.product === selectedProd.id
                      );
                      const matchesProcess = !selectedType || rec.category === selectedType;
                      return matchesProd && matchesProcess;
                    });

                    return (
                      <FormItem className="space-y-3">
                        <div className="flex items-center justify-between">
                          <FormLabel className="text-slate-600 font-semibold">Batch Number Series *</FormLabel>
                          {selectedProd && (
                            <button
                              type="button"
                              onClick={() => navigate('/batch-number-generator-engine')}
                              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/75 px-2.5 py-1 rounded-full transition-all flex items-center gap-1 border border-indigo-100/40"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              Active Batch Numbers Table &rarr;
                            </button>
                          )}
                        </div>

                        <FormControl>
                          <Select onValueChange={field.onChange} value={field.value || ''} disabled={isLocked || !selectedProdId || !selectedType}>
                            <FormControl>
                              <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-70">
                                <div className="flex items-center gap-2">
                                  <Settings2 className="w-4 h-4 text-indigo-500/80 animate-[spin_10s_linear_infinite]" />
                                  <SelectValue placeholder={!selectedType ? "Please select Process first" : "Select active batch number from Engine"} />
                                </div>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-xl max-h-[300px]">
                              {matchingBatchNumbers.length > 0 ? (
                                <>
                                  <div className="px-3 py-1.5 text-[10px] font-extrabold text-emerald-600 bg-emerald-50/50 border-y border-emerald-100/40 font-semibold tracking-wider uppercase my-1 font-sans">
                                    Active Approved Batch Numbers ({matchingBatchNumbers.length})
                                  </div>
                                  {matchingBatchNumbers.map((rec: any) => (
                                    <SelectItem key={rec.id} value={rec.batchNumber}>
                                      <div className="flex flex-col text-left py-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-mono text-sm font-extrabold text-slate-900 tracking-wider">
                                            {rec.batchNumber}
                                          </span>
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-semibold tracking-wide mt-0.5">Approved Active batch from Engine</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </>
                              ) : (
                                <div className="p-3 text-center text-xs text-slate-400 italic">
                                  No approved active batch numbers found for this product and process.
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </FormControl>

                        {watchedVal && (
                          <div className="mt-2.5 flex flex-col gap-1.5 msg-batch-validation text-left">
                            {matchingBatchNumbers.some((r: any) => r.batchNumber === watchedVal) && (
                              <div className="flex items-start gap-2 text-xs text-emerald-800 font-semibold bg-emerald-50/60 px-3.5 py-2.5 rounded-xl border border-emerald-100 animate-in fade-in duration-200">
                                <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                <div className="flex-1 space-y-0.5">
                                  <span>Linked to Active Batch Number Engine Record</span>
                                  <p className="text-[10px] text-slate-500 font-normal">
                                    Fully synchronized with the Active Batch Number generated on the dashboard.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <FormDescription>Select from the list of active batch numbers in the Batch Number Engine.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Title *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. Batch Sheet Master Rev A" 
                          {...field} 
                          disabled={isLocked}
                          className="h-12 rounded-xl bg-slate-50 border-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-70" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Document Number *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. DOC-MBR-001" 
                          {...field} 
                          disabled={isLocked}
                          className="h-12 rounded-xl bg-slate-50 border-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-70" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-600">Version *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="1.0" 
                          {...field} 
                          disabled={isLocked}
                          className="h-12 rounded-xl bg-slate-50 border-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-70" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Upload Section */}
              <div className="space-y-4">
                <FormLabel className="text-slate-600">Upload Batch Sheets (PDF)</FormLabel>
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-3xl p-8 transition-all relative group cursor-pointer",
                    isDragging 
                      ? "border-indigo-500 bg-indigo-50/70 scale-[1.01] shadow-md shadow-indigo-100" 
                      : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50"
                  )}
                  onClick={() => document.getElementById('file-upload')?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input 
                    id="file-upload"
                    type="file" 
                    accept="application/pdf" 
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                  <div className="flex flex-col items-center justify-center text-center font-sans">
                    <div className={cn(
                      "w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300",
                      isDragging 
                        ? "bg-indigo-600 text-white scale-110" 
                        : "bg-indigo-50 text-indigo-600 group-hover:scale-110"
                    )}>
                      <Upload className="w-8 h-8 animate-bounce" />
                    </div>
                    <p className="text-slate-900 font-bold">
                      {isDragging ? "Drop your PDF file here" : "Drag & drop a PDF file here, or click to select"}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      Only one PDF file can be uploaded at a time.
                    </p>
                  </div>
                </div>

                <AnimatePresence mode="popLayout">
                  {(existingFiles.length > 0 || selectedFiles.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      {/* Existing Files */}
                      {existingFiles.map((file, index) => (
                        <motion.div
                          key={`existing-${file.name}-${index}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-3 p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100 shadow-sm group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <FileIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                            <p className="text-xs text-indigo-500 font-medium">Already Uploaded</p>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeExistingFile(index); }}
                            className="p-2 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))}

                      {/* New Files */}
                      {selectedFiles.map((file, index) => (
                        <motion.div
                          key={`new-${file.name}-${index}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                            <FileIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{file.name}</p>
                            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                            className="p-2 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
