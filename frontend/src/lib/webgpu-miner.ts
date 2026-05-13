/**
 * WebGPU Miner — keccak256 brute-force on GPU
 * Falls back to WASM worker if WebGPU unavailable.
 */

// ── Helpers ───────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function challengeToU32(bytes: Uint8Array): Uint32Array {
  const t = new Uint32Array(8);
  for (let i = 0; i < 8; i++) t[i] = bytes[4*i] | bytes[4*i+1]<<8 | bytes[4*i+2]<<16 | bytes[4*i+3]<<24;
  return t;
}

function difficultyToU32(bytes: Uint8Array): Uint32Array {
  const t = new Uint32Array(8);
  for (let i = 0; i < 8; i++) t[i] = (bytes[4*i]<<24 | bytes[4*i+1]<<16 | bytes[4*i+2]<<8 | bytes[4*i+3]) >>> 0;
  return t;
}

function parseResult(data: Uint32Array): { found: boolean; nonce: Uint8Array; hash: Uint8Array } {
  const found = data[0] > 0;
  const nonce = new Uint8Array(32);
  if (found) {
    const lo = data[2] >>> 0, hi = data[1] >>> 0;
    nonce[24] = lo>>>24&255; nonce[25] = lo>>>16&255; nonce[26] = lo>>>8&255; nonce[27] = lo&255;
    nonce[28] = hi>>>24&255; nonce[29] = hi>>>16&255; nonce[30] = hi>>>8&255; nonce[31] = hi&255;
  }
  const hash = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const v = data[4 + i] >>> 0;
    hash[4*i] = v>>>24&255; hash[4*i+1] = v>>>16&255; hash[4*i+2] = v>>>8&255; hash[4*i+3] = v&255;
  }
  return { found, nonce, hash };
}

// ── WebGPU availability check ─────────────────────────────────

export async function hasWebGPU(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.gpu) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return !!adapter;
  } catch { return false; }
}

// ── WebGPU Miner Class ───────────────────────────────────────

export interface MinerCallbacks {
  onProgress: (data: { hashes: number; hashrate: number; elapsedMs: number }) => void;
  onFound: (data: { nonce: string; hash: string; hashes: number; elapsedMs: number }) => void;
  onError?: (error: string) => void;
}

export class WebGPUMiner {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private uniformBuf: GPUBuffer | null = null;
  private resultBuf: GPUBuffer | null = null;
  private stagingBuf: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private running = false;
  private totalHashes = 0;
  private startedAt = 0;
  private lastTick = 0;
  private emaHashrate = 0;
  private workgroups = 16384;
  private loopPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (!navigator.gpu) throw new Error("WebGPU not available");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No GPU adapter");
    this.device = await adapter.requestDevice();
    this.device.lost.then(() => { this.running = false; });

    // Load shader
    const shaderCode = await fetch("/keccak.wgsl").then(r => r.text());
    const shaderModule = this.device.createShaderModule({ code: shaderCode });

    this.pipeline = await this.device.createComputePipelineAsync({
      layout: "auto",
      compute: { module: shaderModule, entryPoint: "main" },
    });

    this.uniformBuf = this.device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.resultBuf = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    this.stagingBuf = this.device.createBuffer({ size: 48, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: this.resultBuf } },
      ],
    });
  }

  async start(challengeHex: string, difficultyHex: string, callbacks: MinerCallbacks): Promise<void> {
    if (!this.device || !this.pipeline || !this.uniformBuf || !this.resultBuf || !this.stagingBuf || !this.bindGroup) {
      throw new Error("WebGPUMiner not initialized");
    }

    if (this.loopPromise) {
      this.running = false;
      await this.loopPromise;
    }

    this.running = true;
    this.totalHashes = 0;
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
    this.emaHashrate = 0;

    // Random starting nonce
    const randArr = new Uint32Array(2);
    crypto.getRandomValues(randArr);
    let nonceLo = randArr[0] >>> 0;
    let nonceHi = randArr[1] >>> 0;

    const challengeBytes = hexToBytes(challengeHex);
    const difficultyBytes = hexToBytes(difficultyHex);
    const challengeU32 = challengeToU32(challengeBytes);
    const difficultyU32 = difficultyToU32(difficultyBytes);

    const uniformData = new Uint32Array(20);
    uniformData.set(challengeU32, 0);
    uniformData.set(difficultyU32, 8);

    const device = this.device;
    const uniformBuf = this.uniformBuf;
    const resultBuf = this.resultBuf;
    const stagingBuf = this.stagingBuf;
    const pipeline = this.pipeline;
    const bindGroup = this.bindGroup;

    this.loopPromise = (async () => {
      while (this.running) {
        uniformData[16] = nonceLo;
        uniformData[17] = nonceHi;
        uniformData[18] = 0;
        uniformData[19] = 0;
        device.queue.writeBuffer(uniformBuf, 0, uniformData);
        device.queue.writeBuffer(resultBuf, 0, new Uint32Array(12));

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(this.workgroups);
        pass.end();
        encoder.copyBufferToBuffer(resultBuf, 0, stagingBuf, 0, 48);
        device.queue.submit([encoder.finish()]);

        await stagingBuf.mapAsync(GPUMapMode.READ);
        const resultData = new Uint32Array(stagingBuf.getMappedRange().slice(0));
        stagingBuf.unmap();

        const now = performance.now();
        const hashesThisBatch = 64 * this.workgroups * 16;
        this.totalHashes += hashesThisBatch;
        const dt = (now - this.lastTick) / 1000;
        const instantRate = dt > 0 ? hashesThisBatch / dt : 0;
        this.emaHashrate = this.emaHashrate === 0 ? instantRate : this.emaHashrate + 0.25 * (instantRate - this.emaHashrate);
        this.lastTick = now;

        const { found, nonce, hash } = parseResult(resultData);

        if (found) {
          callbacks.onFound({
            nonce: bytesToHex(nonce),
            hash: bytesToHex(hash),
            hashes: this.totalHashes,
            elapsedMs: Math.round(now - this.startedAt),
          });
          this.running = false;
          return;
        }

        callbacks.onProgress({
          hashes: this.totalHashes,
          hashrate: this.emaHashrate,
          elapsedMs: Math.round(now - this.startedAt),
        });

        // Advance nonce
        const newLo = (nonceLo + hashesThisBatch) >>> 0;
        if (newLo < nonceLo) nonceHi = (nonceHi + 1) >>> 0;
        nonceLo = newLo;
      }
    })().finally(() => { this.loopPromise = null; });
  }

  stop(): void {
    this.running = false;
  }

  destroy(): void {
    this.running = false;
    this.uniformBuf?.destroy();
    this.resultBuf?.destroy();
    this.stagingBuf?.destroy();
    this.device?.destroy();
    this.device = null;
  }
}
