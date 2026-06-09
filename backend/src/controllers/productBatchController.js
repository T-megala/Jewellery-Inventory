import ApiError from '../utils/ApiError.js';
import productBatchService from '../services/productBatchService.js';

const parsePositiveInt = (value, fieldName, defaultValue) => {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
};

export const listBatches = async (req, res) => {
  const data = await productBatchService.listBatches();

  res.status(200).json({
    success: true,
    message: 'Batch list fetched successfully',
    data,
  });
};

export const getBatchProducts = async (req, res) => {
  const batchId = Number.parseInt(req.params.batchId, 10);

  if (!Number.isInteger(batchId) || batchId < 1) {
    throw new ApiError(400, 'Invalid batch ID');
  }

  const page = parsePositiveInt(req.query.page, 'page', 1);
  const limit = parsePositiveInt(req.query.limit, 'limit', 20);

  if (limit > 100) {
    throw new ApiError(400, 'limit cannot exceed 100');
  }

  const search = req.query.search ? String(req.query.search).trim() : null;

  const result = await productBatchService.getBatchProducts(batchId, {
    search,
    page,
    limit,
    offset: (page - 1) * limit,
  });

  res.status(200).json({
    success: true,
    message: 'Batch products fetched successfully',
    batchId,
    pagination: result.pagination,
    data: result.data,
  });
};

export const compareBatches = async (req, res) => {
  const currentBatchId = Number.parseInt(req.query.currentBatchId, 10);
  const previousBatchId = Number.parseInt(req.query.previousBatchId, 10);

  if (!Number.isInteger(currentBatchId) || currentBatchId < 1) {
    throw new ApiError(400, 'Query parameter "currentBatchId" is required');
  }

  if (!Number.isInteger(previousBatchId) || previousBatchId < 1) {
    throw new ApiError(400, 'Query parameter "previousBatchId" is required');
  }

  if (currentBatchId === previousBatchId) {
    throw new ApiError(400, 'currentBatchId and previousBatchId must be different');
  }

  const result = await productBatchService.compareBatches(
    currentBatchId,
    previousBatchId
  );

  res.status(200).json({
    success: true,
    message: 'Batch comparison fetched successfully',
    ...result,
  });
};
