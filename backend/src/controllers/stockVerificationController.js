import stockVerificationService from '../services/stockVerificationService.js';
import { isAllProducts } from '../utils/verificationScope.js';

const validateScopeObject = (obj, fieldName, { required = true } = {}) => {
  if (obj === undefined || obj === null) {
    return required ? `${fieldName} is mandatory` : null;
  }

  if (typeof obj !== 'object') {
    return `${fieldName} must be an object`;
  }

  const hasId = obj.id !== undefined && obj.id !== null;
  const hasName = obj.name && String(obj.name).trim();

  if (!hasId && !hasName) {
    return `${fieldName} must include id and/or name`;
  }

  if (hasId && (typeof obj.id !== 'number' || !Number.isFinite(obj.id))) {
    return `${fieldName}.id must be a valid number`;
  }

  return null;
};

const validateUploadRequest = (body) => {
  if (body.datetimeMillis === undefined || body.datetimeMillis === null) {
    return 'datetimeMillis is mandatory';
  }

  if (typeof body.datetimeMillis !== 'number' || !Number.isFinite(body.datetimeMillis)) {
    return 'datetimeMillis must be a valid number';
  }

  const productError = validateScopeObject(body.product, 'product');
  if (productError) {
    return productError;
  }

  if (isAllProducts(body.product)) {
    // Scenario 5: all products — subProduct and center are optional/ignored
  } else {
    const subProductError = validateScopeObject(body.subProduct, 'subProduct');
    if (subProductError) {
      return subProductError;
    }

    if (body.center !== undefined && body.center !== null) {
      const centerError = validateScopeObject(body.center, 'center', {
        required: false,
      });
      if (centerError) {
        return centerError;
      }
    }
  }

  if (!Array.isArray(body.tagData)) {
    return 'tagData must be a non-empty array';
  }

  if (body.tagData.length === 0) {
    return 'tagData must be a non-empty array';
  }

  const hasInvalidTag = body.tagData.some(
    (tag) => typeof tag !== 'string' || !tag.trim()
  );

  if (hasInvalidTag) {
    return 'Each tag in tagData must be a non-empty string';
  }

  return null;
};

export const uploadStockVerification = async (req, res) => {
  const validationError = validateUploadRequest(req.body);

  if (validationError) {
    return res.status(400).json({
      success: false,
      message: validationError,
    });
  }

  const { datetimeMillis, product, subProduct, center, tagData } = req.body;

  const result = await stockVerificationService.uploadStockVerification({
    datetimeMillis,
    product,
    subProduct: isAllProducts(product) ? null : subProduct,
    center: isAllProducts(product) ? null : center,
    tagData,
  });

  res.status(200).json({
    success: true,
    message: result.reused
      ? 'Stock verification updated successfully'
      : 'Stock verification data uploaded successfully',
    verificationId: result.verificationId,
    reused: result.reused,
    totalExpected: result.totalExpected,
    totalScanned: result.totalScanned,
    foundCount: result.foundCount,
    missingCount: result.missingCount,
    newCount: result.newCount,
  });
};
