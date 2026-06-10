import multer from 'multer';
import ApiError from '../utils/ApiError.js';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  const allowedExtensions = ['.xlsx'];
  const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

  if (
    allowedMimeTypes.includes(file.mimetype) ||
    allowedExtensions.includes(extension)
  ) {
    cb(null, true);
    return;
  }

  cb(new ApiError(400, 'Only Excel files (.xlsx) are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Number.parseInt(process.env.IMPORT_MAX_FILE_MB ?? '50', 10) * 1024 * 1024 || 50 * 1024 * 1024,
  },
});

export default upload;
