import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  Package, 
  Layers, 
  FileText, 
  Eye, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Plus,
  Settings2,
  CheckSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import api from '../services/api';
import { ProductMaster, BatchSheetMaster, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { SignatureDialog } from '../components/SignatureDialog';
import { cn } from '../lib/utils';
import { LoadingPage } from '../components/LoadingSpinner';
import { generateRequestPreviewPDF, formatRequestId } from '../lib/pdf-generator';
import { SecurePDFViewer } from '../components/SecurePDFViewer';
import { PDFDocument } from 'pdf-lib';

const parseSeries = (series: string) => {
  const parts = (series || '').split(',').map(p => p.trim()).filter(Boolean);
  const batchNumbers: string[] = [];
  const loosePages: string[] = [];
  
  parts.forEach(part => {
    // Check if it's a range like "26001-26005" or "001-003"
    if (/^\d+-\d+$/.test(part)) {
      const rangeParts = part.split('-');
      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        // Is it a page range (both are <= 3 digits) or a batch range?
        const isPageRange = rangeParts[0].length <= 3 && rangeParts[1].length <= 3;
        if (isPageRange) {
          for (let i = start; i <= end; i++) {
            const padLen = Math.max(rangeParts[0].length, rangeParts[1].length);
            loosePages.push(String(i).padStart(padLen, '0'));
          }
        } else {
          for (let i = start; i <= end; i++) {
            batchNumbers.push(String(i));
          }
        }
      }
    } else if (/^\d+$/.test(part)) {
      if (part.length <= 3) {
        loosePages.push(part);
      } else {
        batchNumbers.push(part);
      }
    }
  });
  
  return { batchNumbers, loosePages };
};

export default function BatchSheetRequestForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [requestType, setRequestType] = useState<'NEW' | 'REPRINT'>('NEW');
  const [products, setProducts] = useState<ProductMaster[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dropdownBatchSeries, setDropdownBatchSeries] = useState('');
  const [batchNumberSheets, setBatchNumberSheets] = useState('');
  const [singlePagesBatchNumber, setSinglePagesBatchNumber] = useState('');
  const [singlePages, setSinglePages] = useState('');
  const batchNumberSeries = useMemo(() => {
    return [batchNumberSheets, singlePages].filter(Boolean).join(',');
  }, [batchNumberSheets, singlePages]);
  const [batchRecords, setBatchRecords] = useState<any[]>([]);
  // Helper to get local date-time string compatible with datetime-local input "YYYY-MM-DDTHH:MM"
  const getLocalDateTimeString = () => {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const [requestDateTime, setRequestDateTime] = useState(getLocalDateTimeString());
  
  // Computed values to keep compatibility with backend expectance of startDate and endDate (YYYY-MM-DD)
  const startDate = requestDateTime.split('T')[0];
  const endDate = requestDateTime.split('T')[0];
  const [reprintReason, setReprintReason] = useState('');
  const [comments, setComments] = useState('');
  
  const [availableStages, setAvailableStages] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [stageMasters, setStageMasters] = useState<any[]>([]);
  const [processMasters, setProcessMasters] = useState<any[]>([]);
  const [identifiedMasters, setIdentifiedMasters] = useState<BatchSheetMaster[]>([]);
  const [identifiedMaster, setIdentifiedMaster] = useState<BatchSheetMaster | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [isSignDialogOpen, setIsSignDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [existingBatches, setExistingBatches] = useState<any[]>([]);
  const [templatePageCount, setTemplatePageCount] = useState<number>(6); // Default fallback page count

  useEffect(() => {
    const getPageCount = async () => {
      if (identifiedMaster?.files?.[0]?.url) {
        try {
          const fileUrl = identifiedMaster.files[0].url;
          let existingPdfBytes: ArrayBuffer;
          if (fileUrl.startsWith('/api/') || fileUrl.startsWith('api/')) {
            let requestUrl = fileUrl;
            if (fileUrl.startsWith('/api/')) {
              requestUrl = fileUrl.substring('/api'.length);
            }
            const response = await api.get(requestUrl, { responseType: 'arraybuffer' });
            existingPdfBytes = response.data;
          } else {
            const response = await fetch(fileUrl);
            existingPdfBytes = await response.arrayBuffer();
          }
          const pdfDoc = await PDFDocument.load(existingPdfBytes);
          const pages = pdfDoc.getPages();
          if (pages.length > 0) {
            setTemplatePageCount(pages.length);
            console.log(`Loaded template page count: ${pages.length}`);
          }
        } catch (e) {
          console.error("Failed to load PDF page count, using default of 6", e);
          setTemplatePageCount(6);
        }
      } else if (identifiedMaster) {
        setTemplatePageCount(6);
      }
    };
    getPageCount();
  }, [identifiedMaster]);

  useEffect(() => {
    const fetchExistingBatches = async () => {
      if (selectedProduct) {
        try {
          const res = await api.get('/batches', {
            params: { productId: selectedProduct, limit: 100 }
          });
          if (res.data.success) {
            setExistingBatches(res.data.data || []);
          }
        } catch (error) {
          console.error('Failed to fetch existing batches', error);
        }
      } else {
        setExistingBatches([]);
      }
    };
    fetchExistingBatches();
  }, [selectedProduct]);

  const checkIsRepeated = useCallback((series: string) => {
    const trimmed = series.trim();
    if (!trimmed) return false;
    if (!selectedProduct || !selectedStage || !selectedType) return false;

    const parsed = parseSeries(trimmed);
    const activeBatches = existingBatches.filter((b: any) => {
      if (b.status === 'REJECTED') return false;

      // Filter by Product ID
      const bProductId = b.productId || b.recordInfo?.masterSnapshot?.productId;
      if (bProductId && bProductId !== selectedProduct) return false;

      // Filter by Stage
      const bStage = b.recordInfo?.masterSnapshot?.stage;
      if (bStage && bStage !== selectedStage) return false;

      // Filter by Process (Type)
      const bType = b.recordInfo?.masterSnapshot?.type;
      if (bType && bType !== selectedType) return false;

      return true;
    });

    // 1. Check if any of the parsed batch numbers are repeated
    const previouslyPrintedBatches = new Set<string>();
    activeBatches.forEach(b => {
      const bSeries = b.batchNumberSeries || b.batchNumber || '';
      const bParsed = parseSeries(bSeries);
      bParsed.batchNumbers.forEach(bn => previouslyPrintedBatches.add(bn));
    });

    const hasRepeatedBatch = parsed.batchNumbers.some(bn => previouslyPrintedBatches.has(bn));
    if (hasRepeatedBatch) return true;

    // 2. Check if any of the parsed loose pages are repeated
    const previouslyPrintedPages = new Set<string>();
    activeBatches.forEach(b => {
      const bSeries = b.batchNumberSeries || b.batchNumber || '';
      const bParsed = parseSeries(bSeries);
      if (bParsed.batchNumbers.length > 0) {
        // A complete batch was printed, so all pages 1 to templatePageCount are printed!
        for (let i = 1; i <= templatePageCount; i++) {
          previouslyPrintedPages.add(String(i).padStart(3, '0'));
          previouslyPrintedPages.add(String(i));
        }
      }
      bParsed.loosePages.forEach(lp => {
        previouslyPrintedPages.add(lp);
        previouslyPrintedPages.add(String(parseInt(lp, 10)).padStart(3, '0'));
      });
    });

    const hasRepeatedPage = parsed.loosePages.some(lp => {
      const padded = lp.padStart(3, '0');
      const unpadded = String(parseInt(lp, 10));
      return previouslyPrintedPages.has(lp) || previouslyPrintedPages.has(padded) || previouslyPrintedPages.has(unpadded);
    });

    return hasRepeatedPage;
  }, [existingBatches, templatePageCount, selectedProduct, selectedStage, selectedType]);

  const isBatchNumberPreviouslyRequested = useCallback((targetBatchNum: string) => {
    const trimmed = (targetBatchNum || '').trim();
    if (!trimmed) return false;
    if (!selectedProduct || !selectedStage || !selectedType) return false;

    const activeBatches = existingBatches.filter((b: any) => {
      if (b.status === 'REJECTED') return false;

      const bProductId = b.productId || b.recordInfo?.masterSnapshot?.productId;
      if (bProductId && bProductId !== selectedProduct) return false;

      const bStage = b.recordInfo?.masterSnapshot?.stage;
      if (bStage && bStage !== selectedStage) return false;

      const bType = b.recordInfo?.masterSnapshot?.type;
      if (bType && bType !== selectedType) return false;

      return true;
    });

    const targetInt = parseInt(trimmed, 10);

    for (const b of activeBatches) {
      const bSeries = b.batchNumberSeries || b.batchNumber || '';
      const parts = bSeries.split(',').map((p: string) => p.trim()).filter(Boolean);

      for (const part of parts) {
        if (part === trimmed) return true;

        if (/^\d+-\d+$/.test(part)) {
          const [sStr, eStr] = part.split('-');
          const start = parseInt(sStr, 10);
          const end = parseInt(eStr, 10);
          if (!isNaN(start) && !isNaN(end) && !isNaN(targetInt)) {
            if (targetInt >= start && targetInt <= end) {
              return true;
            }
          }
        }
      }

      if (b.singlePagesBatchNumber && b.singlePagesBatchNumber.trim() === trimmed) {
        return true;
      }
    }

    return false;
  }, [existingBatches, selectedProduct, selectedStage, selectedType]);

  useEffect(() => {
    let isRepeated = false;

    if (batchNumberSheets.trim()) {
      if (checkIsRepeated(batchNumberSheets)) {
        isRepeated = true;
      }
    }

    if (singlePages.trim()) {
      if (singlePagesBatchNumber.trim()) {
        if (isBatchNumberPreviouslyRequested(singlePagesBatchNumber)) {
          isRepeated = true;
        }
      } else {
        if (checkIsRepeated(singlePages)) {
          isRepeated = true;
        }
      }
    }

    if (isRepeated) {
      setRequestType('REPRINT');
    } else {
      setRequestType('NEW');
    }
  }, [batchNumberSheets, singlePages, singlePagesBatchNumber, checkIsRepeated, isBatchNumberPreviouslyRequested]);

  const isSinglePageOnly = (b: any) => {
    if (!b) return false;
    const seriesStr = b.batchNumberSeries || b.batchNumber || '';
    if (!seriesStr) return false;

    const parsed = parseSeries(seriesStr);
    // If only loose pages are requested (e.g. '001', '002', '001-003')
    if (parsed.loosePages.length > 0 && parsed.batchNumbers.length === 0) {
      return true;
    }
    // If total count of batch numbers + loose pages is <= 1 (single page/sheet)
    if (parsed.batchNumbers.length + parsed.loosePages.length <= 1) {
      return true;
    }
    return false;
  };

  const lastRequestedBatch = useMemo(() => {
    if (!selectedProduct || !selectedStage || !selectedType) {
      return null;
    }

    const matches = existingBatches.filter((b: any) => {
      if (b.status === 'REJECTED') return false;

      const bProductId = b.productId || b.recordInfo?.masterSnapshot?.productId;
      if (bProductId && bProductId !== selectedProduct) return false;

      const bStage = b.recordInfo?.masterSnapshot?.stage;
      if (bStage && bStage !== selectedStage) return false;

      const bType = b.recordInfo?.masterSnapshot?.type;
      if (bType && bType !== selectedType) return false;

      if (dropdownBatchSeries) {
        const bSeries = b.dropdownBatchSeries || b.recordInfo?.masterSnapshot?.batchNumberSeries;
        if (bSeries && bSeries !== dropdownBatchSeries) return false;
      }

      return true;
    });

    const getBestBatch = (list: any[]) => {
      if (list.length === 0) return null;
      const sorted = [...list].sort((a: any, b: any) => {
        const timeA = new Date(a.createdAt || a.issuedAt || a.startDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.issuedAt || b.startDate || 0).getTime();
        return timeB - timeA;
      });

      const latest = sorted[0];
      if (!isSinglePageOnly(latest)) {
        return latest;
      }

      // If the latest request is Single pages only, look for the previous request that is NOT single page only
      const previousMultiPage = sorted.find((b, idx) => idx > 0 && !isSinglePageOnly(b));
      if (previousMultiPage) {
        return previousMultiPage;
      }

      // If all previous requests are single page, fallback to the previous request (sorted[1]) or latest
      return sorted[1] || sorted[0];
    };

    if (matches.length > 0) {
      return getBestBatch(matches);
    }

    // Fallback match if dropdownBatchSeries was not stored on record
    const fallbackMatches = existingBatches.filter((b: any) => {
      if (b.status === 'REJECTED') return false;

      const bProductId = b.productId || b.recordInfo?.masterSnapshot?.productId;
      if (bProductId && bProductId !== selectedProduct) return false;

      const bStage = b.recordInfo?.masterSnapshot?.stage;
      if (bStage && bStage !== selectedStage) return false;

      const bType = b.recordInfo?.masterSnapshot?.type;
      if (bType && bType !== selectedType) return false;

      return true;
    });

    if (fallbackMatches.length > 0) {
      return getBestBatch(fallbackMatches);
    }

    return null;
  }, [existingBatches, selectedProduct, selectedStage, selectedType, dropdownBatchSeries]);

  const lastRequestedSheetsMsg = useMemo(() => {
    if (!lastRequestedBatch) {
      return "None (No previous sheets requested)";
    }
    return lastRequestedBatch.batchNumberSeries || lastRequestedBatch.batchNumber || "None";
  }, [lastRequestedBatch]);

  useEffect(() => {
    const fetchProductsAndStages = async () => {
      try {
        const [prodResponse, stageResponse, recordsResponse] = await Promise.all([
          api.get('/product-masters?status=active'),
          api.get('/batch-number-engine/masters'),
          api.get('/batch-number-engine/records')
        ]);
        if (prodResponse.data.success) {
          setProducts(prodResponse.data.data);
        }
        if (stageResponse.data.success) {
          setStageMasters(stageResponse.data.data.filter((m: any) => m.type === 'stage' && m.status === 'ACTIVE'));
          setProcessMasters(stageResponse.data.data.filter((m: any) => m.type === 'process' && m.status === 'ACTIVE'));
        }
        if (recordsResponse.data.success) {
          setBatchRecords(recordsResponse.data.data.filter((r: any) => r.status === 'APPROVED'));
        }
      } catch (error) {
        console.error('Failed to fetch products or stages', error);
        toast.error('Failed to load products or stages');
      } finally {
        setLoading(false);
      }
    };
    fetchProductsAndStages();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      const product = products.find(p => p.id === selectedProduct);
      if (product) {
        // filter from stageMasters that have m.productId === selectedProduct or matching product title / product name
        const productStages = stageMasters
          .filter((m: any) => 
            m.productId === selectedProduct || 
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
        
        // Reset selections if not valid for new product
        if (!stages.includes(selectedStage)) setSelectedStage('');
        if (!types.includes(selectedType)) setSelectedType('');
      }
    } else {
      setAvailableStages([]);
      setAvailableTypes([]);
      setSelectedStage('');
      setSelectedType('');
    }
  }, [selectedProduct, products, stageMasters, processMasters]);

  useEffect(() => {
    const identifyMaster = async () => {
      if (selectedProduct && selectedStage && selectedType) {
        setSearching(true);
        try {
          // Fetch masters that match criteria
          const res = await api.get(`/batch-sheet-masters`, {
            params: {
              productId: selectedProduct,
              stage: selectedStage,
              type: selectedType,
              status: 'APPROVED',
              batchNumberSeries: dropdownBatchSeries || undefined
            }
          });
          
          if (res.data.success && res.data.data.length > 0) {
            setIdentifiedMasters(res.data.data);
            // By default, select the first one if none is selected, or if current selection is no longer in the list
            const currentSelected = identifiedMaster;
            const stillAvailable = res.data.data.find((m: any) => currentSelected && m.id === currentSelected.id);
            if (stillAvailable) {
              setIdentifiedMaster(stillAvailable);
            } else {
              setIdentifiedMaster(res.data.data[0]);
            }
          } else {
            setIdentifiedMasters([]);
            setIdentifiedMaster(null);
          }
        } catch (error) {
          console.error('Failed to identify master', error);
          setIdentifiedMasters([]);
          setIdentifiedMaster(null);
        } finally {
          setSearching(false);
        }
      } else {
        setIdentifiedMasters([]);
        setIdentifiedMaster(null);
      }
    };
    identifyMaster();
  }, [selectedProduct, selectedStage, selectedType, dropdownBatchSeries]);

  const handleConfirm = () => {
    if (!identifiedMaster) {
      toast.error('No valid Batch Sheet Master identified for the selected criteria');
      return;
    }
    
    if (!dropdownBatchSeries) {
      toast.error('Batch Number Series selection from the dropdown is required.');
      return;
    }

    if (!batchNumberSheets.trim() && !singlePages.trim()) {
      toast.error('Please enter either Batch Number Sheets or Single pages.');
      return;
    }

    if (batchSheetsHasPages) {
      toast.error('Batch Number Sheets cannot contain single pages. Please use the "Enter Single pages" field instead.');
      return;
    }

    if (singlePagesHasBatches) {
      toast.error('Single Pages input box cannot contain batch numbers. Please use the "Enter Batch Number Sheets" field instead.');
      return;
    }

    if (singlePages.trim() && !singlePagesBatchNumber.trim()) {
      toast.error('Please enter the Batch Number for the requested single pages.');
      return;
    }

    if (requestType === 'REPRINT' && !reprintReason.trim()) {
      toast.error('Reason for re-print is required');
      return;
    }
    
    if (!startDate || !endDate) {
      toast.error('All asterisked fields are required');
      return;
    }
    
    setIsSignDialogOpen(true);
  };

  const onSignatureConfirm = async (password: string) => {
    if (!identifiedMaster) return;
    
    setSubmitting(true);
    try {
      const payloadMfgDate = startDate || new Date().toISOString().split('T')[0];
      const res = await api.post('/batches', {
        recordId: identifiedMaster.id,
        manufacturingDate: payloadMfgDate,
        batchNumberSeries: batchNumberSeries || '',
        dropdownBatchSeries: dropdownBatchSeries || '',
        singlePagesBatchNumber: singlePagesBatchNumber.trim() || undefined,
        startDate: startDate || payloadMfgDate,
        endDate: endDate || startDate || payloadMfgDate,
        signaturePassword: password,
        status: 'PENDING_REVIEW',
        requestType: requestType || 'NEW',
        reprintReason: requestType === 'REPRINT' ? reprintReason : undefined,
        comments: comments || ''
      });
      
      if (res.data.success) {
        toast.success(requestType === 'NEW' ? 'Batch sheet request created successfully' : 'Re-print batch sheet request submitted successfully');
        navigate('/batch-sheet-records/status');
      }
    } catch (error: any) {
      console.error('Failed to submit request', error);
      const serverError = error.response?.data;
      if (serverError?.error === 'Validation Error' && Array.isArray(serverError.details)) {
        const fieldMsgs = serverError.details.map((d: any) => `${d.field.replace('body.', '')}: ${d.message}`).join(', ');
        toast.error(`Validation Failure: ${fieldMsgs}`);
      } else {
        toast.error(serverError?.message || serverError?.error || 'Failed to submit request');
      }
    } finally {
      setSubmitting(false);
      setIsSignDialogOpen(false);
    }
  };

  const getProcessLabel = (code: string) => {
    const pm = processMasters.find(p => p.code === code);
    return pm && pm.name ? `${pm.code} - ${pm.name}` : code;
  };

  const expandBatchSeriesHelper = (series: string): string[] => {
    const trimmed = (series || '').trim();
    if (!trimmed) return [];
    
    const isRange = /^(\d+)-(\d+)$/.test(trimmed);
    if (isRange) {
      const parts = trimmed.split('-');
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      const result: string[] = [];
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          result.push(String(i));
        }
      }
      return result;
    }
    
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      return parts.map(p => p.trim()).filter(Boolean);
    }
    
    return [trimmed];
  };

  const getPrintCounts = (series: string, batches: any[]) => {
    const parsed = parseSeries(series);
    const counts: { [item: string]: number } = {};
    const activeBatches = batches.filter(b => b.status !== 'REJECTED');
    
    // For each batch number requested
    parsed.batchNumbers.forEach(item => {
      let prevCount = 0;
      activeBatches.forEach(b => {
        const bSeries = b.batchNumberSeries || b.batchNumber || '';
        const bParsed = parseSeries(bSeries);
        if (bParsed.batchNumbers.includes(item)) {
          prevCount++;
        }
      });
      counts[item] = prevCount + 1;
    });

    // For each loose page requested
    parsed.loosePages.forEach(item => {
      let prevCount = 0;
      activeBatches.forEach(b => {
        const bSeries = b.batchNumberSeries || b.batchNumber || '';
        const bParsed = parseSeries(bSeries);
        
        // It's printed if a complete batch was printed
        if (bParsed.batchNumbers.length > 0) {
          prevCount++;
        } else {
          // Or if this specific loose page was requested
          const paddedItem = item.padStart(3, '0');
          const unpaddedItem = String(parseInt(item, 10));
          const match = bParsed.loosePages.some(lp => {
            const pLp = lp.padStart(3, '0');
            const uLp = String(parseInt(lp, 10));
            return lp === item || pLp === paddedItem || uLp === unpaddedItem;
          });
          if (match) {
            prevCount++;
          }
        }
      });
      counts[item] = prevCount + 1;
      // also set padding versions
      counts[item.padStart(3, '0')] = prevCount + 1;
      counts[String(parseInt(item, 10))] = prevCount + 1;
    });
    
    return counts;
  };

  const handlePreview = async () => {
    if (!identifiedMaster) {
      toast.error('Please select product, stage and process first');
      return;
    }
    
    const product = products.find(p => p.id === selectedProduct) || null;
    const issuedByText = user?.designation || user?.role || 'Authorized Personnel';

    const hasFile = identifiedMaster.files && identifiedMaster.files.length > 0;
    if (!hasFile) {
      toast.info('No original PDF uploaded. Showing system-generated template preview.');
    }

    try {
      const batchNum = batchNumberSeries || identifiedMaster.batchNumberSeries || product?.batchNumberSeries || 'N/A';
      
      const url = await generateRequestPreviewPDF({
        batchNumber: batchNum,
        dropdownBatchSeries: dropdownBatchSeries || identifiedMaster.batchNumberSeries || product?.batchNumberSeries || '',
        singlePagesBatchNumber: singlePagesBatchNumber.trim() || undefined,
        issueDate: startDate,
        issuedBy: `${issuedByText} (${user?.displayName || user?.email || ''})`.trim(),
        master: identifiedMaster,
        product: product,
        userInfo: user ? { name: user.displayName || user.username || user.email || 'Unknown', id: user.employeeId || 'N/A' } : undefined,
        requestType: requestType,
        printCounts: getPrintCounts(batchNum, existingBatches),
        requestId: 'PENDING',
        isForPrint: false
      });

      if (url) {
        setPreviewUrl(url);
        setIsPreviewOpen(true);
        
        // Log Audit Event
        try {
          await api.post('/audit', {
            action: 'PDF_PREVIEWED',
            entityType: 'BATCH_SHEET',
            entityId: identifiedMaster.id,
            details: {
              batchNumber: batchNum,
              masterName: identifiedMaster.masterName,
              product: product?.title,
              timestamp: new Date().toISOString()
            }
          });
        } catch (auditErr) {
          console.error("Failed to log audit event", auditErr);
        }
      }
    } catch (err: any) {
      toast.error('Failed to generate preview: ' + err.message);
    }
  };

  const matchingBatchNumbers = useMemo(() => {
    const selectedProd = products.find(p => p.id === selectedProduct);
    return batchRecords.filter((rec: any) => {
      const matchesProd = selectedProd && (
        rec.product === selectedProd.title ||
        rec.product === selectedProd.id
      );
      const matchesProcess = !selectedType || rec.category === selectedType;
      
      let matchesStage = true;
      if (selectedStage) {
        const hasStageValue = rec.stage === selectedStage || 
          rec.stageCode === selectedStage ||
          (rec.tokenValues && Object.values(rec.tokenValues).some(val => typeof val === 'string' && val === selectedStage));
        matchesStage = !!hasStageValue;
      }

      return matchesProd && matchesProcess && matchesStage;
    });
  }, [batchRecords, selectedProduct, selectedType, selectedStage, products]);

  const batchSheetsHasPages = useMemo(() => {
    if (!batchNumberSheets.trim()) return false;
    const parsed = parseSeries(batchNumberSheets);
    return parsed.loosePages.length > 0;
  }, [batchNumberSheets]);

  const singlePagesHasBatches = useMemo(() => {
    if (!singlePages.trim()) return false;
    const parsed = parseSeries(singlePages);
    return parsed.batchNumbers.length > 0;
  }, [singlePages]);

  if (loading) return <LoadingPage label="Loading form requirements..." />;

  const trimmedSeries = batchNumberSeries.trim();
  const partsListSeries = trimmedSeries.split(',').map(p => p.trim()).filter(Boolean);
  const isIndividualPagesSeries = partsListSeries.length > 0 && partsListSeries.every(part => /^\d{1,3}$/.test(part));
  const activeBatchesSeries = existingBatches.filter((b: any) => b.status !== 'REJECTED');
  const hasExistingBatchSeries = activeBatchesSeries.length > 0;
  const isForcedReprintSeries = requestType === 'REPRINT';

  return (
    <div className="max-w-5xl mx-auto pb-20 space-y-8">
      <header>
        <div className="flex items-center gap-3 mb-2 text-indigo-600">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ClipboardList className="w-6 h-6" />
          </div>
          <span className="font-bold text-sm uppercase tracking-widest">Manufacturing Operations</span>
        </div>
        <h1 className="text-4xl font-black tracking-tighter text-slate-900">New Batch Sheet Request</h1>
        <p className="text-slate-500 mt-2 text-lg">Generate or re-print official batch manufacturing records for production.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Request Config */}
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Plus className="w-6 h-6 text-indigo-600" />
                Request Configuration
              </CardTitle>
              <CardDescription>Select the purpose and product details for your request.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold">Selection Option *</Label>
                  <Select 
                    value={requestType} 
                    onValueChange={(val: any) => setRequestType(val)}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500">
                      <SelectValue placeholder="Select Option" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="NEW" disabled={isForcedReprintSeries}>
                        Create Request {isForcedReprintSeries && " (Disabled - Must be Re-print)"}
                      </SelectItem>
                      <SelectItem value="REPRINT">Re-Print Batch sheets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold">Product *</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-medium">
                          {selectedProduct 
                            ? products.find(p => p.id === selectedProduct)?.title || selectedProduct
                            : "Select Product"
                          }
                        </span>
                      </div>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold">Stage *</Label>
                  <Select 
                    disabled={!selectedProduct} 
                    value={selectedStage} 
                    onValueChange={setSelectedStage}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500">
                      <SelectValue placeholder="Select Stage" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {availableStages.map(stage => (
                        <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold">Process *</Label>
                  <Select 
                    disabled={!selectedProduct} 
                    value={selectedType} 
                    onValueChange={setSelectedType}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500">
                      <SelectValue placeholder="Select Process" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {availableTypes.map(type => (
                        <SelectItem key={type} value={type}>{getProcessLabel(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold">Batch Number Series *</Label>

                  <Select 
                    value={dropdownBatchSeries} 
                    onValueChange={(val) => {
                      setDropdownBatchSeries(val);
                    }} 
                    disabled={!selectedProduct || !selectedType || !selectedStage}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500 disabled:opacity-75">
                      <div className="flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-indigo-500/80 animate-[spin_10s_linear_infinite]" />
                        <span className="text-sm font-medium">
                          {dropdownBatchSeries || (!selectedStage ? "Please select Stage first" : !selectedType ? "Please select Process first" : "Select active batch number from Engine")}
                        </span>
                      </div>
                    </SelectTrigger>
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

                  {selectedProduct && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => navigate('/batch-number-generator-engine')}
                        className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/75 px-2.5 py-1.5 rounded-full transition-all flex items-center gap-1 border border-indigo-100/40 animate-in fade-in duration-200 cursor-pointer"
                      >
                        Active Batch Numbers Table &rarr;
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold text-indigo-600">Enter Batch Number Sheets *</Label>
                  <Input 
                    disabled={!selectedProduct || (Boolean(singlePages.trim() || singlePagesBatchNumber.trim()) && !batchNumberSheets.trim())}
                    value={batchNumberSheets}
                    onChange={(e) => setBatchNumberSheets(e.target.value)}
                    placeholder="e.g. 26001 or 26001-26010 or 26001,26002"
                    className="h-12 rounded-xl bg-indigo-50/30 border-indigo-100 focus:ring-indigo-500 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {Boolean(singlePages.trim() || singlePagesBatchNumber.trim()) && !batchNumberSheets.trim() && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-xl border border-amber-200 mt-1 animate-in fade-in duration-200">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Disabled — Single Pages request is active without Batch Number Sheets.</span>
                    </div>
                  )}
                  {batchSheetsHasPages && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1.5 rounded-xl border border-rose-100 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Single pages are not allowed in this box. Please use the "Enter Single pages" box below.</span>
                    </div>
                  )}
                  {batchNumberSheets && (() => {
                    const trimmed = batchNumberSheets.trim();
                    const { batchNumbers } = parseSeries(trimmed);
                    const isRepeated = checkIsRepeated(trimmed);
                    const isRange = /^(\d+)-(\d+)$/.test(trimmed);

                    if (batchNumbers.length === 0) {
                      return null;
                    }

                    return (
                      <div className="flex items-center gap-2 mt-1 px-1 flex-wrap animate-in fade-in duration-200">
                        {isRange ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-tight bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Recognized: Range ({batchNumbers.length} sheets)
                          </div>
                        ) : batchNumbers.length === 1 ? (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-tight bg-blue-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Recognized: 1 Batch Sheet (All Pages)
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-tight bg-blue-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Recognized: {batchNumbers.length} copies of Batch Sheet
                          </div>
                        )}

                        {isRepeated && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 uppercase tracking-tight bg-rose-50 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            Re-print Required
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">Specify base batch numbers or range only (e.g. 26001-26010).</p>
                  
                  {identifiedMaster && (
                    <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span className="text-xs font-medium text-slate-700">
                          Last Batch Number Sheets requested: <strong className="font-mono text-indigo-900 bg-white px-2 py-0.5 rounded border border-indigo-200 ml-1 font-bold">{lastRequestedSheetsMsg}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Separation line for Single Pages Section */}
                <div className="relative my-6 pt-2">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-start">
                    <span className="bg-white pr-3 text-slate-500 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                      Single Pages Request (Optional)
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold text-indigo-600">Enter Batch Number for Single Pages</Label>
                  <Input 
                    disabled={!selectedProduct}
                    value={singlePagesBatchNumber}
                    onChange={(e) => setSinglePagesBatchNumber(e.target.value)}
                    placeholder="e.g. 26001 or 26006"
                    className="h-12 rounded-xl bg-indigo-50/30 border-indigo-100 focus:ring-indigo-500 font-mono text-sm"
                  />
                  {singlePagesBatchNumber.trim() && (
                    <div className="flex items-center gap-2 mt-1 px-1 flex-wrap animate-in fade-in duration-200">
                      {isBatchNumberPreviouslyRequested(singlePagesBatchNumber) ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 uppercase tracking-tight bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          Batch #{singlePagesBatchNumber.trim()} in previously requested range &rarr; Recognized as Re-Print
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-tight bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          Batch #{singlePagesBatchNumber.trim()} is new &rarr; Recognized as New Request (Not Re-Print)
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">
                    Determines from which batch number sheet the single pages are requested.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-600 font-semibold text-indigo-600">Enter Single pages</Label>
                  <Input 
                    disabled={!selectedProduct}
                    value={singlePages}
                    onChange={(e) => setSinglePages(e.target.value)}
                    placeholder="e.g. 001,002,003 or 001-010"
                    className="h-12 rounded-xl bg-indigo-50/30 border-indigo-100 focus:ring-indigo-500 font-mono text-sm"
                  />
                  {singlePagesHasBatches && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1.5 rounded-xl border border-rose-100 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Batch numbers are not allowed in this box. Please use the "Enter Batch Number Sheets" box above.</span>
                    </div>
                  )}
                  {singlePages && (() => {
                    const trimmed = singlePages.trim();
                    const { loosePages } = parseSeries(trimmed);
                    const isRepeated = singlePagesBatchNumber.trim()
                      ? isBatchNumberPreviouslyRequested(singlePagesBatchNumber)
                      : checkIsRepeated(trimmed);

                    if (loosePages.length === 0) {
                      return null;
                    }

                    return (
                      <div className="flex items-center gap-2 mt-1 px-1 flex-wrap animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 uppercase tracking-tight bg-indigo-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Recognized: Pages {loosePages.map(p => parseInt(p, 10)).join(', ')} of Uploaded PDF
                        </div>

                        {isRepeated && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-600 uppercase tracking-tight bg-rose-50 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" />
                            Re-print Required
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">Specify single pages that need printing (e.g. 001,002 or 001-010).</p>
                </div>

                <div className="space-y-2 col-span-1 md:col-span-2">
                  <Label className="text-slate-600 font-semibold">Request Date & Time *</Label>
                  <Input 
                    type="datetime-local"
                    min={getLocalDateTimeString()}
                    value={requestDateTime}
                    onChange={(e) => setRequestDateTime(e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-none focus:ring-indigo-500 font-medium text-slate-800"
                    style={{ colorScheme: "light" }}
                  />
                  <p className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">
                    Select the scheduled request date and time. Current local time is default; past times/dates are disabled.
                  </p>
                </div>

                <div className="space-y-2 col-span-1 md:col-span-2">
                  <Label className="text-slate-600 font-semibold">Comments</Label>
                  <Textarea 
                    placeholder="Enter any optional notes or comments for this batch sheet request..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="min-h-[100px] rounded-2xl bg-slate-50 border-none focus:ring-indigo-500 text-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 font-medium px-1 uppercase tracking-wider">
                    Optional notes or comments regarding this manufacturing run request.
                  </p>
                </div>
              </div>

              {requestType === 'REPRINT' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <Label className="text-slate-600 font-semibold text-rose-600 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Reason for Re-Print *
                  </Label>
                  <Textarea 
                    placeholder="Provide a detailed reason for the re-print request..."
                    value={reprintReason}
                    onChange={(e) => setReprintReason(e.target.value)}
                    className="min-h-[100px] rounded-2xl bg-rose-50/30 border-rose-100 focus:ring-rose-500"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Master Record Identification */}
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6 text-amber-600" />
                Identified Master Record
              </CardTitle>
              <CardDescription>Automatically identified based on your selections. If multiple protocols match, click on the desired protocol below to select it.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="pl-8">Master Name / Product</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Document No.</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="pr-8 text-right">Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searching ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                          <RotateCcw className="w-6 h-6 animate-spin" />
                          <span className="text-sm font-medium">Searching for master records...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : identifiedMasters.length > 0 ? (
                    identifiedMasters.map((master) => {
                      const isSelected = identifiedMaster?.id === master.id;
                      return (
                        <TableRow 
                          key={master.id} 
                          onClick={() => setIdentifiedMaster(master)}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-slate-50/60",
                            isSelected ? "bg-amber-50/40 hover:bg-amber-50/60" : ""
                          )}
                        >
                          <TableCell className="pl-8 py-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-3">
                              <input 
                                type="radio" 
                                name="selectedMaster"
                                checked={isSelected}
                                onChange={() => setIdentifiedMaster(master)}
                                className="h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              />
                              <div>
                                <div className="font-bold text-slate-800">{master.masterName}</div>
                                <div className="text-xs text-slate-500 font-medium mt-0.5">
                                  {master.product?.title || products.find(p => p.id === master.productId)?.title || 'Unknown Product'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 rounded-full px-3 text-xs">
                              {master.stage || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-slate-600 py-4">
                            {master.documentNumber || 'N/A'}
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge variant="outline" className="bg-white rounded-full px-3 text-xs">
                              Ver {master.version}
                            </Badge>
                          </TableCell>
                          <TableCell className="pr-8 text-right py-4" onClick={(e) => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setIdentifiedMaster(master);
                                setTimeout(() => {
                                  handlePreview();
                                }, 50);
                              }}
                              className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-full h-8 px-4"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Preview PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-slate-400 italic">
                        {(!selectedProduct || !selectedStage || !selectedType) 
                          ? "Select all criteria above to identify the master record."
                          : "No approved master record found for the selected criteria."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar / Confirmation */}
        <div className="space-y-8">
          <Card className="border-none shadow-xl rounded-3xl overflow-hidden bg-slate-900 text-white">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold">Authorization</h3>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">Compliance First</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-slate-400 leading-relaxed">
                  Requesting a batch sheet is a controlled process. Your identity will be verified via electronic signature.
                </p>
                
                <div className="pt-4 border-t border-white/10 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Request Type</span>
                    <span className="font-bold">{requestType === 'NEW' ? 'New Issuance' : 'Re-Print'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Status</span>
                    <Badge variant="outline" className="border-white/20 text-white rounded-full bg-emerald-500/10">READY</Badge>
                  </div>
                </div>

                <Button 
                  onClick={handleConfirm}
                  disabled={!identifiedMaster || submitting}
                  className={cn(
                    "w-full h-14 rounded-2xl font-bold shadow-2xl transition-all",
                    requestType === 'NEW' 
                      ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20" 
                      : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                  )}
                >
                  {submitting ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {requestType === 'NEW' ? 'Confirm Request' : 'Sign & Re-Print'}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900">Need Help?</h3>
                <p className="text-xs text-slate-500">
                  If you can't find the required master, ensure it has been fully approved by the QA team.
                </p>
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/batch-sheet-masters')}
                  className="text-indigo-600 hover:text-indigo-700 text-xs font-bold"
                >
                  Review Masters <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <SignatureDialog 
        isOpen={isSignDialogOpen}
        onClose={() => setIsSignDialogOpen(false)}
        onConfirm={onSignatureConfirm}
        title={requestType === 'NEW' ? 'Issue Batch Sheet' : 'Re-Print Batch Sheet'}
        description={requestType === 'NEW' 
          ? "You are about to issue a new batch sheet. Electronic signature is required."
          : "You are about to request a re-print for this batch sheet. Electronic signature is required."
        }
        meaning={requestType === 'NEW' 
          ? "I am requesting the issuance of this batch sheet for production. I verify that all criteria are correct."
          : `I am requesting a re-print of this batch sheet. Reason: ${reprintReason}`
        }
        isLoading={submitting}
      />

      {isPreviewOpen && previewUrl && (
        <SecurePDFViewer 
          fileUrl={previewUrl}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewUrl(null);
          }}
          title={`Preview: ${identifiedMaster?.masterName}`}
          batchInfo={`Batch Series: ${batchNumberSeries || identifiedMaster?.batchNumberSeries || 'N/A'}`}
          batchNo={batchNumberSeries || identifiedMaster?.batchNumberSeries || 'MK14-26510/M'}
          dropdownBatchSeries={dropdownBatchSeries || identifiedMaster?.batchNumberSeries || ''}
          singlePagesBatchNumber={singlePagesBatchNumber.trim() || undefined}
          issuedBy={user ? `${user.role || 'ADMIN'} (${user.displayName || user.username || 'Akshay Sharma'})` : 'ADMIN (Akshay Sharma)'}
          dateOfIssue={new Date().toISOString()}
          timeOfIssue={new Date().toISOString()}
          printedBy={user ? `${user.displayName || user.username || 'Unknown'} (${user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase() : 'Admin'})` : 'Akshay Sharma (Admin)'}
          printedDateTime={new Date().toISOString()}
          requestId={formatRequestId(
            batchNumberSeries || identifiedMaster?.batchNumberSeries || 'MK14-001',
            new Date().toISOString(),
            identifiedMaster?.product?.title || products.find(p => p.id === identifiedMaster?.productId)?.title,
            'PENDING'
          )}
          mode="request"
        />
      )}

      {/* Floating iframe overlay displaying Last Batch Number Sheets requested */}
      {identifiedMaster && dropdownBatchSeries && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border-2 border-indigo-500 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900 px-3.5 py-2 flex items-center justify-between text-white border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono font-bold tracking-wide text-indigo-200">
                Last Request Tracker
              </span>
            </div>
          </div>
          <iframe
            title="Last Batch Number Sheets Requested"
            srcDoc={`
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8" />
                  <style>
                    body {
                      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                      margin: 0;
                      padding: 12px 14px;
                      background: #f8fafc;
                      color: #0f172a;
                    }
                    .container {
                      display: flex;
                      flex-direction: column;
                      gap: 6px;
                    }
                    .header {
                      font-size: 11px;
                      font-weight: 700;
                      color: #475569;
                      text-transform: uppercase;
                      letter-spacing: 0.5px;
                    }
                    .sheet-badge {
                      display: inline-block;
                      background: #e0e7ff;
                      color: #312e81;
                      padding: 6px 12px;
                      border-radius: 8px;
                      font-weight: 800;
                      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                      font-size: 14px;
                      border: 1px solid #c7d2fe;
                      width: fit-content;
                      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    }
                    .subtext {
                      font-size: 11px;
                      color: #4f46e5;
                      font-weight: 500;
                      line-height: 1.3;
                      margin-top: 2px;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="header">
                      Last Batch Number Sheets requested:
                    </div>
                    <div class="sheet-badge">
                      ${lastRequestedSheetsMsg}
                    </div>
                    <div class="subtext">
                      💡 Request higher/next sequential sheets to avoid triggering an automatic Re-Print flag.
                    </div>
                  </div>
                </body>
              </html>
            `}
            className="w-full h-32 border-none bg-slate-50"
          />
        </div>
      )}
    </div>
  );
}
