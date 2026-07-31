// Minimal JSON document store backed by Filebase (S3-compatible, IPFS-pinned).
// Replaces PostgreSQL for all structured data storage.
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const config = require("./index");

let _client = null;
function s3() {
  if (!_client) {
    _client = new S3Client({
      endpoint: "https://s3.filebase.com",
      region: "us-east-1",
      credentials: {
        accessKeyId: config.filebase.accessKey,
        secretAccessKey: config.filebase.secretKey,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

const BUCKET = () => config.filebase.bucket;

// Read a JSON object from Filebase. Returns null if not found.
async function get(key) {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) {
    if (
      e.name === "NoSuchKey" ||
      e.Code === "NoSuchKey" ||
      e.$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw e;
  }
}

// Write a JSON object to Filebase.
async function put(key, value) {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
    })
  );
}

// Delete an object. Silently ignores missing keys.
async function del(key) {
  try {
    await s3().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
  } catch {
    /* ignore */
  }
}

// List object keys under a prefix, in ascending lexicographic order.
// `maxKeys` caps how many keys to return so callers never enumerate the whole
// prefix; `startAfter` restricts the listing to keys strictly greater than it
// (range scan support for cursor pagination).
async function listKeys(prefix, { maxKeys, startAfter } = {}) {
  const keys = [];
  let token;
  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: BUCKET(),
        Prefix: prefix,
        ...(startAfter !== undefined ? { StartAfter: startAfter } : {}),
        ...(maxKeys !== undefined ? { MaxKeys: maxKeys } : {}),
        ...(token ? { ContinuationToken: token } : {}),
      })
    );
    for (const obj of res.Contents || []) keys.push(obj.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && (maxKeys === undefined || keys.length < maxKeys));
  return maxKeys === undefined ? keys : keys.slice(0, maxKeys);
}

// Fetch all JSON objects under a prefix in parallel.
async function getAll(prefix) {
  const keys = await listKeys(prefix);
  const results = await Promise.all(keys.map((k) => get(k)));
  return results.filter(Boolean);
}

module.exports = { get, put, del, listKeys, getAll };
