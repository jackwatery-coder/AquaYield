// water-oracle.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  buffCV,
  uintCV,
  principalCV,
  trueCV,
  falseCV,
} from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_INVALID_FLOW = 102;
const ERR_ORACLE_EXISTS = 103;
const ERR_INVALID_TIMESTAMP = 104;
const ERR_TOO_FREQUENT = 105;
const ERR_INVALID_SOURCE = 106;
const ERR_SIGNATURE_VERIFIED = 107;
const ERR_DATA_STALE = 108;
const ERR_INVALID_DECIMALS = 109;

interface ProjectSource {
  sourceHash: Buffer;
  lastUpdate: bigint;
  updateCount: bigint;
}

interface FlowData {
  flow: bigint;
  sourceHash: Buffer;
  timestamp: bigint;
  oracle: string;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class WaterOracleMock {
  state: {
    admin: string;
    yieldCalculator: string;
    oracles: Set<string>;
    projectSources: Map<bigint, ProjectSource>;
    flowData: Map<string, FlowData>;
    latestFlow: Map<bigint, bigint>;
  } = {
    admin: "ST1ADMIN",
    yieldCalculator: "ST1YIELD",
    oracles: new Set(),
    projectSources: new Map(),
    flowData: new Map(),
    latestFlow: new Map(),
  };

  blockHeight: bigint = 1000n;
  caller: string = "ST1ADMIN";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      yieldCalculator: "ST1YIELD",
      oracles: new Set(),
      projectSources: new Map(),
      flowData: new Map(),
      latestFlow: new Map(),
    };
    this.blockHeight = 1000n;
    this.caller = "ST1ADMIN";
  }

  private isAdmin(): boolean {
    return this.caller === this.state.admin;
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  setYieldCalculator(contract: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.yieldCalculator = contract;
    return { ok: true, value: true };
  }

  registerOracle(oracle: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.oracles.has(oracle))
      return { ok: false, value: ERR_ORACLE_EXISTS };
    this.state.oracles.add(oracle);
    return { ok: true, value: true };
  }

  removeOracle(oracle: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.oracles.has(oracle))
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.oracles.delete(oracle);
    return { ok: true, value: true };
  }

  registerProjectSource(
    projectId: bigint,
    sourceHash: Buffer
  ): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (sourceHash.length !== 32)
      return { ok: false, value: ERR_INVALID_SOURCE };
    if (this.state.projectSources.has(projectId))
      return { ok: false, value: ERR_PROJECT_NOT_FOUND };

    this.state.projectSources.set(projectId, {
      sourceHash,
      lastUpdate: 0n,
      updateCount: 0n,
    });
    return { ok: true, value: true };
  }

  submitFlow(
    projectId: bigint,
    flow: bigint,
    sourceHash: Buffer,
    timestamp: bigint
  ): Result<boolean> {
    const source = this.state.projectSources.get(projectId);
    if (!source) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!this.state.oracles.has(this.caller))
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (flow < 1n || flow > 1000000n)
      return { ok: false, value: ERR_INVALID_FLOW };
    if (!Buffer.from(source.sourceHash).equals(sourceHash))
      return { ok: false, value: ERR_INVALID_SOURCE };
    if (timestamp === 0n || timestamp > this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };

    const currentBlock = this.blockHeight - 1n;
    if (currentBlock - source.lastUpdate < 6n)
      return { ok: false, value: ERR_TOO_FREQUENT };
    if (this.blockHeight - timestamp > 100n)
      return { ok: false, value: ERR_DATA_STALE };

    const key = `${projectId}-${currentBlock}`;
    this.state.flowData.set(key, {
      flow,
      sourceHash,
      timestamp,
      oracle: this.caller,
    });
    this.state.latestFlow.set(projectId, flow);
    this.state.projectSources.set(projectId, {
      ...source,
      lastUpdate: currentBlock,
      updateCount: source.updateCount + 1n,
    });

    return { ok: true, value: true };
  }

  emergencyPauseSource(projectId: bigint): Result<boolean> {
    const source = this.state.projectSources.get(projectId);
    if (!source) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.state.projectSources.set(projectId, {
      ...source,
      lastUpdate: 0n,
    });
    return { ok: true, value: true };
  }
}

describe("WaterOracle", () => {
  let oracle: WaterOracleMock;

  beforeEach(() => {
    oracle = new WaterOracleMock();
    oracle.reset();
  });

  it("registers oracle successfully", () => {
    const result = oracle.registerOracle("ST2ORACLE");
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate oracle", () => {
    oracle.registerOracle("ST2ORACLE");
    const result = oracle.registerOracle("ST2ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_EXISTS);
  });

  it("registers project source", () => {
    const hash = Buffer.alloc(32, 1);
    const result = oracle.registerProjectSource(1n, hash);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid source hash", () => {
    const bad = Buffer.alloc(31, 1);
    const result = oracle.registerProjectSource(1n, bad);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SOURCE);
  });

  it("submits valid flow data", () => {
    const hash = Buffer.alloc(32, 1);
    oracle.registerProjectSource(1n, hash);
    oracle.registerOracle("ST2ORACLE");
    oracle.caller = "ST2ORACLE";
    oracle.blockHeight = 1000n;

    const result = oracle.submitFlow(1n, 150n, hash, 995n);
    expect(result.ok).toBe(true);
  });

  it("rejects non-oracle submission", () => {
    const hash = Buffer.alloc(32, 1);
    oracle.registerProjectSource(1n, hash);
    const result = oracle.submitFlow(1n, 150n, hash, 995n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("enforces update interval", () => {
    const hash = Buffer.alloc(32, 1);
    oracle.registerProjectSource(1n, hash);
    oracle.registerOracle("ST2ORACLE");
    oracle.caller = "ST2ORACLE";

    oracle.submitFlow(1n, 150n, hash, 995n);
    const result = oracle.submitFlow(1n, 160n, hash, 996n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOO_FREQUENT);
  });

  it("rejects stale data", () => {
    const hash = Buffer.alloc(32, 1);
    oracle.registerProjectSource(1n, hash);
    oracle.registerOracle("ST2ORACLE");
    oracle.caller = "ST2ORACLE";
    oracle.blockHeight = 1000n;

    const result = oracle.submitFlow(1n, 150n, hash, 800n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DATA_STALE);
  });

  it("pauses source in emergency", () => {
    const hash = Buffer.alloc(32, 1);
    oracle.registerProjectSource(1n, hash);
    const result = oracle.emergencyPauseSource(1n);
    expect(result.ok).toBe(true);
  });
});
