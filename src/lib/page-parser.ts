import { PDFDocument } from 'pdf-lib';

export interface PageValidationResult {
  isValid: boolean;
  error?: string;
  normalizedString: string;
  selectedPages: number[];
  totalSelected: number;
}

/**
 * Normalizes a page selection string by trimming and removing irregular whitespace.
 * e.g. " 5  - 8 , 12  " -> "5-8,12"
 */
export function normalizePageString(input: string): string {
  if (!input) return '';
  return input
    .replace(/\s+/g, '') // remove all whitespace
    .replace(/,+/g, ',') // collapse multiple commas
    .replace(/^,|,$/g, ''); // strip leading/trailing commas
}

/**
 * Parses and validates user-entered page numbers for reprinting.
 * Supports:
 * - Single page: "5"
 * - Multiple pages: "5,8,12"
 * - Range: "5-10"
 * - Mixed: "2,5-8,12,20-25"
 * - Handles spaces safely: "5 - 8, 12" -> "5-8,12"
 *
 * Validates against the actual total pages of the Batch Sheet.
 */
export function parseAndValidatePageSelection(
  rawInput: string,
  totalPages: number = 60
): PageValidationResult {
  const trimmed = (rawInput || '').trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Pages to print again is required.',
      normalizedString: '',
      selectedPages: [],
      totalSelected: 0
    };
  }

  // Check for unauthorized characters (only numbers, commas, hyphens, and whitespace allowed)
  if (!/^[\d\s,-]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid character in page selection. Please enter only page numbers, commas, and hyphens (e.g. 5, 8-10).',
      normalizedString: '',
      selectedPages: [],
      totalSelected: 0
    };
  }

  const normalized = normalizePageString(trimmed);
  if (!normalized) {
    return {
      isValid: false,
      error: 'Please specify valid page numbers to reprint.',
      normalizedString: '',
      selectedPages: [],
      totalSelected: 0
    };
  }

  const parts = normalized.split(',').filter(Boolean);
  const pageSet = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const rangeParts = part.split('-');
      if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
        return {
          isValid: false,
          error: `Invalid range format: "${part}". Expected format like "5-10".`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      const start = parseInt(rangeParts[0], 10);
      const end = parseInt(rangeParts[1], 10);

      if (isNaN(start) || isNaN(end)) {
        return {
          isValid: false,
          error: `Invalid range "${part}": Page numbers must be valid integers.`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      if (start <= 0) {
        return {
          isValid: false,
          error: `Page ${start} is invalid. Page numbers must be 1 or greater.`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      if (start > end) {
        return {
          isValid: false,
          error: `Invalid page range "${part}": Start page (${start}) cannot be greater than end page (${end}).`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      if (totalPages > 0 && end > totalPages) {
        return {
          isValid: false,
          error: `Page ${end} is invalid. This Batch Sheet contains ${totalPages} pages.`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      for (let p = start; p <= end; p++) {
        pageSet.add(p);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum)) {
        return {
          isValid: false,
          error: `Invalid page number: "${part}".`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      if (pageNum <= 0) {
        return {
          isValid: false,
          error: `Page ${pageNum} is invalid. Page numbers must be 1 or greater.`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      if (totalPages > 0 && pageNum > totalPages) {
        return {
          isValid: false,
          error: `Page ${pageNum} is invalid. This Batch Sheet contains ${totalPages} pages.`,
          normalizedString: normalized,
          selectedPages: [],
          totalSelected: 0
        };
      }

      pageSet.add(pageNum);
    }
  }

  const sortedPages = Array.from(pageSet).sort((a, b) => a - b);

  if (sortedPages.length === 0) {
    return {
      isValid: false,
      error: 'No valid pages selected.',
      normalizedString: normalized,
      selectedPages: [],
      totalSelected: 0
    };
  }

  // Format canonical normalized string representing ranges compactly
  const canonicalParts: string[] = [];
  let rangeStart = sortedPages[0];
  let prev = sortedPages[0];

  for (let i = 1; i < sortedPages.length; i++) {
    const curr = sortedPages[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      if (rangeStart === prev) {
        canonicalParts.push(String(rangeStart));
      } else if (prev === rangeStart + 1) {
        canonicalParts.push(`${rangeStart},${prev}`);
      } else {
        canonicalParts.push(`${rangeStart}-${prev}`);
      }
      rangeStart = curr;
      prev = curr;
    }
  }

  if (rangeStart === prev) {
    canonicalParts.push(String(rangeStart));
  } else if (prev === rangeStart + 1) {
    canonicalParts.push(`${rangeStart},${prev}`);
  } else {
    canonicalParts.push(`${rangeStart}-${prev}`);
  }

  const canonicalString = canonicalParts.join(',');

  return {
    isValid: true,
    normalizedString: canonicalString,
    selectedPages: sortedPages,
    totalSelected: sortedPages.length
  };
}

/**
 * Extracts the total page count from a PDF document.
 */
export async function getPDFPageCount(pdfBytesOrUrl: ArrayBuffer | Uint8Array | string): Promise<number> {
  try {
    let bytes: ArrayBuffer | Uint8Array;
    if (typeof pdfBytesOrUrl === 'string') {
      const res = await fetch(pdfBytesOrUrl);
      bytes = await res.arrayBuffer();
    } else {
      bytes = pdfBytesOrUrl;
    }
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (err) {
    console.warn('[getPDFPageCount] Failed to get PDF page count, defaulting to estimated count:', err);
    return 1;
  }
}

/**
 * Extracts ONLY the specified original page numbers from an existing PDF
 * and produces a new, derivative PDF containing solely those pages.
 * The original master PDF is preserved completely unchanged.
 *
 * @param sourcePdfBytes Source PDF ArrayBuffer or Uint8Array
 * @param selectedPages 1-based page numbers array e.g. [5, 6, 7, 8, 12]
 * @returns Uint8Array of the new derivative PDF
 */
export async function extractSelectedPagesPDF(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  selectedPages: number[]
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();
  const newPdf = await PDFDocument.create();

  // Convert 1-based page numbers to 0-based indices and ensure within bounds
  const zeroBasedIndices = selectedPages
    .map(p => p - 1)
    .filter(idx => idx >= 0 && idx < totalPages);

  if (zeroBasedIndices.length === 0) {
    throw new Error('No valid pages found to extract for reprint.');
  }

  const copiedPages = await newPdf.copyPages(sourcePdf, zeroBasedIndices);
  for (const page of copiedPages) {
    newPdf.addPage(page);
  }

  return await newPdf.save();
}
