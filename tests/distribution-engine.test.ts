// distribution-engine.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { principalCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_YIELD_CALC_FAILED = 102;
const ERR_INSUFFICIENT_BALANCE = 103;
const ERR_CLAIM_FAILED = 104;
const ERR_ALREADY_CLAIMED = 105;
const ERR_INVALID_AMOUNT = 106;
const ERR_DISTRIBUTION_LOCKED = 107;
const ERR_INVALID_STATE = 108;
const ERR_TRANSFER_FAILED = 109;

interface ProjectPool {
  totalYieldPool: bigint;
  claimedTotal: bigint;
  lastDistribution: bigint;
  locked: boolean;
}

interface InvestorClaim {
  pendingYield: bigint;
  lastClaimBlock: bigint;
  claimedTotal: bigint;
}

interface DistributionHistory {
  totalYield: bigint;
  investorsCount: bigint;
  timestamp: bigint;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class DistributionEngineMock {
  state: {
    yieldCalculator: string;
    treasury: string;
    distributionActive: boolean;
    totalDistributed: bigint;
    lastDistributionBlock: bigint;
    projectPools: Map<bigint, ProjectPool>;
    investorClaims: Map<string, InvestorClaim>;
    distributionHistory: Map<string, DistributionHistory>;
    contractBalance: bigint;
  } = {
    yieldCalculator: "ST1YIELD",
    treasury: "ST1TREASURY",
    distributionActive: true,
    totalDistributed: 0n,
    lastDistributionBlock: 0n,
    projectPools: new Map(),
    investorClaims: new Map(),
    distributionHistory: new Map(),
    contractBalance: 0n,
  };

  blockHeight: bigint = 1000n;
  caller: string = "ST1TREASURY";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      yieldCalculator: "ST1YIELD",
      treasury: "ST1TREASURY",
      distributionActive: true,
      totalDistributed: 0n,
      lastDistributionBlock: 0n,
      projectPools: new Map(),
      investorClaims: new Map(),
      distributionHistory: new Map(),
      contractBalance: 0n,
    };
    this.blockHeight = 1000n;
    this.caller = "ST1TREASURY";
  }

  private isAdmin(): boolean {
    return this.caller === this.state.treasury;
  }

  private isYieldCalculator(): boolean {
    return this.caller === this.state.yieldCalculator;
  }

  setYieldCalculator(newContract: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.yieldCalculator = newContract;
    return { ok: true, value: true };
  }

  setTreasury(newTreasury: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.treasury = newTreasury;
    return { ok: true, value: true };
  }

  toggleDistribution(active: boolean): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.distributionActive = active;
    return { ok: true, value: true };
  }

  depositYieldPool(projectId: bigint, amount: bigint): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (amount < 1000n) return { ok: false, value: ERR_INVALID_AMOUNT };

    const pool = this.state.projectPools.get(projectId) || {
      totalYieldPool: 0n,
      claimedTotal: 0n,
      lastDistribution: 0n,
      locked: false,
    };

    if (pool.locked) return { ok: false, value: ERR_DISTRIBUTION_LOCKED };

    this.state.contractBalance += amount;
    this.state.projectPools.set(projectId, {
      ...pool,
      totalYieldPool: pool.totalYieldPool + amount,
    });
    return { ok: true, value: true };
  }

  triggerDistribution(projectId: bigint): Result<boolean> {
    const pool = this.state.projectPools.get(projectId);
    if (!pool) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!this.state.distributionActive)
      return { ok: false, value: ERR_DISTRIBUTION_LOCKED };
    if (pool.locked) return { ok: false, value: ERR_DISTRIBUTION_LOCKED };
    if (this.blockHeight - pool.lastDistribution < 10n)
      return { ok: false, value: ERR_ALREADY_CLAIMED };

    this.state.projectPools.set(projectId, {
      ...pool,
      lastDistribution: this.blockHeight,
    });
    this.state.lastDistributionBlock = this.blockHeight;
    return { ok: true, value: true };
  }

  claimPendingYield(projectId: bigint, investor: string): Result<bigint> {
    const key = `${projectId}-${investor}`;
    const claim = this.state.investorClaims.get(key);
    if (!claim || claim.pendingYield === 0n)
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };

    if (this.state.contractBalance < claim.pendingYield) {
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    }

    this.state.contractBalance -= claim.pendingYield;
    this.state.totalDistributed += claim.pendingYield;

    this.state.investorClaims.set(key, {
      ...claim,
      pendingYield: 0n,
      lastClaimBlock: this.blockHeight,
      claimedTotal: claim.claimedTotal + claim.pendingYield,
    });

    return { ok: true, value: claim.pendingYield };
  }

  recordYieldForInvestor(
    projectId: bigint,
    investor: string,
    yieldAmount: bigint
  ): Result<boolean> {
    if (!this.isYieldCalculator())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (yieldAmount === 0n) return { ok: false, value: ERR_INVALID_AMOUNT };

    const key = `${projectId}-${investor}`;
    const claim = this.state.investorClaims.get(key) || {
      pendingYield: 0n,
      lastClaimBlock: 0n,
      claimedTotal: 0n,
    };

    this.state.investorClaims.set(key, {
      ...claim,
      pendingYield: claim.pendingYield + yieldAmount,
    });
    return { ok: true, value: true };
  }

  emergencyWithdraw(amount: bigint): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.contractBalance < amount)
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };

    this.state.contractBalance -= amount;
    return { ok: true, value: true };
  }

  estimatePendingYield(projectId: bigint, investor: string): Result<bigint> {
    const key = `${projectId}-${investor}`;
    const claim = this.state.investorClaims.get(key);
    return { ok: true, value: claim?.pendingYield || 0n };
  }
}

describe("DistributionEngine", () => {
  let engine: DistributionEngineMock;

  beforeEach(() => {
    engine = new DistributionEngineMock();
    engine.reset();
  });

  it("sets yield calculator contract", () => {
    const result = engine.setYieldCalculator("ST2NEW");
    expect(result.ok).toBe(true);
  });

  it("rejects non-admin set calculator", () => {
    engine.caller = "ST3HACK";
    const result = engine.setYieldCalculator("ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("deposits into yield pool", () => {
    const result = engine.depositYieldPool(1n, 5000n);
    expect(result.ok).toBe(true);
    expect(engine.state.contractBalance).toBe(5000n);
  });

  it("rejects small deposit", () => {
    const result = engine.depositYieldPool(1n, 500n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("records yield from calculator", () => {
    engine.caller = "ST1YIELD";
    const result = engine.recordYieldForInvestor(1n, "ST3INV", 2000n);
    expect(result.ok).toBe(true);
  });

  it("rejects record from non-calculator", () => {
    engine.caller = "ST3HACK";
    const result = engine.recordYieldForInvestor(1n, "ST3INV", 2000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects claim with no balance", () => {
    engine.caller = "ST3INV";
    const result = engine.claimPendingYield(1n, "ST3INV");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("estimates pending yield", () => {
    engine.caller = "ST1YIELD";
    engine.recordYieldForInvestor(1n, "ST3INV", 1500n);
    const result = engine.estimatePendingYield(1n, "ST3INV");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1500n);
  });

  it("triggers distribution", () => {
    engine.depositYieldPool(1n, 10000n);
    const result = engine.triggerDistribution(1n);
    expect(result.ok).toBe(true);
  });

  it("emergency withdraw by admin", () => {
    engine.depositYieldPool(1n, 8000n);
    const result = engine.emergencyWithdraw(5000n);
    expect(result.ok).toBe(true);
    expect(engine.state.contractBalance).toBe(3000n);
  });

  it("toggles distribution", () => {
    const result = engine.toggleDistribution(false);
    expect(result.ok).toBe(true);
    expect(engine.state.distributionActive).toBe(false);
  });
});
