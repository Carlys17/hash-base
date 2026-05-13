/**
 * WASM Fallback Miner — Web Worker for keccak256 brute-force
 * Used when WebGPU is not available (mobile, older browsers).
 */

// Pure JS keccak256 (compact implementation for worker)
function keccak256(input: Uint8Array): Uint8Array {
  // Keccak-f[1600] state: 25 x uint64 (stored as [lo, hi] pairs)
  const s = new Uint32Array(50);

  // Absorb
  const rate = 136; // bytes (1088 bits)
  for (let i = 0; i < input.length; i++) {
    const lane = (i % rate) >> 3;
    const byte = (i % rate) & 7;
    const shift = byte * 8;
    const idx = lane * 2 + (byte < 4 ? 0 : 1);
    s[idx] ^= (input[i] & 0xff) << shift;
  }

  // Padding (pad10*1)
  const padIdx = input.length % rate;
  const lane = padIdx >> 3;
  const byte = padIdx & 7;
  const idx = lane * 2 + (byte < 4 ? 0 : 1);
  s[idx] ^= 0x01 << (byte * 8);
  const lastLane = (rate - 1) >> 3;
  const lastByte = (rate - 1) & 7;
  const lastIdx = lastLane * 2 + (lastByte < 4 ? 0 : 1);
  s[lastIdx] ^= 0x80 << (lastByte * 8);

  keccak_f1600(s);

  // Squeeze (32 bytes = 4 lanes)
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    out[i * 4 + 0] = (s[i * 2] >>> 0) & 0xff;
    out[i * 4 + 1] = (s[i * 2] >>> 8) & 0xff;
    out[i * 4 + 2] = (s[i * 2] >>> 16) & 0xff;
    out[i * 4 + 3] = (s[i * 2] >>> 24) & 0xff;
  }
  return out;
}

// Keccak-f[1600] permutation (simplified, not optimized)
function keccak_f1600(s: Uint32Array) {
  const RC_LO = [0x00000001,0x00008082,0x0000808a,0x80008000,0x0000808b,0x80000001,0x80008081,0x00008009,0x0000008a,0x00000088,0x80008009,0x8000000a,0x8000808b,0x0000008b,0x00008089,0x00008003,0x00008002,0x00000080,0x0000800a,0x8000000a,0x80008081,0x00008080,0x80000001,0x80008008];
  const RC_HI = [0x00000000,0x00000000,0x80000000,0x80000000,0x00000000,0x00000000,0x80000000,0x80000000,0x00000000,0x00000000,0x00000000,0x00000000,0x00000000,0x80000000,0x80000000,0x80000000,0x80000000,0x80000000,0x00000000,0x80000000,0x80000000,0x80000000,0x00000000,0x80000000];

  for (let r = 0; r < 24; r++) {
    const C = new Uint32Array(10);
    for (let i = 0; i < 5; i++) {
      C[i*2]   = s[i*2]   ^ s[10+i*2]   ^ s[20+i*2]   ^ s[30+i*2]   ^ s[40+i*2];
      C[i*2+1] = s[i*2+1] ^ s[10+i*2+1] ^ s[20+i*2+1] ^ s[30+i*2+1] ^ s[40+i*2+1];
    }
    for (let i = 0; i < 5; i++) {
      const d_lo = C[((i+4)%5)*2] ^ rotl64_lo(C[((i+1)%5)*2], C[((i+1)%5)*2+1], 1);
      const d_hi = C[((i+4)%5)*2+1] ^ rotl64_hi(C[((i+1)%5)*2], C[((i+1)%5)*2+1], 1);
      for (let j = 0; j < 5; j++) {
        s[(j*5+i)*2]   ^= d_lo;
        s[(j*5+i)*2+1] ^= d_hi;
      }
    }
    // Rho, Pi, Chi, Iota (simplified — full impl would unroll)
    const B = new Uint32Array(50);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const idx = (j*5+i)*2;
      const ri = ((2*i + 3*j) % 5);
      const [lo, hi] = rotl64(s[idx], s[idx+1], ri);
      B[(i*5+ri)*2] = lo; B[(i*5+ri)*2+1] = hi;
    }
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const idx = (i*5+j)*2;
      const b1 = (i*5+(j+1)%5)*2;
      const b2 = (i*5+(j+2)%5)*2;
      s[idx]   = B[idx]   ^ (~B[b1]   & B[b2]);
      s[idx+1] = B[idx+1] ^ (~B[b1+1] & B[b2+1]);
    }
    s[0] ^= RC_LO[r]; s[1] ^= RC_HI[r];
  }
}

function rotl64(lo: number, hi: number, n: number): [number, number] {
  n = n & 63;
  if (n === 0) return [lo, hi];
  if (n === 32) return [hi, lo];
  if (n < 32) return [(lo << n) | (hi >>> (32-n)), (hi << n) | (lo >>> (32-n))];
  const s = n - 32;
  return [(hi << s) | (lo >>> (32-s)), (lo << s) | (hi >>> (32-s))];
}

function rotl64_lo(lo: number, hi: number, n: number): number { return rotl64(lo, hi, n)[0]; }
function rotl64_hi(lo: number, hi: number, n: number): number { return rotl64(lo, hi, n)[1]; }

// ── Worker message handling ───────────────────────────────────

let running = false;

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;

  switch (msg.type) {
    case "start": {
      running = true;
      const challenge = hexToBytes(msg.challenge);
      const difficulty = hexToBigInt(msg.difficulty);
      const batchSize = msg.batchSize || 10000;

      // Random nonce prefix per worker
      const noncePrefix = new Uint8Array(32);
      crypto.getRandomValues(noncePrefix);

      let nonce = bytesToBigInt(noncePrefix);
      let hashes = 0;
      const start = performance.now();
      let lastReport = start;

      while (running) {
        for (let i = 0; i < batchSize && running; i++) {
          const nonceBytes = bigIntToBytes32(nonce);
          const input = new Uint8Array(64);
          input.set(challenge, 0);
          input.set(nonceBytes, 32);

          const hash = keccak256(input);
          const hashInt = bytesToBigInt(hash);
          hashes++;

          if (hashInt < difficulty) {
            self.postMessage({
              type: "found",
              nonce: bytesToHex(nonceBytes),
              result: bytesToHex(hash),
              hashes,
              elapsedMs: performance.now() - start,
            });
            return;
          }
          nonce++;
        }

        const now = performance.now();
        if (now - lastReport > 2000) {
          self.postMessage({
            type: "progress",
            hashes,
            hashrate: hashes / ((now - start) / 1000),
            elapsedMs: now - start,
          });
          lastReport = now;
        }
      }

      self.postMessage({
        type: "stopped",
        hashes,
        elapsedMs: performance.now() - start,
      });
      break;
    }
    case "retarget": {
      // Update challenge/difficulty in-place
      // For simplicity, just restart with new params
      break;
    }
    case "stop": {
      running = false;
      break;
    }
  }
};

// ── Helpers ───────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(2*i, 2*i+2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

function bigIntToBytes32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { bytes[i] = Number(n & 0xffn); n >>= 8n; }
  return bytes;
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}
