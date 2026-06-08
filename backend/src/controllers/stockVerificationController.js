import stockVerificationService from '../services/stockVerificationService.js';

const validateUploadRequest = (body) => {
  if (body.datetimeMillis === undefined || body.datetimeMillis === null) {
    return 'datetimeMillis is mandatory';
  }

  if (typeof body.datetimeMillis !== 'number' || !Number.isFinite(body.datetimeMillis)) {
    return 'datetimeMillis must be a valid number';
  }

  if (!body.product || typeof body.product !== 'object') {
    return 'product is mandatory';
  }

  if (!body.product.name || !String(body.product.name).trim()) {
    return 'product is mandatory';
  }

  if (!body.subProduct || typeof body.subProduct !== 'object') {
    return 'subProduct is mandatory';
  }

  if (!body.subProduct.name || !String(body.subProduct.name).trim()) {
    return 'subProduct is mandatory';
  }

  if (!body.center || typeof body.center !== 'object') {
    return 'center is mandatory';
  }

  if (!body.center.name || !String(body.center.name).trim()) {
    return 'center is mandatory';
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
    productName: String(product.name).trim(),
    subProductName: String(subProduct.name).trim(),
    centerName: String(center.name).trim(),
    tagData,
  });

  res.status(200).json({
    success: true,
    message: 'Stock verification data uploaded successfully',
    verificationId: result.verificationId,
    totalExpected: result.totalExpected,
    totalScanned: result.totalScanned,
    foundCount: result.foundCount,
    missingCount: result.missingCount,
    newCount: result.newCount,
  });
};
