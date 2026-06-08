import ApiError from '../utils/ApiError.js';
import productImportService from '../services/productImportService.js';

export const importProducts = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Excel file is required. Use form field name "file"');
  }

  const result = await productImportService.importProductsFromExcel(req.file.buffer);

  res.status(200).json({
    success: true,
    message: 'Import completed successfully',
    data: result,
  });
};
