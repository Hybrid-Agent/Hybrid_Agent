const rateLimit = require("express-rate-limit");
const config = require("../config");

const rl = config.rateLimit || {};
const windowMs = rl.windowMs || 15 * 60 * 1000;
const max = rl.max || 100;
const authMax = rl.authMax || 10;

const apiLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many requests, slow down" },
});

// Stricter limit for auth endpoints to blunt credential stuffing / brute force.
const authLimiter = rateLimit({
  windowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many auth attempts, try again later" },
});

module.exports = { apiLimiter, authLimiter };
