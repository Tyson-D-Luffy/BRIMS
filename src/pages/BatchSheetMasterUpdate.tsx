import React, { useState, useEffect } from 'react';
import { 
  FileEdit, 
  Plus, 
  Search, 
  Package, 
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import api from '../services/api';
import { ProductMaster } from '../types';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const searchSchema = z.object({
  productId: z.string().min(1, 'Product selection is required'),
  stage: z.string().min(1, 'Stage is required'),
  type: z.string().min(1, 'Type is required'),
  documentNumber: z.string().min(1, 'Document number is required'),
});

type SearchFormValues = z.infer<typeof searchSchema>;

export default function BatchSheetMasterUpdate() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Derived options based on selected product
  const [availableStages, setAvailableStages] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [stageMasters, setStageMasters] = useState<any[]>([]);
  const [processMasters, setProcessMasters] = useState<any[]>([]);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      productId: '',
      stage: '',
      type: '',
      documentNumber: '',
    },
  });

  const selectedProductId = form.watch('productId');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const [prodResponse, stageResponse] = await Promise.all([
          api.get('/product-masters?status=active'),
          api.get('/batch-number-engine/masters')
        ]);
        if (prodResponse.data.success) {
          setProducts(prodResponse.data.data);
        }
        if (stageResponse.data.success) {
          setStageMasters(stageResponse.data.data.filter((m: any) => m.type === 'stage' && m.status === 'ACTIVE'));
          setProcessMasters(stageResponse.data.data.filter((m: any) => m.type === 'process' && m.status === 'ACTIVE'));
        }
      } catch (error) {
        console.error('Failed to fetch products or stages', error);
        toast.error('Failed to load products or stages');
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        // Filter active Stage Masters for this product (match by ID, title or name)
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
        
        // Reset dependent fields
        form.setValue('stage', '');
        form.setValue('type', '');
      }
    } else {
      setAvailableStages([]);
      setAvailableTypes([]);
    }
  }, [selectedProductId, products, stageMasters, processMasters, form]);

  const getProcessLabel = (code: string) => {
    const pm = processMasters.find(p => p.code === code);
    return pm && pm.name ? `${pm.code} - ${pm.name}` : code;
  };

  const onSubmit = async (values: SearchFormValues) => {
    setSubmitting(true);
    try {
      const response = await api.get('/batch-sheet-masters', { 
        params: { 
          productId: values.productId,
          stage: values.stage,
          type: values.type,
          documentNumber: values.documentNumber
        } 
      });

      if (response.data.success && response.data.data.length > 0) {
        const master = response.data.data[0];
        toast.success('Batch Sheet Master found. Redirecting to edit...');
        navigate(`/batch-sheet-masters/${master.id}/edit`);
      } else {
        toast.error('No matching Batch Sheet Master found with these specifications.');
      }
    } catch (error: any) {
      console.error('Search failed', error);
      toast.error('Search failed: ' + (error.response?.data?.message || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm tracking-wider uppercase mb-1">
            <FileEdit className="w-4 h-4" />
            Document Control
          </div>
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Batch Sheet Master Update
          </h1>
          <p className="text-slate-500 text-lg">
            Manage and update the master manufacturing protocols and document references.
          </p>
        </div>
        
        <Button 
          onClick={() => setIsFormOpen(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-8 h-12 rounded-full shadow-xl shadow-slate-200 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4 mr-2" />
          Update Sheet
        </Button>
      </header>

      {/* Main Content Area - Placeholder or list of existing sheets if needed, 
          but request specifically asked for the button/form flow. */}
      <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-slate-50/50">
        <CardContent className="p-12 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
            <Package className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Manage Master Protocols</h3>
          <p className="text-slate-500 max-w-md">
            Click the 'Update Sheet' button to modify master batch sheet metadata or document numbers for approved products.
          </p>
        </CardContent>
      </Card>

      {/* Update Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Update Sheet Metadata</DialogTitle>
            <DialogDescription>
              Modify the master record parameters for the selected pharmaceutical product.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none transition-all focus:ring-2 focus:ring-indigo-500">
                          <SelectValue placeholder="Select from Product Masters">
                            {field.value ? (products.find(p => p.id === field.value)?.title || field.value) : undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl border-none shadow-2xl">
                        {loadingProducts ? (
                          <div className="p-4 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                          </div>
                        ) : products.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stage *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedProductId}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none transition-all focus:ring-2 focus:ring-indigo-500">
                            <SelectValue placeholder="Select Stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
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
                      <FormLabel>Process *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!selectedProductId}>
                        <FormControl>
                          <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none transition-all focus:ring-2 focus:ring-indigo-500">
                            <SelectValue placeholder="Select Process" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-xl border-none shadow-2xl">
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
              </div>

              <FormField
                control={form.control}
                name="documentNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Number *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g. MBR/PN/001" 
                        {...field} 
                        className="h-12 rounded-xl bg-slate-50 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-4">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 h-12 shadow-lg shadow-indigo-100"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    'Update Protocol'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
