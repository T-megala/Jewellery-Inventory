import ApiError from '../utils/ApiError.js';
import productImportService from '../services/productImportService.js';
import { getRequestParam } from '../utils/requestParams.js';

const isAsyncImport = (req) => {
  const value = getRequestParam(req, 'async', 'asyncImport');
  if (!value) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

export const importProducts = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Excel file is required. Use form field name "file"');
  }

  const uploadedBy = req.body?.uploadedBy
    ? String(req.body.uploadedBy).trim()
    : null;

  if (isAsyncImport(req)) {
    const job = productImportService.startAsyncImport(
      req.file.buffer,
      uploadedBy
    );

    return res.status(202).json({
      success: true,
      message: 'Import started',
      data: {
        jobId: job.id,
        status: job.status,
        statusUrl: `/api/v1/products/import/status/${job.id}`,
      },
    });
  }

  const result = await productImportService.importProductsFromExcel(
    req.file.buffer,
    uploadedBy
  );

  res.status(200).json({
    success: true,
    message: 'Import completed successfully',
    data: result,
  });
};

export const getImportStatus = async (req, res) => {
  const job = productImportService.getImportJobStatus(req.params.jobId);

  if (!job) {
    throw new ApiError(404, 'Import job not found');
  }

  res.status(200).json({
    success: true,
    message: 'Import status fetched successfully',
    data: {
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      message: job.message,
      processed: job.processed,
      total: job.total,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
  });
};
