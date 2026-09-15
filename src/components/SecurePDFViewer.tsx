import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, X, ChevronLeft, ChevronRight, AlertCircle, Move, RefreshCw, Eye, EyeOff, Sliders, Save, Check } from 'lucide-react';
import axios from 'axios';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatRequestId, getBatchNumberForSheet } from '../lib/pdf-generator';
import { getUserFullNameWithDesignation, setGlobalUsersCache } from '../lib/batch-sheets';
import { toast } from 'sonner';

// Set up the worker for react-pdf to use our secure same-origin local worker endpoint
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface SecurePDFViewerProps {
  fileUrl: string;
  onClose: () => void;
  title?: string;
  batchInfo?: string;
  batchNo?: string;
  dropdownBatchSeries?: string;
  singlePagesBatchNumber?: string;
  issuedBy?: string;
  dateOfIssue?: string;
  timeOfIssue?: string;
  printedBy?: string;
  printedDateTime?: string;
  requestId?: string;
  users?: any[];

  // View modes & overlay permissions
  mode?: 'master' | 'request' | 'batch';
  batchStatus?: string;
  hideOverlays?: boolean;
  hideOverlayPanel?: boolean;
  allowOverlayMove?: boolean;
  onlyShowBatchNoOverlay?: boolean;
  onSaveOverlays?: (config: any) => void;
}

export const SecurePDFViewer: React.FC<SecurePDFViewerProps> = ({ 
  fileUrl, 
  onClose, 
  title = "Secure Document Preview",
  batchInfo,
  batchNo,
  dropdownBatchSeries,
  singlePagesBatchNumber,
  issuedBy,
  dateOfIssue,
  timeOfIssue,
  printedBy,
  printedDateTime,
  requestId,
  users: usersProp,
  mode,
  batchStatus,
  hideOverlays,
  hideOverlayPanel,
  allowOverlayMove,
  onlyShowBatchNoOverlay,
  onSaveOverlays
}) => {
  const { user } = useAuth();
  const [internalUsers, setInternalUsers] = useState<any[]>(usersProp || []);

  const isOnlyBatchNo = Boolean(onlyShowBatchNoOverlay || mode === 'request');

  // Helper to extract storage keys for overlay configuration
  const getStorageKeys = useCallback((reqId?: string, bNo?: string, titleText?: string) => {
    const keys: string[] = [];
    if (reqId && reqId.trim()) {
      const cleanReq = reqId.trim();
      keys.push(`pdf_overlay_config_${cleanReq}`);
      keys.push(`pdf_overlay_config_${cleanReq.replace(/[^a-zA-Z0-9]/g, '_')}`);
    }
    if (bNo && bNo.trim()) {
      const cleanBNo = bNo.trim();
      keys.push(`pdf_overlay_config_${cleanBNo}`);
      keys.push(`pdf_overlay_config_${cleanBNo.replace(/[^a-zA-Z0-9]/g, '_')}`);
    }
    if (titleText && titleText.trim()) {
      const match = titleText.match(/(?:Batch Sheet Preview|Batch Report|Preview):\s*([^\s|]+)/i);
      if (match?.[1]) {
        const extracted = match[1].trim();
        keys.push(`pdf_overlay_config_${extracted}`);
        keys.push(`pdf_overlay_config_${extracted.replace(/[^a-zA-Z0-9]/g, '_')}`);
      }
    }
    keys.push('pdf_overlay_config_latest');
    return Array.from(new Set(keys));
  }, []);

  // Read saved overlay configuration from localStorage synchronously
  const readSavedOverlayConfig = useCallback((reqId?: string, bNo?: string, titleText?: string) => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const keys = getStorageKeys(reqId, bNo, titleText);
    for (const k of keys) {
      try {
        const item = localStorage.getItem(k);
        if (item) {
          const parsed = JSON.parse(item);
          if (parsed && typeof parsed === 'object') {
            return { config: parsed, key: k };
          }
        }
      } catch (e) {
        console.warn("Error parsing saved overlay config from key:", k, e);
      }
    }
    return null;
  }, [getStorageKeys]);

  useEffect(() => {
    if (usersProp && usersProp.length > 0) {
      setInternalUsers(usersProp);
    } else {
      api.get('/users').then(res => {
        const list = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
        if (list.length > 0) {
          setInternalUsers(list);
          setGlobalUsersCache(list);
        }
      }).catch(() => {});
    }
  }, [usersProp]);

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Movable / Drag-and-drop overlay options & parameters
  const [showOverlayPanel, setShowOverlayPanel] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(100); // 100% default opacity
  const [draggingOverlay, setDraggingOverlay] = useState<string | null>(null);
  const [resizingComment, setResizingComment] = useState<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const [hiddenCommentSheets, setHiddenCommentSheets] = useState<number[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

  // Initialize overlays state with saved positions if available, preventing race conditions or reset to defaults
  const [overlays, setOverlays] = useState(() => {
    const defaultOverlays = {
      batchNo: { x: 6, y: 0, label: "Batch No.", text: "Batch No.:\nMK14-26510/M", visible: true, width: undefined, height: undefined },
      issuedBy: { x: 30, y: 0, label: "Issued By", text: "Issued By: QA Incharge (Krishan Kumar)", visible: !isOnlyBatchNo, width: undefined, height: undefined },
      dateTimeOfIssue: { x: 30, y: 1.5, label: "Date & Time Of Issue", text: "Date & Time Of issue: 16-JUL-2026, 10:06:18", visible: !isOnlyBatchNo, width: undefined, height: undefined },
      printedBy: { x: 30, y: 3.0, label: "Printed By", text: `Printed By: ${printedBy ? getUserFullNameWithDesignation(printedBy) : getUserFullNameWithDesignation(user)}`, visible: !isOnlyBatchNo, width: undefined, height: undefined },
      printedDateTime: { x: 30, y: 4.5, label: "Print Date & Time", text: "Print Date & Time: 16-JUL-2026, 10:06:18", visible: !isOnlyBatchNo, width: undefined, height: undefined },
      requestId: { x: 0, y: 97.5, label: "Request ID", text: "Request ID: MK14-20260716-001", visible: !isOnlyBatchNo, width: undefined, height: undefined },
      comment: { x: 30, y: 85, label: "Custom Comment", text: "", visible: false, width: 220, height: 70 }
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      const keys: string[] = [];
      if (requestId && requestId.trim()) {
        const clean = requestId.trim();
        keys.push(`pdf_overlay_config_${clean}`, `pdf_overlay_config_${clean.replace(/[^a-zA-Z0-9]/g, '_')}`);
      }
      if (batchNo && batchNo.trim()) {
        const clean = batchNo.trim();
        keys.push(`pdf_overlay_config_${clean}`, `pdf_overlay_config_${clean.replace(/[^a-zA-Z0-9]/g, '_')}`);
      }
      if (title && title.trim()) {
        const match = title.match(/(?:Batch Sheet Preview|Batch Report|Preview):\s*([^\s|]+)/i);
        if (match?.[1]) {
          const ext = match[1].trim();
          keys.push(`pdf_overlay_config_${ext}`, `pdf_overlay_config_${ext.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
      }
      keys.push('pdf_overlay_config_latest');

      for (const k of keys) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              const merged = { ...defaultOverlays };
              Object.keys(parsed).forEach(pk => {
                if ((merged as any)[pk]) {
                  const pItem = parsed[pk];
                  if (typeof pItem.x === 'number') (merged as any)[pk].x = pItem.x;
                  if (typeof pItem.y === 'number') (merged as any)[pk].y = pItem.y;
                  if (typeof pItem.visible === 'boolean') {
                    (merged as any)[pk].visible = isOnlyBatchNo && pk !== 'batchNo' ? false : pItem.visible;
                  }
                  if (typeof pItem.width === 'number') (merged as any)[pk].width = pItem.width;
                  if (typeof pItem.height === 'number') (merged as any)[pk].height = pItem.height;
                  if (pk === 'comment' && typeof pItem.text === 'string') {
                    (merged as any).comment.text = pItem.text;
                  }
                }
              });
              if (isOnlyBatchNo) {
                merged.issuedBy.visible = false;
                merged.dateTimeOfIssue.visible = false;
                merged.printedBy.visible = false;
                merged.printedDateTime.visible = false;
                merged.requestId.visible = false;
                merged.comment.visible = false;
              }
              return merged;
            }
          }
        } catch (e) {
          console.warn("Failed to parse initial overlay position from key:", k, e);
        }
      }
    }

    return defaultOverlays;
  });

  // 1. Role Check Helper (QA Chemist, QA Incharge, QA Reviewer, QA Approver, QA Head, QA Manager, Admin)
  const isQAOrAdmin = useMemo(() => {
    if (!user) return false;
    const rolesToCheck = [
      (user as any).functionalRole,
      user.role,
      user.designation,
      (user as any).designationName,
      (user as any).userRole,
      (user as any).department,
      (user as any).departmentName
    ].filter(Boolean).map((r: string) => String(r).toUpperCase().replace(/[-_]/g, ' '));

    const matchesRole = rolesToCheck.some(r => 
      r.includes('ADMIN') || 
      r.includes('QA REVIEWER') || 
      r.includes('QA APPROVER') || 
      r.includes('QA HEAD') || 
      r.includes('QA MANAGER') || 
      r.includes('QA INCHARGE') || 
      r.includes('QA IN CHARGE') || 
      r.includes('INCHARGE') || 
      r.includes('QA CHEMIST') || 
      r.includes('CHEMIST') || 
      r.includes('QUALITY ASSURANCE') || 
      r.includes('QA') || 
      r === 'QA'
    );

    const hasQAPermission = Boolean(
      user.permissions && (
        user.permissions.includes('op:issued') ||
        user.permissions.includes('batch:issue') ||
        user.permissions.includes('batch:print') ||
        user.permissions.includes('batch:review') ||
        user.permissions.includes('batch:approve') ||
        user.permissions.includes('format:edit') ||
        user.permissions.includes('batch:view') ||
        user.permissions.includes('batch:preview') ||
        user.permissions.includes('batch_sheet_master:create') ||
        user.permissions.includes('batch_sheet_master:edit') ||
        user.permissions.includes('lookup:create') ||
        user.permissions.includes('lookup:edit')
      )
    );

    return matchesRole || hasQAPermission;
  }, [user]);

  // 2. Stage / Status Check Helper (QA Review state, Approved state, Issued state)
  const isAllowedStage = useMemo(() => {
    const statusUpper = (batchStatus || '').toUpperCase().trim();
    const infoUpper = (batchInfo || '').toUpperCase().trim();
    const titleUpper = (title || '').toUpperCase().trim();

    // Issued state (explicitly check for ISSUED in status, info, or title)
    const isIssued = statusUpper.includes('ISSUED') || 
                     statusUpper === 'ISSUED' ||
                     infoUpper.includes('ISSUED') ||
                     titleUpper.includes('ISSUED');

    // QA Review state: Verify documentation & GMP compliance / READY_FOR_QA_REVIEW / PENDING_REVIEW
    const isQAReview = statusUpper.includes('REVIEW') || 
                       statusUpper.includes('QA') || 
                       infoUpper.includes('VERIFY DOCUMENTATION') || 
                       infoUpper.includes('GMP COMPLIANCE') || 
                       infoUpper.includes('REVIEW');

    // Approved (Sign-Off) state
    const isApproved = statusUpper.includes('APPROVED') || 
                       statusUpper.includes('SIGN_OFF') || 
                       statusUpper.includes('SIGNOFF') || 
                       infoUpper.includes('APPROVED');

    // Post-issued / in progress / completed operational stages
    const isPostIssued = statusUpper.includes('PROGRESS') ||
                         statusUpper.includes('HANDOVER') ||
                         statusUpper.includes('COMPLETED');

    // Default for batch mode if not explicitly in draft
    const isBatchMode = mode === 'batch' && !statusUpper.includes('DRAFT');

    return isIssued || isQAReview || isApproved || isPostIssued || isBatchMode;
  }, [batchStatus, batchInfo, title, mode]);

  // 3. Determine Overlays Visible, Panel Visible, and Movable
  const { isOverlaysVisible, isPanelVisible, isMoveAllowed } = useMemo(() => {
    // Mode 'master' or explicit hideOverlays => Hide ALL overlays & controls panel
    if (mode === 'master' || hideOverlays) {
      return {
        isOverlaysVisible: false,
        isPanelVisible: false,
        isMoveAllowed: false
      };
    }

    // When isOnlyBatchNo (e.g. preview mode in Identified Master Record):
    // Show only Batch No. overlay in default position, NO controls panel, NO moving
    if (isOnlyBatchNo) {
      return {
        isOverlaysVisible: true,
        isPanelVisible: false,
        isMoveAllowed: false
      };
    }

    // Mode 'batch' or default:
    // When the Batch sheet is in Issued State QA Incharge and QA Chemist (as well as QA Reviewer, Approver, Head, Admin)
    // will have the permission to rearrange the Movable PDF overlays and can also see the Overlay control panel.
    const canMoveAndControl = isQAOrAdmin && isAllowedStage;

    const finalPanelVisible = hideOverlayPanel ? false : (allowOverlayMove !== undefined ? allowOverlayMove : canMoveAndControl);
    const finalMoveAllowed = allowOverlayMove !== undefined ? allowOverlayMove : canMoveAndControl;

    return {
      isOverlaysVisible: true,
      isPanelVisible: finalPanelVisible,
      isMoveAllowed: finalMoveAllowed
    };
  }, [mode, hideOverlays, hideOverlayPanel, allowOverlayMove, isQAOrAdmin, isAllowedStage, isOnlyBatchNo]);



  // Helper to format dates and times in DD/MMM/YYYY format like pdf-generator.ts
  const formatToDDMMMYYYY = (dateInput?: Date | string) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) {
      if (typeof dateInput === 'string') return dateInput;
      return '16-JUL-2026';
    }
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const day = String(d.getDate()).padStart(2, '0');
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatToHMS = (dateInput?: Date | string) => {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '10:06:18';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Batch Sheet info for multi-sheet tracking and per-sheet custom comment logic
  const batchSheetInfo = useMemo(() => {
    let rawBatchNo = batchNo;
    if (!rawBatchNo) {
      const match = title?.match(/(?:Batch Sheet Preview|Batch Report|Preview):\s*([^\s|]+)/i);
      if (match?.[1]) {
        rawBatchNo = match[1];
      }
    }
    if (!rawBatchNo) {
      rawBatchNo = "MK14-26510/M";
    }

    const partsList = rawBatchNo.split(',').map(p => p.trim()).filter(Boolean);
    const parsedBatchNumbers: string[] = [];
    const loosePages: string[] = [];
    
    partsList.forEach(part => {
      if (/^\d+-\d+$/.test(part)) {
        const rangeParts = part.split('-');
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          const isPageRange = rangeParts[0].length <= 3 && rangeParts[1].length <= 3;
          if (isPageRange) {
            for (let i = start; i <= end; i++) {
              const padLen = Math.max(rangeParts[0].length, rangeParts[1].length);
              loosePages.push(String(i).padStart(padLen, '0'));
            }
          } else {
            for (let i = start; i <= end; i++) {
              parsedBatchNumbers.push(String(i));
            }
          }
        }
      } else if (/^\d+$/.test(part)) {
        if (part.length <= 3) {
          loosePages.push(part);
        } else {
          parsedBatchNumbers.push(part);
        }
      } else {
        parsedBatchNumbers.push(part);
      }
    });

    const B = parsedBatchNumbers.length;
    const L = loosePages.length;

    const labels = parsedBatchNumbers.map(b => 
      dropdownBatchSeries ? getBatchNumberForSheet(dropdownBatchSeries, b) : b
    );

    if (B === 0) {
      const defaultLbl = dropdownBatchSeries || rawBatchNo || 'Sheet 1';
      return {
        currentBatchIndex: 0,
        isFirstPageOfBatchSheet: pageNumber === 1,
        currentBatchLabel: defaultLbl,
        totalBatchSheets: 1,
        batchSheetLabels: [defaultLbl]
      };
    }

    const templatePageCount = (numPages && numPages >= B) ? Math.max(1, Math.round((numPages - L) / B)) : 1;
    const totalBatchPages = B * templatePageCount;

    if (pageNumber <= totalBatchPages) {
      const idx = Math.floor((pageNumber - 1) / templatePageCount);
      const isFirst = ((pageNumber - 1) % templatePageCount) === 0;
      return {
        currentBatchIndex: idx,
        isFirstPageOfBatchSheet: isFirst,
        currentBatchLabel: labels[idx] || `Sheet ${idx + 1}`,
        totalBatchSheets: B,
        batchSheetLabels: labels
      };
    } else {
      return {
        currentBatchIndex: B,
        isFirstPageOfBatchSheet: false,
        currentBatchLabel: 'Loose Page',
        totalBatchSheets: B,
        batchSheetLabels: labels
      };
    }
  }, [batchNo, dropdownBatchSeries, title, pageNumber, numPages]);

  const { currentBatchIndex, isFirstPageOfBatchSheet, currentBatchLabel, totalBatchSheets, batchSheetLabels } = batchSheetInfo;

  useEffect(() => {
    // 1. Resolve Batch Number
    let rawBatchNo = batchNo;
    if (!rawBatchNo) {
      const match = title?.match(/(?:Batch Sheet Preview|Batch Report|Preview):\s*([^\s|]+)/i);
      if (match?.[1]) {
        rawBatchNo = match[1];
      }
    }
    if (!rawBatchNo) {
      rawBatchNo = "MK14-26510/M";
    }

    // Apply the exact same logic as pdf-generator.ts to get the display batch number for the sheet
    const partsList = rawBatchNo.split(',').map(p => p.trim()).filter(Boolean);
    const parsedBatchNumbers: string[] = [];
    const loosePages: string[] = [];
    
    partsList.forEach(part => {
      if (/^\d+-\d+$/.test(part)) {
        const rangeParts = part.split('-');
        const start = parseInt(rangeParts[0], 10);
        const end = parseInt(rangeParts[1], 10);
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          const isPageRange = rangeParts[0].length <= 3 && rangeParts[1].length <= 3;
          if (isPageRange) {
            for (let i = start; i <= end; i++) {
              const padLen = Math.max(rangeParts[0].length, rangeParts[1].length);
              loosePages.push(String(i).padStart(padLen, '0'));
            }
          } else {
            for (let i = start; i <= end; i++) {
              parsedBatchNumbers.push(String(i));
            }
          }
        }
      } else if (/^\d+$/.test(part)) {
        if (part.length <= 3) {
          loosePages.push(part);
        } else {
          parsedBatchNumbers.push(part);
        }
      } else {
        parsedBatchNumbers.push(part);
      }
    });

    // Calculate template page count and which batch number / page we are on
    const B = parsedBatchNumbers.length;
    const L = loosePages.length;
    
    let resolvedBatchNo = "";
    if (numPages) {
      const templatePageCount = B > 0 ? Math.max(1, Math.round((numPages - L) / B)) : numPages;
      const totalBatchPages = B * templatePageCount;
      
      if (pageNumber <= totalBatchPages) {
        // We are on a page that belongs to one of the batch numbers
        const activeBatchIndex = Math.floor((pageNumber - 1) / templatePageCount);
        const rawActiveBatch = parsedBatchNumbers[activeBatchIndex] || parsedBatchNumbers[0] || rawBatchNo;
        resolvedBatchNo = dropdownBatchSeries ? getBatchNumberForSheet(dropdownBatchSeries, rawActiveBatch) : rawActiveBatch;
      } else {
        // We are on a loose page
        let fallbackBatchNo = singlePagesBatchNumber || parsedBatchNumbers[0] || '';
        if (!fallbackBatchNo) {
          fallbackBatchNo = dropdownBatchSeries || rawBatchNo;
        } else if (dropdownBatchSeries) {
          fallbackBatchNo = getBatchNumberForSheet(dropdownBatchSeries, fallbackBatchNo);
        }
        resolvedBatchNo = fallbackBatchNo;
      }
    } else {
      // Fallback before PDF is loaded
      let firstBNo = singlePagesBatchNumber || parsedBatchNumbers[0] || loosePages[0] || rawBatchNo;
      resolvedBatchNo = dropdownBatchSeries ? getBatchNumberForSheet(dropdownBatchSeries, firstBNo) : firstBNo;
    }

    // 2. Resolve Issued By: in GMP, issued by the QA user who approves the batch request
    let resolvedIssuedBy = issuedBy || "QA Incharge (Krishan Kumar)";
    if (resolvedIssuedBy.toLowerCase().includes("production incharge") || resolvedIssuedBy.toLowerCase().includes("production manager")) {
      resolvedIssuedBy = "QA Incharge (Krishan Kumar)";
    }

    // 3. Resolve Date & Time Of issue
    let resolvedDateOfIssue = dateOfIssue ? formatToDDMMMYYYY(dateOfIssue) : "";
    let resolvedTimeOfIssue = timeOfIssue ? formatToHMS(timeOfIssue) : "";
    
    if (!resolvedDateOfIssue) {
      resolvedDateOfIssue = formatToDDMMMYYYY(new Date());
    }
    if (!resolvedTimeOfIssue) {
      resolvedTimeOfIssue = formatToHMS(new Date());
    }

    // 4. Resolve Printed By
    let resolvedPrintedBy = printedBy;
    if (!resolvedPrintedBy) {
      resolvedPrintedBy = getUserFullNameWithDesignation(user, internalUsers);
    } else {
      resolvedPrintedBy = getUserFullNameWithDesignation(resolvedPrintedBy, internalUsers);
    }

    // 5. Resolve Print Date and Time
    const currentPrintedDate = printedDateTime ? formatToDDMMMYYYY(printedDateTime) : formatToDDMMMYYYY(new Date());
    const currentPrintedTime = printedDateTime ? formatToHMS(printedDateTime) : formatToHMS(new Date());
    const currentPrintedDateTime = `${currentPrintedDate}, ${currentPrintedTime}`;

    // 6. Resolve Request ID
    const resolvedRequestId = formatRequestId(
      resolvedBatchNo,
      dateOfIssue,
      title || batchInfo,
      requestId
    );

    setOverlays(prev => ({
      batchNo: {
        ...prev.batchNo,
        text: `Batch No.:\n${resolvedBatchNo}`,
        visible: true
      },
      issuedBy: {
        ...prev.issuedBy,
        text: `Issued By: ${resolvedIssuedBy}`,
        visible: isOnlyBatchNo ? false : prev.issuedBy.visible
      },
      dateTimeOfIssue: {
        ...prev.dateTimeOfIssue,
        text: `Date & Time Of issue: ${resolvedDateOfIssue}, ${resolvedTimeOfIssue}`,
        visible: isOnlyBatchNo ? false : prev.dateTimeOfIssue.visible
      },
      printedBy: {
        ...prev.printedBy,
        text: `Printed By: ${resolvedPrintedBy}`,
        visible: isOnlyBatchNo ? false : prev.printedBy.visible
      },
      printedDateTime: {
        ...prev.printedDateTime,
        text: `Print Date & Time: ${currentPrintedDateTime}`,
        visible: isOnlyBatchNo ? false : prev.printedDateTime.visible
      },
      requestId: {
        ...prev.requestId,
        text: `Request ID: ${resolvedRequestId}`,
        visible: isOnlyBatchNo ? false : prev.requestId.visible
      },
      comment: {
        ...prev.comment,
        visible: isOnlyBatchNo ? false : prev.comment.visible
      }
    }));
  }, [batchNo, dropdownBatchSeries, issuedBy, dateOfIssue, timeOfIssue, printedBy, printedDateTime, requestId, user, internalUsers, title, pageNumber, numPages, isOnlyBatchNo]);

  // Restore saved overlay positions from local storage on mount or key change
  useEffect(() => {
    try {
      const savedResult = readSavedOverlayConfig(requestId, batchNo, title);
      if (savedResult?.config) {
        const parsed = savedResult.config;
        if (Array.isArray(parsed.hiddenCommentSheets)) {
          setHiddenCommentSheets(parsed.hiddenCommentSheets);
        }
        setOverlays(prev => {
          const next = { ...prev };
          let modified = false;
          Object.keys(parsed).forEach(k => {
            if (next[k as keyof typeof next]) {
              const pItem = parsed[k];
              if (typeof pItem.x === 'number') {
                next[k as keyof typeof next].x = pItem.x;
                modified = true;
              }
              if (typeof pItem.y === 'number') {
                next[k as keyof typeof next].y = pItem.y;
                modified = true;
              }
              if (typeof pItem.visible === 'boolean') {
                next[k as keyof typeof next].visible = (isOnlyBatchNo && k !== 'batchNo') ? false : pItem.visible;
                modified = true;
              }
              if (typeof pItem.width === 'number') {
                (next[k as keyof typeof next] as any).width = pItem.width;
                modified = true;
              }
              if (typeof pItem.height === 'number') {
                (next[k as keyof typeof next] as any).height = pItem.height;
                modified = true;
              }
              if (k === 'comment') {
                if (typeof pItem.text === 'string') {
                  next.comment.text = pItem.text;
                }
                modified = true;
              }
            }
          });
          if (isOnlyBatchNo) {
            next.issuedBy.visible = false;
            next.dateTimeOfIssue.visible = false;
            next.printedBy.visible = false;
            next.printedDateTime.visible = false;
            next.requestId.visible = false;
            next.comment.visible = false;
            modified = true;
          }
          return modified ? next : prev;
        });
      }
    } catch (e) {
      console.warn("Failed to load saved overlay configuration", e);
    }
  }, [requestId, batchNo, title, isOnlyBatchNo, readSavedOverlayConfig]);

  // Save changes handler to explicitly persist customized positions
  const handleSaveChanges = useCallback(() => {
    try {
      const configToSave = Object.entries(overlays).reduce((acc, [k, v]) => {
        acc[k] = { 
          x: v.x, 
          y: v.y, 
          visible: v.visible,
          width: v.width,
          height: v.height,
          text: k === 'comment' ? v.text : undefined
        };
        return acc;
      }, {} as Record<string, any>);

      configToSave.hiddenCommentSheets = hiddenCommentSheets;
      configToSave.savedAt = new Date().toISOString();
      configToSave.savedBy = user ? (user.displayName || user.username || user.email || 'User') : 'User';

      const serialized = JSON.stringify(configToSave);
      const keys = getStorageKeys(requestId, batchNo, title);
      keys.forEach(k => {
        try {
          localStorage.setItem(k, serialized);
        } catch (storageErr) {
          console.warn(`Failed to set localStorage key ${k}`, storageErr);
        }
      });

      if (onSaveOverlays) {
        onSaveOverlays(configToSave);
      }

      setHasUnsavedChanges(false);
      setIsSavedRecently(true);
      setTimeout(() => {
        setIsSavedRecently(false);
      }, 3000);

      toast.success("Overlay layout and positions saved successfully!");
    } catch (err) {
      console.error("Failed to save overlay configuration:", err);
      toast.error("Failed to save overlay changes");
    }
  }, [overlays, hiddenCommentSheets, requestId, batchNo, title, user, onSaveOverlays, getStorageKeys]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, key: string) => {
    if (!isMoveAllowed) return;
    setDraggingOverlay(key);
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingOverlay) return;
    
    const container = document.getElementById('pdf-overlay-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Calculate position as percentage inside the container
    let newX = ((clientX - rect.left) / rect.width) * 100;
    let newY = ((clientY - rect.top) / rect.height) * 100;
    
    // Constrain to bounds so they don't leave the view (allow fully to corners)
    newX = Math.max(0, Math.min(100, newX));
    newY = Math.max(0, Math.min(100, newY));
    
    setOverlays(prev => ({
      ...prev,
      [draggingOverlay]: {
        ...prev[draggingOverlay as keyof typeof prev],
        x: newX,
        y: newY
      }
    }));
  };

  const handleDragEnd = () => {
    setDraggingOverlay(null);
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMoveAllowed) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setResizingComment({
      startX: clientX,
      startY: clientY,
      startWidth: overlays.comment?.width || 220,
      startHeight: overlays.comment?.height || 70
    });
  };

  const handleResizeMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!resizingComment) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const deltaX = clientX - resizingComment.startX;
    const deltaY = clientY - resizingComment.startY;
    
    const newWidth = Math.max(100, Math.min(600, resizingComment.startWidth + deltaX));
    const newHeight = Math.max(35, Math.min(400, resizingComment.startHeight + deltaY));
    
    setOverlays(prev => ({
      ...prev,
      comment: {
        ...prev.comment,
        width: newWidth,
        height: newHeight
      }
    }));
  };

  const handleResizeEnd = () => {
    setResizingComment(null);
  };

  const handleContainerMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (resizingComment) {
      handleResizeMove(e);
      return;
    }
    if (draggingOverlay) {
      handleDragMove(e);
    }
  };

  const handleContainerMouseUp = () => {
    let hadChange = false;
    if (resizingComment) {
      handleResizeEnd();
      hadChange = true;
    }
    if (draggingOverlay) {
      handleDragEnd();
      hadChange = true;
    }
    if (hadChange) {
      setHasUnsavedChanges(true);
      // Auto-save to localStorage to prevent accidental position loss on closing
      try {
        const configToSave = Object.entries(overlays).reduce((acc, [k, v]) => {
          acc[k] = { 
            x: v.x, 
            y: v.y, 
            visible: v.visible,
            width: v.width,
            height: v.height,
            text: k === 'comment' ? v.text : undefined
          };
          return acc;
        }, {} as Record<string, any>);
        configToSave.hiddenCommentSheets = hiddenCommentSheets;
        const serialized = JSON.stringify(configToSave);
        const keys = getStorageKeys(requestId, batchNo, title);
        keys.forEach(k => {
          try {
            localStorage.setItem(k, serialized);
          } catch (storageErr) {}
        });
      } catch (err) {}
    }
  };

  const handleResetPositions = () => {
    const defaultPositions = {
      batchNo: { ...overlays.batchNo, x: 6, y: 0, visible: true },
      issuedBy: { ...overlays.issuedBy, x: 30, y: 0, visible: !isOnlyBatchNo },
      dateTimeOfIssue: { ...overlays.dateTimeOfIssue, x: 30, y: 1.5, visible: !isOnlyBatchNo },
      printedBy: { ...overlays.printedBy, x: 30, y: 3.0, visible: !isOnlyBatchNo },
      printedDateTime: { ...overlays.printedDateTime, x: 30, y: 4.5, visible: !isOnlyBatchNo },
      requestId: { ...overlays.requestId, x: 0, y: 97.5, visible: !isOnlyBatchNo },
      comment: { ...overlays.comment, x: 30, y: 85, visible: false, width: 220, height: 70, text: "" }
    };
    setOverlays(defaultPositions);
    setHiddenCommentSheets([]);
    setHasUnsavedChanges(false);
    try {
      const keys = getStorageKeys(requestId, batchNo, title);
      keys.forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch (e) {}
      });
      toast.info("Overlay positions reset to default");
    } catch (e) {
      console.warn("Failed to clear saved overlay config", e);
    }
  };

  const pdfjsVersion = pdfjs.version || "5.4.296";
  const options = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/standard_fonts/`,
  }), [pdfjsVersion]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const onDocumentLoadError = (err: Error) => {
    console.error("PDF Load Error:", err);
    setError("Failed to parse and display PDF. The file may be corrupt or access was denied.");
    setLoading(false);
  };

  // Safe loading of PDF using authenticated client fetch for standard URLs
  useEffect(() => {
    if (!fileUrl) return;

    if (fileUrl.startsWith('blob:')) {
      setResolvedUrl(fileUrl);
      setFetching(false);
      return;
    }

    let active = true;
    let urlToRevoke: string | null = null;

    const fetchPdf = async () => {
      setFetching(true);
      setError(null);
      setLoading(true);
      try {
        const isExternal = !fileUrl.startsWith('/') && !fileUrl.startsWith(window.location.origin);
        
        let response;
        if (isExternal) {
          console.log(`[SecurePDFViewer] Fetching external PDF via standard axios: "${fileUrl}"`);
          response = await axios.get(fileUrl, { responseType: 'blob' });
        } else {
          let requestUrl = fileUrl;
          if (requestUrl.startsWith(window.location.origin)) {
            requestUrl = requestUrl.substring(window.location.origin.length);
          }
          if (requestUrl.startsWith('/api/')) {
            requestUrl = requestUrl.substring('/api'.length);
          }
          console.log(`[SecurePDFViewer] Fetching local PDF via authenticated client: "${requestUrl}" (original: "${fileUrl}")`);
          response = await api.get(requestUrl, { responseType: 'blob' });
        }
        
        if (!active) return;
        
        const pdfBlob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/pdf' });
        const localUrl = URL.createObjectURL(pdfBlob);
        urlToRevoke = localUrl;
        setResolvedUrl(localUrl);
      } catch (err: any) {
        console.error("SecurePDFViewer: Error fetching authentic PDF:", err);
        if (active) {
          setError("Failed to load secure document. Please ensure you have the necessary permissions.");
        }
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    fetchPdf();

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [fileUrl]);

  // 1. Disable Right Click
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // 2. Disable Keyboard Shortcuts (Save, Print)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+P / Cmd+P
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        return false;
      }
      // Ctrl+S / Cmd+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+S
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
        e.preventDefault();
        return false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const changePage = useCallback((offset: number) => {
    setPageNumber(prevPageNumber => {
      const next = prevPageNumber + offset;
      if (numPages && next >= 1 && next <= numPages) {
        return next;
       }
      return prevPageNumber;
    });
  }, [numPages]);

  const isCurrentlyLoading = fetching || loading;

  return (
    <div 
      id="secure-pdf-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8 select-none"
    >
      <div className="bg-slate-50 w-full h-full max-w-5xl rounded-xl shadow-2xl flex flex-col overflow-hidden relative border border-slate-300">
        
        {/* Header - Minimal controls */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-red-600 rounded flex items-center justify-center font-bold text-xs text-white">PDF</div>
            <div>
              <h3 className="font-semibold text-sm line-clamp-1 text-white">{title}</h3>
              {batchInfo && <p className="text-[10px] text-slate-400 font-mono">{batchInfo}</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Save Changes button on top */}
            {!error && !isCurrentlyLoading && numPages && isMoveAllowed && (
              <button
                id="save-overlay-changes-button"
                onClick={handleSaveChanges}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                  isSavedRecently
                    ? 'bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-700'
                    : hasUnsavedChanges
                    ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-400 shadow-md animate-pulse'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-600'
                }`}
                title="Save customized position of the movable overlay text"
              >
                {isSavedRecently ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Changes Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                    {hasUnsavedChanges && (
                      <span className="w-2 h-2 rounded-full bg-white animate-ping ml-0.5" />
                    )}
                  </>
                )}
              </button>
            )}

            {!error && !isCurrentlyLoading && numPages && isPanelVisible && (
              <button
                id="toggle-overlay-panel-button"
                onClick={() => setShowOverlayPanel(!showOverlayPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  showOverlayPanel 
                    ? 'bg-indigo-600 text-white border border-indigo-500 hover:bg-indigo-700' 
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Overlay Controls</span>
              </button>
            )}
            <div className="hidden md:flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full text-xs text-slate-300 border border-slate-700">
              <AlertCircle className="w-3 h-3 text-amber-500" />
              <span>Restricted View Interface</span>
            </div>
            <button 
              id="close-preview-button"
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative bg-slate-200/50">
          
          {/* Main PDF viewport */}
          <div 
            className="flex-1 overflow-auto flex justify-center p-4 relative custom-scrollbar select-none"
            onContextMenu={(e) => e.preventDefault()}
          >
            {isCurrentlyLoading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-100/80 z-10">
                <Loader2 className="w-10 h-10 animate-spin text-slate-600" />
                <p className="text-slate-600 font-medium animate-pulse">Decrypting and Securely Loading PDF...</p>
              </div>
            )}

            {error ? (
              <div className="flex flex-col items-center justify-center gap-4 text-slate-800 max-w-md text-center p-8 m-auto">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-2">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h4 className="text-xl font-bold">Access Denied / Load Error</h4>
                <p className="text-slate-600">{error}</p>
                <button 
                  onClick={onClose}
                  className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
                >
                  Close Preview
                </button>
              </div>
            ) : (
              resolvedUrl && (
                <div 
                  id="pdf-overlay-container"
                  className="shadow-2xl bg-white relative self-start select-none"
                  onMouseMove={handleContainerMouseMove}
                  onTouchMove={handleContainerMouseMove}
                  onMouseUp={handleContainerMouseUp}
                  onTouchEnd={handleContainerMouseUp}
                  onMouseLeave={handleContainerMouseUp}
                >
                  <div className="pointer-events-none">
                    <Document
                      file={resolvedUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      onLoadError={onDocumentLoadError}
                      loading={null}
                      options={options}
                    >
                      {numPages !== null && (
                        <Page 
                          pageNumber={pageNumber} 
                          scale={1.2} 
                          renderAnnotationLayer={false}
                          renderTextLayer={false} /* Deter copy-paste */
                          className="max-w-full"
                        />
                      )}
                    </Document>
                  </div>
                  
                  {/* Draggable Overlays */}
                  {isOverlaysVisible && Object.entries(overlays).map(([key, item]) => {
                    if (!item.visible) return null;
                    if (isOnlyBatchNo && key !== 'batchNo') return null;
                    if (key === 'comment') {
                      if (!isFirstPageOfBatchSheet) return null;
                      if (hiddenCommentSheets.includes(currentBatchIndex)) return null;
                    }
                    const isDragging = draggingOverlay === key;
                    
                    // Dynamic font size: batchNo (+2px), top center overlays (reduced by 2px to 8px/10px), requestId / comment (-2px)
                    let fontSizeClass = 'text-[10px] sm:text-xs';
                    if (key === 'batchNo') {
                      fontSizeClass = 'text-[12px] sm:text-[14px]';
                    } else if (key === 'issuedBy' || key === 'dateTimeOfIssue' || key === 'printedBy' || key === 'printedDateTime') {
                      fontSizeClass = 'text-[8px] sm:text-[10px]';
                    } else if (key === 'requestId' || key === 'comment') {
                      fontSizeClass = 'text-[8px] sm:text-[10px]';
                    }

                    if (key === 'comment') {
                      return (
                        <div
                          key={key}
                          style={{ 
                            left: `${item.x}%`, 
                            top: `${item.y}%`,
                            width: item.width ? `${item.width}px` : '220px',
                            height: item.height ? `${item.height}px` : '70px',
                            cursor: isMoveAllowed ? (isDragging ? 'grabbing' : 'grab') : 'default',
                            opacity: isDragging ? 0.95 : overlayOpacity / 100,
                            pointerEvents: isMoveAllowed ? 'auto' : 'none'
                          }}
                          onMouseDown={(e) => handleDragStart(e, key)}
                          onTouchStart={(e) => handleDragStart(e, key)}
                          className={`absolute select-none p-1.5 transition-all duration-75 flex flex-col z-50 rounded border ${
                            isDragging 
                              ? 'bg-red-50/20 text-red-600 font-bold border-red-400 shadow-md' 
                              : 'bg-white/90 border-dashed border-red-300 text-red-600 shadow-xs' + (isMoveAllowed ? ' hover:border-red-500 hover:bg-white' : ' border-none bg-transparent')
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5 border-b border-red-200/60 pb-0.5 select-none">
                            <span className="text-[7px] uppercase font-bold text-red-500 tracking-wider pointer-events-none truncate max-w-[170px]">
                              Comment ({currentBatchLabel})
                            </span>
                            {isMoveAllowed && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHiddenCommentSheets(prev => [...prev, currentBatchIndex]);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                title="Remove comment box from this batch sheet"
                                className="pointer-events-auto text-red-400 hover:text-red-700 hover:bg-red-100 rounded p-0.5 transition-colors shrink-0"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          
                          {isMoveAllowed ? (
                            <textarea
                              value={item.text}
                              onChange={(e) => {
                                const val = e.target.value;
                                setOverlays(prev => ({
                                  ...prev,
                                  comment: { ...prev.comment, text: val }
                                }));
                              }}
                              placeholder="Type comment here..."
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              className={`w-full flex-1 bg-transparent border-none outline-none resize-none font-bold font-mono tracking-wide text-red-600 leading-normal ${fontSizeClass} p-0`}
                            />
                          ) : (
                            <p className={`${fontSizeClass} leading-normal font-bold font-mono tracking-wide break-words select-none whitespace-pre-line text-red-600 flex-1 overflow-hidden`}>
                              {item.text}
                            </p>
                          )}

                          {isMoveAllowed && (
                            <div
                              onMouseDown={handleResizeStart}
                              onTouchStart={handleResizeStart}
                              title="Drag to resize box"
                              className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-se-resize flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded-tl transition-colors z-10"
                            >
                              <span className="text-[9px] font-bold leading-none">⌟</span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        style={{ 
                          left: `${item.x}%`, 
                          top: `${item.y}%`,
                          cursor: isMoveAllowed ? (isDragging ? 'grabbing' : 'grab') : 'default',
                          opacity: isDragging ? 0.95 : overlayOpacity / 100,
                          pointerEvents: isMoveAllowed ? 'auto' : 'none'
                        }}
                        onMouseDown={(e) => handleDragStart(e, key)}
                        onTouchStart={(e) => handleDragStart(e, key)}
                        className={`absolute select-none p-1 transition-all duration-75 flex flex-col z-50 ${
                          isDragging 
                            ? 'bg-red-50/10 text-red-600 font-bold' 
                            : 'bg-transparent text-red-600' + (isMoveAllowed ? ' hover:bg-red-50/10' : '')
                        }`}
                      >
                        <p className={`${fontSizeClass} leading-normal font-bold font-mono tracking-wide break-words select-none whitespace-pre-line`}>
                          {item.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* Right Sidebar: Overlay controls */}
          {!error && !isCurrentlyLoading && isPanelVisible && showOverlayPanel && (
            <div className="w-64 border-l border-slate-200 bg-slate-50 p-4 flex flex-col gap-5 shrink-0 select-none">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Move className="w-4 h-4 text-indigo-600" />
                  Movable Overlays
                </span>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleSaveChanges}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded transition-all flex items-center gap-1 cursor-pointer"
                    title="Save current layout positions"
                  >
                    <Save className="w-3 h-3" />
                    Save Layout
                  </button>
                  <button 
                    onClick={handleResetPositions}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded transition-all flex items-center gap-1 cursor-pointer"
                    title="Reset positions to default"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                💡 <span className="font-semibold text-slate-700">Drag & Drop:</span> Click and drag any overlay stamp directly on the PDF to rearrange them as required. Click <strong className="text-emerald-700 font-bold">Save Changes</strong> on top to lock in your custom positions.
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Active Layers</span>
                {Object.entries(overlays).map(([key, item]) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <button
                      onClick={() => {
                        const isNowVisible = !item.visible;
                        setHasUnsavedChanges(true);
                        setOverlays(prev => ({
                          ...prev,
                          [key]: { ...prev[key as keyof typeof prev], visible: isNowVisible }
                        }));
                        if (key === 'comment' && isNowVisible) {
                          setHiddenCommentSheets([]);
                        }
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                        item.visible 
                          ? 'bg-indigo-50/60 border-indigo-100 text-indigo-950 font-semibold shadow-sm' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      <span className="text-xs flex items-center gap-1.5">
                        {item.label}
                        {key === 'comment' && (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Page 1 Only
                          </span>
                        )}
                      </span>
                      {item.visible ? (
                        <Eye className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                    </button>

                    {key === 'comment' && item.visible && (
                      <div className="p-2.5 bg-indigo-50/80 rounded-lg border border-indigo-100 flex flex-col gap-2 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">Comment Content</label>
                          <span className="text-[9px] font-medium text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded">Page 1 Only</span>
                        </div>

                        {!isFirstPageOfBatchSheet && (
                          <p className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200 font-medium leading-normal">
                            ℹ️ Viewing Page {pageNumber} of {currentBatchLabel}. The comment box renders exclusively on Page 1 of each batch sheet.
                          </p>
                        )}

                        {hiddenCommentSheets.includes(currentBatchIndex) && (
                          <div className="flex items-center justify-between p-1.5 bg-amber-50 rounded border border-amber-200 text-[10px]">
                            <span className="text-amber-800 font-medium truncate max-w-[150px]">Removed from {currentBatchLabel}</span>
                            <button
                              type="button"
                              onClick={() => setHiddenCommentSheets(prev => prev.filter(i => i !== currentBatchIndex))}
                              className="text-[9px] font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-200 px-2 py-0.5 rounded shadow-2xs"
                            >
                              Restore
                            </button>
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={item.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOverlays(prev => ({
                              ...prev,
                              comment: { ...prev.comment, text: val }
                            }));
                          }}
                          placeholder="Type comment here..."
                          className="w-full p-1.5 text-xs bg-white border border-indigo-200 rounded font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />

                        <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium">
                          <span>Box Size:</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setOverlays(prev => ({
                                ...prev,
                                comment: {
                                  ...prev.comment,
                                  width: Math.max(100, (prev.comment.width || 220) - 20),
                                  height: Math.max(35, (prev.comment.height || 70) - 10)
                                }
                              }))}
                              className="px-2 py-0.5 bg-white border border-slate-200 rounded font-bold hover:bg-slate-100 text-slate-700 shadow-xs"
                              title="Decrease box size"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverlays(prev => ({
                                ...prev,
                                comment: {
                                  ...prev.comment,
                                  width: Math.min(500, (prev.comment.width || 220) + 20),
                                  height: Math.min(300, (prev.comment.height || 70) + 10)
                                }
                              }))}
                              className="px-2 py-0.5 bg-white border border-slate-200 rounded font-bold hover:bg-slate-100 text-slate-700 shadow-xs"
                              title="Increase box size"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Multi-batch sheet comment controls */}
                        {totalBatchSheets > 1 && (
                          <div className="flex flex-col gap-1.5 mt-1 border-t border-indigo-200/60 pt-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">Per-Sheet Comment Visibility</span>
                              <span className="text-[9px] font-medium text-slate-500">{totalBatchSheets} Sheets</span>
                            </div>
                            <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
                              {batchSheetLabels.map((lbl, idx) => {
                                const isRemoved = hiddenCommentSheets.includes(idx);
                                return (
                                  <div key={idx} className="flex items-center justify-between p-1.5 bg-white rounded border border-indigo-100 text-[11px]">
                                    <span className="font-mono font-medium text-slate-700 truncate max-w-[130px]" title={lbl}>
                                      {lbl}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setHiddenCommentSheets(prev => 
                                          isRemoved ? prev.filter(i => i !== idx) : [...prev, idx]
                                        );
                                      }}
                                      className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors ${
                                        isRemoved 
                                          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                      }`}
                                    >
                                      {isRemoved ? 'Removed' : 'Page 1 Visible'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            {hiddenCommentSheets.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setHiddenCommentSheets([])}
                                className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 text-right underline mt-0.5"
                              >
                                Restore comment on all sheets
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Opacity slider */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overlay Opacity</span>
                  <span className="text-xs font-bold text-slate-700">{overlayOpacity}%</span>
                </div>
                <input 
                  type="range" 
                  min="30" 
                  max="100" 
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseInt(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-1 bg-slate-200 rounded-lg appearance-none"
                />
              </div>

              {/* Tips */}
              <div className="mt-auto pt-4 border-t border-slate-200 text-[10px] text-slate-400 italic">
                Arrange overlays to prevent blocking critical batch-sheet data fields during verification.
              </div>
            </div>
          )}
        </div>

        {/* Navigation Toolbar */}
        {!error && !isCurrentlyLoading && numPages && (
          <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-center gap-6 border-t border-slate-800">
            <button 
              onClick={() => changePage(-1)}
              disabled={pageNumber <= 1}
              className="p-1 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-2 font-medium text-sm">
              <span className="text-slate-300">Page</span>
              <span className="bg-slate-800 px-3 py-1 rounded border border-slate-700 min-w-[3rem] text-center">{pageNumber}</span>
              <span className="text-slate-500">of</span>
              <span className="text-slate-300">{numPages}</span>
            </div>

            <button 
              onClick={() => changePage(1)}
              disabled={pageNumber >= numPages}
              className="p-1 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Security Warning Banner */}
        {!error && !isCurrentlyLoading && (
          <div className="bg-amber-50 text-amber-800 text-[10px] py-1 px-4 text-center border-t border-amber-100 font-medium uppercase tracking-widest">
            This document is watermarked with your identity. Any unauthorized distribution or screenshot is a violation of policy.
          </div>
        )}
      </div>
    </div>
  );
};
