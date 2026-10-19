// Code written in javascript

// User input values
const clientSeed = '';
const serverSeed = '';
const nonce = 0;

// Converts a hex string (e.g. "deadbeef") into a Uint8Array of bytes
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Converts a Uint8Array of bytes back into a hex string (e.g. [222, 173, 190, 239] → "deadbeef")
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Computes a HMAC-SHA256 using the Web Crypto API
// keyHex: hex-encoded key (e.g. server seed)
// message: Uint8Array to be signed
async function generateHMAC_SHA256(keyHex, message) {
  const keyBytes = hexToBytes(keyHex);

  // Import raw key for HMAC use
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Generate HMAC signature
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return bytesToHex(new Uint8Array(signature)); // Return signature as hex
}

const MAX_UINT32 = 0xffffffff; // 4,294,967,295
const RANGE = 10001; // 0-10000 inclusive

// Calculate the largest multiple of RANGE that fits in uint32
const MAX_FAIR = MAX_UINT32 - (MAX_UINT32 % RANGE);

// The actual fairness verification function
const validateDiceResult = async (serverSeed, clientSeed, nonce) => {
  // Prepare input message for HMAC: public seed + nonce
  const message = new TextEncoder().encode(`${clientSeed}:${nonce}`);

  // Compute HMAC hash
  const hash = await generateHMAC_SHA256(serverSeed, message);

  let offset = 0;

  while (offset + 8 <= hash.length) {
    // Get 4 bytes from the hash
    const value = parseInt(hash.slice(offset, offset + 8), 16);

    // If value is in the fair range, use it
    if (value < MAX_FAIR) {
      return ((value % RANGE) / 100).toString(); // Actual result is 0-10000, but we display in decimal 0-100
    }

    // Otherwise, try the next 4 bytes
    offset += 8;
  }

  // Fallback if we exhaust the hash (extremely rare, 1.24*10^-46 chance)
  throw new Error('Failed to generate unbiased dice value from hash');
}

// Run the validateDiceResult function if input values are provided
if (serverSeed && serverSeed.trim() !== '' && clientSeed && clientSeed.trim() !== '' && nonce >= 0) {
  validateDiceResult(serverSeed, clientSeed, nonce).then(result => {
    console.log("Dice result:", result);
  });
} else {
  console.log("Please provide valid serverSeed, clientSeed, and nonce (>=0) before running.");
}
