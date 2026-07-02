const multer = require("multer");

// In-memory storage; buffers are streamed to Cloudinary in the controller.
module.exports = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("only image or PDF uploads are allowed"));
  },
});
