// Stellar / Soroban wallet helpers for the web app.
//
// Mirrors the EVM embedded-wallet model (see services/walletProvider.js): each
// account gets a DETERMINISTIC Stellar address derived from their email. The
// backend can recompute the secret (custodial MVP — same trade-off as the AES
// encrypted EVM key), so it can read balances, fund testnet accounts and sign
// withdrawals without the user connecting an external wallet.
//
// Settlement asset on Stellar is Circle USDC (SEP-41 SAC, 7 decimals). Native
// XLM is only used for the account reserve + network fees.
const crypto = require("crypto");
const {
  Account,
  Asset,
  Contract,
  Horizon,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  rpc: sdkRpc,
  nativeToScVal,
  scValToNative,
} = require("@stellar/stellar-sdk");
const config = require("../config/soroban");

const USDC_DECIMALS = 7;
// Stellar testnet friendbot — GET https://friendbot.stellar.org?addr=<pubkey>
const FRIENDBOT_URL = process.env.SOROBAN_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const XLM_RESERVE_STROOPS = 1_0000000; // ~1 XLM held back so the account stays alive

function configured() {
  return config.configured;
}

function userSeed(user) {
  return `hybridagent:stellar:${String(user?.email || user?.wallet_address || "").toLowerCase().trim()}`;
}

// Deterministic ed25519 keypair for a user. Same email == same Stellar address.
function keypairFor(user) {
  if (!user?.email && !user?.wallet_address) {
    throw new Error("cannot derive Stellar wallet without email or wallet address");
  }
  const hash = crypto.createHash("sha256").update(userSeed(user)).digest();
  return Keypair.fromRawEd25519Seed(hash);
}

function addressFor(user) {
  return keypairFor(user).publicKey();
}

function isValidAddress(addr) {
  return (
    typeof addr === "string" &&
    (StrKey.isValidEd25519PublicKey(addr) || StrKey.isValidContract(addr))
  );
}

function horizon() {
  return new Horizon.Server(config.horizonUrl);
}

function rpc() {
  return new sdkRpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith("http://"),
  });
}

// Read-only Soroban function call via simulateTransaction (no signer needed for
// view functions). Returns the native-decoded return value.
async function readContract(contractId, method, ...nativeArgs) {
  const dummy = new Account(Keypair.random().publicKey(), "0");
  const tx = new TransactionBuilder(dummy, {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args: nativeArgs.map((a) => (a && a.toScVal ? a.toScVal() : nativeToScVal(a))),
      })
    )
    .setTimeout(0)
    .build();

  const sim = await rpc().simulateTransaction(tx);
  const retval = sim?.result?.retval;
  if (!retval) throw new Error(`soroban read ${method} failed: ${sim?.error || "no return value"}`);
  return scValToNative(retval);
}

// Underlying classic asset the USDC SAC wraps.
// The deployed SAC at CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
// is the canonical Stellar testnet USDC issued by Circle:
//   USDC : GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
// We derive the issuer from the SAC address deterministically so it always
// matches, regardless of the SOROBAN_USDC_ADDRESS env var.
async function usdcClassicAsset() {
  // Derive the classic asset from the SAC contract ID configured in the env.
  // Asset.fromContractId() reverses the SAC derivation: contract -> Asset.
  try {
    const asset = Asset.fromContractId(config.usdcAddress);
    return asset;
  } catch {
    // Fallback: hardcoded Circle testnet USDC issuer (matches CBIELTK6... SAC)
    return new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
  }
}

async function getAccount(pubkey) {
  try {
    return await horizon().accounts().accountId(pubkey).call();
  } catch {
    return null; // account not yet funded on Stellar
  }
}

// XLM (native) balance + USDC-on-Stellar (SAC) balance + trustline status.
async function getBalances(pubkey) {
  const out = {
    funded: false,
    xlm: "0",
    xlmStroops: "0",
    usdcRaw: "0",
    hasUsdcTrustline: false,
    usdcError: null,
  };

  const account = await getAccount(pubkey);
  if (!account) return out;

  out.funded = true;
  for (const b of account.balances || []) {
    if (b.asset_type === "native") out.xlm = b.balance || "0";
    if (b.asset_code === "USDC") out.hasUsdcTrustline = true;
  }
  out.xlmStroops = String(Math.round(Number(out.xlm) * 1e7));

  try {
    const sac = await rpc().getSACBalance(
      pubkey,
      new Contract(config.usdcAddress),
      config.networkPassphrase
    );
    out.usdcRaw = sac?.balanceEntry?.amount || "0";
  } catch (e) {
    out.usdcError = e.message;
  }
  return out;
}

function formatUsdc(rawStr) {
  try {
    return (Number(rawStr || "0") / 1e7).toLocaleString(undefined, { maximumFractionDigits: 7 });
  } catch {
    return "0";
  }
}

async function hasAssetTrustline(pubkey, asset) {
  const account = await getAccount(pubkey);
  if (!account) return false;
  return (account.balances || []).some(
    (b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer()
  );
}

// Add a classic trustline for the USDC asset if the account does not have one
// yet. Returns true when a trustline was newly created.
async function ensureUsdcTrustline(keypair) {
  const pubkey = keypair.publicKey();
  const asset = await usdcClassicAsset();
  if (await hasAssetTrustline(pubkey, asset)) return false;

  const server = horizon();
  const txAccount = await server.loadAccount(pubkey);
  const tx = new TransactionBuilder(txAccount, {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);
  return true;
}

// Fund a brand-new derived Stellar account (friendbot, testnet) and give it the
// USDC trustline so it can hold/receive settlement funds.
async function activate(keypair) {
  const pubkey = keypair.publicKey();
  const account = await getAccount(pubkey);
  if (!account) {
    // Use a direct HTTP GET to the Stellar testnet friendbot
    try {
      const friendbotRes = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(pubkey)}`);
      if (!friendbotRes.ok) {
        const errBody = await friendbotRes.text().catch(() => '');
        throw new Error(`friendbot HTTP ${friendbotRes.status}: ${errBody}`);
      }
    } catch (e) {
      throw new Error(`Friendbot funding failed (is the Stellar testnet reachable?): ${e.message}`);
    }
  }
  await ensureUsdcTrustline(keypair);
  return getBalances(pubkey);
}

// Withdraw XLM('xlm') or USDC('usdc') from a user's derived wallet to `to`.
// `amountStr` is in display units; omit for the full spendable balance.
async function transfer({ keypair, to, asset, amountStr }) {
  if (!asset || !["xlm", "usdc"].includes(asset)) throw new Error("asset must be 'xlm' or 'usdc'");
  if (!isValidAddress(to)) throw new Error("invalid Stellar destination address");

  const from = keypair.publicKey();
  const balances = await getBalances(from);
  if (!balances.funded) throw new Error("Stellar wallet not activated — activate it first");

  let payment;
  if (asset === "usdc") {
    await ensureUsdcTrustline(keypair);
    const raw = amountStr ? Math.round(Number(amountStr) * 1e7) : Number(balances.usdcRaw);
    if (!(raw > 0)) throw new Error("nothing to withdraw in USDC on Stellar");
    const usdc = await usdcClassicAsset();
    payment = Operation.payment({ destination: to, asset: usdc, amount: String(raw / 1e7) });
  } else {
    const spendable = Math.max(0, Number(balances.xlmStroops) - XLM_RESERVE_STROOPS);
    const raw = amountStr ? Math.round(Number(amountStr) * 1e7) : spendable;
    if (!(raw > 0)) throw new Error("insufficient XLM (keeping reserve)");
    payment = Operation.payment({ destination: to, asset: Asset.native(), amount: String(raw / 1e7) });
  }

  const server = horizon();
  const txAccount = await server.loadAccount(from);
  const tx = new TransactionBuilder(txAccount, {
    fee: "100",
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(payment)
    .setTimeout(120)
    .build();
  tx.sign(keypair);

  const result = await server.submitTransaction(tx);
  return { hash: result.hash, to, asset, amount: payment.amount };
}

// Aggregate view for the authenticated user (address + balances + readiness).
async function getForUser(user) {
  const keypair = keypairFor(user);
  const pubkey = keypair.publicKey();
  let balances = { error: "stellar not configured" };
  if (configured()) {
    try {
      balances = await getBalances(pubkey);
    } catch (e) {
      balances = { error: e.message };
    }
  }
  return {
    configured: configured(),
    address: pubkey,
    network: config.networkPassphrase,
    usdcAddress: config.usdcAddress,
    ...balances,
    usdcDisplay: balances?.usdcRaw != null ? formatUsdc(balances.usdcRaw) : null,
    active: Boolean(balances?.funded && balances?.hasUsdcTrustline),
  };
}

module.exports = {
  configured,
  keypairFor,
  addressFor,
  isValidAddress,
  getBalances,
  getForUser,
  activate,
  transfer,
  readContract,
  usdcClassicAsset,
  formatUsdc,
  USDC_DECIMALS,
};