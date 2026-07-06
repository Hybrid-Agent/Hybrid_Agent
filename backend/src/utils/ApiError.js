// Typed error so controllers can signal HTTP status cleanly.
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = "unauthorized") {
    return new ApiError(401, message);
  }
  static forbidden(message = "forbidden") {
    return new ApiError(403, message);
  }
  static notFound(message = "not found") {
    return new ApiError(404, message);
  }
  static conflict(message) {
    return new ApiError(409, message);
  }
  static tooManyRequests(message) {
    return new ApiError(429, message);
  }
  static internal(message) {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
