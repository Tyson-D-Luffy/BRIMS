export interface BatchValidationResult {
  isValid: boolean;
  type?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  typeName?: string;
  productCode?: string;
  stageCode?: string;
  yearCode?: string;
  serialNumber?: string;
  error?: string;
}

export interface ProductComplianceResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Parses and validates any manual batch number against GMP-approved numbering conventions (Types A-G).
 */
export function validateBatchNumber(batchNumber: string): BatchValidationResult {
  const trimmed = batchNumber.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Batch number cannot be empty' };
  }

  // TYPE B: API Blended / Converted Dispatch Batch
  // Format: W YYZZZ
  // Rules:
  // - Product Code = configured blended lot product code (1 to 3 alphabetic characters)
  // - One space between Product Code and Year Code
  // - Year Code = last 2 digits of year
  // - Serial Number = exactly 3 digits
  // Example: MKT 24001
  const typeBRegex = /^([a-zA-Z]{1,3})\s(\d{2})(\d{3})$/;
  const matchB = trimmed.match(typeBRegex);
  if (matchB) {
    return {
      isValid: true,
      type: 'B',
      typeName: 'TYPE B: API Blended / Converted Dispatch Batch',
      productCode: matchB[1].toUpperCase(),
      stageCode: undefined,
      yearCode: matchB[2],
      serialNumber: matchB[3],
    };
  }

  // TYPE C, D, E, F, G: Intermediate lots (Format: WX-YYZZZ/[PDMAR], Example: L08-24001/P)
  // Suffix: P (C), D (D), M (E), A (F), R (G)
  const suffixRegex = /^([a-zA-Z]{1,3})([a-zA-Z0-9]+)-(\d{2})(\d{3})\/([PDMAR])$/i;
  const matchSuffix = trimmed.match(suffixRegex);
  if (matchSuffix) {
    const sfx = matchSuffix[5].toUpperCase();
    let typeChar: 'C' | 'D' | 'E' | 'F' | 'G' = 'C';
    let typeName = '';
    
    if (sfx === 'P') {
      typeChar = 'C';
      typeName = 'TYPE C: Intermediate Dispatch Batch';
    } else if (sfx === 'D') {
      typeChar = 'D';
      typeName = 'TYPE D: Intermediate Blended / Converted Lot';
    } else if (sfx === 'M') {
      typeChar = 'E';
      typeName = 'TYPE E: Intermediate Micronized Lot';
    } else if (sfx === 'A') {
      typeChar = 'F';
      typeName = 'TYPE F: Intermediate Isolation of 2nd Crop Lot';
    } else if (sfx === 'R') {
      typeChar = 'G';
      typeName = 'TYPE G: Intermediate Reprocessed Lot';
    }

    return {
      isValid: true,
      type: typeChar,
      typeName,
      productCode: matchSuffix[1].toUpperCase(),
      stageCode: matchSuffix[2],
      yearCode: matchSuffix[3],
      serialNumber: matchSuffix[4],
    };
  }

  // TYPE A: API Dispatch Batch (Format: WX-YYZZZ, Example: MK14-26001, MK14-26501)
  const typeARegex = /^([a-zA-Z]{1,3})([a-zA-Z0-9]+)-(\d{2})(\d{3})$/;
  const matchA = trimmed.match(typeARegex);
  if (matchA) {
    return {
      isValid: true,
      type: 'A',
      typeName: 'TYPE A: API Dispatch Batch',
      productCode: matchA[1].toUpperCase(),
      stageCode: matchA[2],
      yearCode: matchA[3],
      serialNumber: matchA[4],
    };
  }

  // Detailed error analysis for feedback
  if (trimmed.includes('/') && trimmed.includes('-')) {
    const parts = trimmed.split('/');
    const mainPart = parts[0];
    const sfx = parts[1];
    if (!sfx || !['P', 'D', 'M', 'A', 'R'].includes(sfx.toUpperCase())) {
      return { 
        isValid: false, 
        error: `Invalid suffix "${sfx || ''}". Suffix for intermediate lots must be one of: P, D, M, A, R.` 
      };
    }
  }

  if (trimmed.includes(' ') && trimmed.includes('-')) {
    return { 
      isValid: false, 
      error: 'Invalid format: Cannot mix space and hyphen symbols (e.g. use "MKT 24001" or "MK14-24001").' 
    };
  }

  // If they have no hyphen or space
  if (!trimmed.includes('-') && !trimmed.includes(' ')) {
    return {
      isValid: false,
      error: 'Invalid structure: Missing required separator (hyphen for TYPE A/C-G, space for TYPE B).'
    };
  }

  // Check Year and Serial part (5 digits) after hyphen
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-');
    const afterHyphen = parts[1]?.split('/')[0] || '';
    if (afterHyphen.length > 0 && afterHyphen.length !== 5) {
      return {
        isValid: false,
        error: `Invalid numeric segment: "${afterHyphen}". Year-Serial must be exactly 5 digits (2-digit Year + 3-digit Serial, e.g. 24001).`
      };
    }
  }

  return { 
    isValid: false, 
    error: 'Unrecognized format. Does not match any approved naming convention (e.g. MK14-24001, MKT 24001, L08-24001/P).' 
  };
}

/**
 * Validates a batch number against selected Product Master configurations.
 */
export function validateProductMasterCompliance(
  batchNumber: string,
  product: { title: string; type: string; stage: string; batchNumberSeries: string },
  selectedStageForm?: string,
  selectedTypeForm?: string
): ProductComplianceResult {
  const errors: string[] = [];
  const parsed = validateBatchNumber(batchNumber);

  if (!parsed.isValid || !parsed.productCode) {
    return { isValid: false, errors: [parsed.error || 'Invalid batch number formula'] };
  }

  const enteredProdCode = parsed.productCode.toUpperCase();
  const enteredStageCode = parsed.stageCode?.toUpperCase();
  const batchType = parsed.type;

  // 1. Verify Product Code exists in product master context
  // We check if the product's defined series or product master title contains this Product Code.
  // For safety, we also extract letters from product's batchNumberSeries.
  const productSeriesUpper = (product.batchNumberSeries || '').toUpperCase();
  const productTitleUpper = (product.title || '').toUpperCase();
  
  const matchesSeries = productSeriesUpper.includes(enteredProdCode);
  const matchesTitle = productTitleUpper.includes(enteredProdCode);
  
  // Also try to parse the product's own batchNumberSeries directly
  let productCodeFromMaster = '';
  const parsedMasterSeries = validateBatchNumber(product.batchNumberSeries || '');
  if (parsedMasterSeries.isValid && parsedMasterSeries.productCode) {
    productCodeFromMaster = parsedMasterSeries.productCode.toUpperCase();
  }

  const isProdCodeValid = 
    matchesSeries || 
    matchesTitle || 
    (productCodeFromMaster && enteredProdCode === productCodeFromMaster) ||
    // Support prefix/similarity matching for legacy seeds
    productSeriesUpper.replace(/[^A-Z]/g, '').includes(enteredProdCode) ||
    !product.batchNumberSeries;

  if (!isProdCodeValid) {
    errors.push(`Product Code "${enteredProdCode}" does NOT match selected Product Master (Title: "${product.title}").`);
  }

  // 2. Verify Stage Code belongs to the selected product (for appropriate formats like A, C-G)
  if (enteredStageCode) {
    const masterStageVal = (product.stage || '').toUpperCase();
    const stageValForm = (selectedStageForm || '').toUpperCase();
    
    const stageItems = [
      ...masterStageVal.split(',').map(s => s.trim()),
      ...stageValForm.split(',').map(s => s.trim())
    ].filter(Boolean);

    // Check if the exact alphanumeric parsed stageCode is inside any of the product's valid stages,
    // or vice versa (e.g. if the stage is "14" and we entered "14", or stage is "Production - Stage 14").
    const isStageValid = stageItems.some(item => 
      item === enteredStageCode || 
      item.includes(enteredStageCode) || 
      enteredStageCode.includes(item) ||
      // Also match semantic words e.g. "Stage 08" or "08-micronization"
      item.replace(/[^A-Z0-9]/ig, '').includes(enteredStageCode)
    );

    if (!isStageValid && stageItems.length > 0) {
      errors.push(`Stage Code "${enteredStageCode}" does NOT belong to the selected product's stages (${stageItems.join(', ')}).`);
    }
  }

  // 3. Verify Batch Type matches allowed categories for the product
  // Product types: API (Types A, B) vs Intermediate (Types C, D, E, F, G)
  const productTypeVal = (product.type || '').toUpperCase() + ' ' + (selectedTypeForm || '').toUpperCase();
  const isAPIProduct = productTypeVal.includes('API') || productTitleUpper.includes('API');
  const isIntermediateProduct = productTypeVal.includes('INTERMEDIATE') || productTitleUpper.includes('INTERMEDIATE') || productTitleUpper.includes('COUGH') || productTitleUpper.includes('AMOX');

  if (isAPIProduct && batchType && !['A', 'B'].includes(batchType)) {
    errors.push(`Batch type "${parsed.typeName}" is NOT approved for API products. API products only allow Type A or Type B formats.`);
  }

  if (isIntermediateProduct && batchType && !['C', 'D', 'E', 'F', 'G'].includes(batchType)) {
    errors.push(`Batch type "${parsed.typeName}" is NOT approved for Intermediate products. Intermediates only allow Type C, D, E, F, or G formats.`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
