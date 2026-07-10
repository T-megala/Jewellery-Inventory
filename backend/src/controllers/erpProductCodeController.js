import erpProductCodeService from '../services/erpProductCodeService.js';
import ApiError from '../utils/ApiError.js';

export const listProductCodes = async (req, res) => {
  const includeInactive = String(req.query?.includeInactive ?? '').toLowerCase() === 'true';

  const data = await erpProductCodeService.listProductCodes({ includeInactive });

  res.status(200).json({
    success: true,
    message: 'Product codes fetched successfully',
    data,
  });
};

export const getProductCode = async (req, res) => {
  const data = await erpProductCodeService.getProductCode(req.params.proCode);

  res.status(200).json({
    success: true,
    message: 'Product code fetched successfully',
    data,
  });
};

export const mergeProductCodes = async (req, res) => {
  const body = req.body ?? {};
  const rows = Array.isArray(body) ? body : body.codes ?? body.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, 'Request body must be an array or { codes: [...] }');
  }

  const result = await erpProductCodeService.mergeProductCodes(rows);

  res.status(200).json({
    success: true,
    message: 'Product codes merged successfully',
    data: result,
  });
};

export const importProductCodes = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Excel file is required. Use form field name "file"');
  }

  const result = await erpProductCodeService.importProductCodesFromExcel(req.file.buffer);

  res.status(200).json({
    success: true,
    message: 'Product code catalog imported successfully',
    data: result,
  });
};
