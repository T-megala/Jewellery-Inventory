import stockVerificationService from '../services/stockVerificationService.js';

const validateUploadRequest = (body) => {
  if (body.datetimeMillis === undefined || body.datetimeMillis === null) {
    return 'datetimeMillis is mandatory';
  }

  if (typeof body.datetimeMillis !== 'number' || !Number.isFinite(body.datetimeMillis)) {
    return 'datetimeMillis must be a valid number';
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

  const { datetimeMillis, tagData } = req.body;

  const result = await stockVerificationService.uploadStockVerification({
    datetimeMillis,
    tagData,
  });

  res.status(200).json({
    success: true,
    message: result.reused
      ? 'Stock verification updated successfully'
      : 'Stock verification data uploaded successfully',
    verificationId: result.verificationId,
    reused: result.reused,
    batchId: result.batchId,
    totalExpected: result.totalExpected,
    totalScanned: result.totalScanned,
    foundCount: result.foundCount,
    missingCount: result.missingCount,
    newCount: result.newCount,
  });
};
