const db = require("../config/filebaseDB");
const { v4: uuidv4 } = require("uuid");

const CONV_RECORDS = "db/conversations/records/";
const CONV_LB_IDX = "db/conversations/listing-buyer/";
const CONV_USER_IDX = "db/conversations/user-index/";
const MSG_PREFIX = "db/messages/";

// S3 lists keys in ascending lexicographic order, so message keys embed an
// *inverted* timestamp: `${reversedEpochMs}_${id}.json`. Listing a conversation
// therefore comes back newest-first and the most recent `limit` messages are
// read with one ranged ListObjects + `limit` GetObjects — instead of listing
// every key, fetching every message object, and only then slicing.
const MAX_EPOCH = Number.MAX_SAFE_INTEGER;
const KEY_TS_WIDTH = String(MAX_EPOCH).length;
const MESSAGE_KEY_RE = /^\d+_[0-9a-f-]+\.json$/;

function messageKeySuffix(epochMs, id) {
  return `${String(MAX_EPOCH - epochMs).padStart(KEY_TS_WIDTH, "0")}_${id}.json`;
}

async function getOrCreate(listing, buyerId) {
  const idxKey = `${CONV_LB_IDX}${listing.id}/${buyerId}.json`;
  const existing = await db.get(idxKey);
  if (existing) {
    const conv = await db.get(`${CONV_RECORDS}${existing.id}.json`);
    if (conv) return conv;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const conv = {
    id,
    listing_id: listing.id,
    buyer_id: buyerId,
    agent_id: listing.created_by,
    created_at: now,
  };

  await db.put(`${CONV_RECORDS}${id}.json`, conv);
  await db.put(idxKey, { id });
  await db.put(`${CONV_USER_IDX}${buyerId}/${id}.json`, {});
  await db.put(`${CONV_USER_IDX}${listing.created_by}/${id}.json`, {});
  return conv;
}

async function getById(id) {
  return db.get(`${CONV_RECORDS}${id}.json`);
}

function isMember(conversation, userId) {
  return (
    conversation &&
    (String(conversation.buyer_id) === String(userId) ||
      String(conversation.agent_id) === String(userId))
  );
}

async function listForUser(userId) {
  const userModel = require("./userModel");
  const keys = await db.listKeys(`${CONV_USER_IDX}${userId}/`);
  const convIds = keys.map((k) => k.split("/").pop().replace(".json", ""));
  const convs = await Promise.all(convIds.map((id) => db.get(`${CONV_RECORDS}${id}.json`)));

  const enriched = await Promise.all(
    convs.filter(Boolean).map(async (conv) => {
      const [listing, buyer, agent, lastPage] = await Promise.all([
        db.get(`db/listings/records/${conv.listing_id}.json`),
        userModel.findById(conv.buyer_id),
        userModel.findById(conv.agent_id),
        messages(conv.id, { limit: 1 }),
      ]);
      const lastMsg = lastPage.messages[0];
      return {
        ...conv,
        listing_title: listing?.title || null,
        listing_image: listing?.image || null,
        buyer_name: buyer?.full_name || null,
        agent_name: agent?.full_name || null,
        agent_avatar: agent?.avatar || null,
        last_message: lastMsg?.body || null,
        last_at: lastMsg?.created_at || conv.created_at,
      };
    })
  );
  return enriched.sort((a, b) => new Date(b.last_at) - new Date(a.last_at));
}

// Paginated message history for a conversation.
// - `limit`  max messages to return (default 50, clamped to [1, 100]).
// - `before` opaque cursor (the message key suffix from a previous page's
//   `nextCursor`); when set, only messages strictly older than it are returned.
// Returns `{ messages, nextCursor }` where `messages` is oldest → newest and
// `nextCursor` is the cursor for the page of older messages (null when the
// conversation has no older messages).
async function messages(conversationId, { limit = 50, before } = {}) {
  const max = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
  const prefix = `${MSG_PREFIX}${conversationId}/`;
  const startAfter =
    before && MESSAGE_KEY_RE.test(before) ? `${prefix}${before}` : undefined;

  // Fetch one extra key to detect whether an older page exists, so the client
  // never has to issue a trailing empty request just to learn history has ended.
  const keys = await db.listKeys(prefix, { maxKeys: max + 1, startAfter });
  const hasMore = keys.length > max;
  const pageKeys = keys.slice(0, max);

  const msgs = await Promise.all(pageKeys.map((k) => db.get(k)));
  const page = msgs.filter(Boolean); // newest → oldest (key order)
  const nextCursor =
    hasMore && pageKeys.length ? pageKeys[pageKeys.length - 1].split("/").pop() : null;
  return { messages: page.reverse(), nextCursor };
}

async function addMessage(conversationId, senderId, body) {
  const userModel = require("./userModel");
  const id = uuidv4();
  const now = new Date().toISOString();
  const sender = await userModel.findById(senderId);
  const msg = {
    id,
    conversation_id: conversationId,
    sender_id: senderId,
    body,
    created_at: now,
    sender_name: sender?.full_name || null,
    sender_avatar: sender?.avatar || null,
  };
  await db.put(`${MSG_PREFIX}${conversationId}/${messageKeySuffix(Date.parse(now), id)}`, msg);
  return msg;
}

module.exports = { getOrCreate, getById, isMember, listForUser, messages, addMessage };
