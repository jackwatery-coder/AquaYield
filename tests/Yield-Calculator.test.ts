// yield-calculator.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, someCV, noneCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_INVALID_FLOW = 102;
const ERR_INVALID_BASELINE = 103;
const ERR_INVALID_RATE = 104;
const ERR_CALCULATION_OVERFLOW = 105;
const ERR_ORACLE_NOT_SET = 106;
const ERR_INSUFFICIENT_DATA = 107;
const ERR_YIELD_NOT_READY = 108;
const ERR_INVALID_PERIOD = 109;

interface Project {
  baselineFlow: bigint;
  baseYieldRate: bigint;
  totalInvested: bigint;
  lastCalcBlock: bigint;
  accumulatedYield: bigint;
  active: boolean;
  periodDays: bigint;
  startBlock: bigint;
}

interface FlowReading {
  flow: bigint;
  timestamp: bigint;
}

interface InvestorYield {
  claimed: bigint;
  lastClaimBlock: bigint;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class YieldCalculatorMock {
  state: {
    oracle: string | null;
    admin: string;
    projects: Map<bigint, Project>;
    flowReadings: Map<string, FlowReading>;
    investorYields: Map<string, InvestorYield>;
  } = {
    oracle: null,
    admin: "ST1ADMIN",
    projects: new Map(),
    flowReadings: new Map(),
    investorYields: new Map(),
  };

  blockHeight: bigint = 100n;
  caller: string = "ST1ADMIN";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      oracle: null,
      admin: "ST1ADMIN",
      projects: new Map(),
      flowReadings: new Map(),
      investorYields: new Map(),
    };
    this.blockHeight = 100n;
    this.caller = "ST1ADMIN";
  }

  private isAdmin(): boolean {
    return this.caller === this.state.admin;
  }

  private isOracle(): boolean {
    return this.state.oracle === this.caller;
  }

  setOracle(newOracle: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.oracle = newOracle;
    return { ok: true, value: true };
  }

  setAdmin(newAdmin: string): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  registerProject(
    projectId: bigint,
    baselineFlow: bigint,
    baseYieldRate: bigint,
    periodDays: bigint
  ): Result<boolean> {
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.projects.has(projectId))
      return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (baselineFlow < 10n || baselineFlow > 500000n)
      return { ok: false, value: ERR_INVALID_BASELINE };
    if (baseYieldRate < 100n || baseYieldRate > 5000n)
      return { ok: false, value: ERR_INVALID_RATE };
    if (periodDays < 1n || periodDays > 365n)
      return { ok: false, value: ERR_INVALID_PERIOD };

    this.state.projects.set(projectId, {
      baselineFlow,
      baseYieldRate,
      totalInvested: 0n,
      lastCalcBlock: 0n,
      accumulatedYield: 0n,
      active: true,
      periodDays,
      startBlock: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  submitFlowReading(projectId: bigint, flow: bigint): Result<boolean> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!this.isOracle()) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!project.active) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (flow < 1n || flow > 1000000n)
      return { ok: false, value: ERR_INVALID_FLOW };

    const key = `${projectId}-${this.blockHeight - 1n}`;
    this.state.flowReadings.set(key, { flow, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  recordInvestment(
    projectId: bigint,
    amount: bigint,
    investor: string
  ): Result<boolean> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!project.active) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (amount === 0n) return { ok: false, value: ERR_INVALID_FLOW };

    const updated = {
      ...project,
      totalInvested: project.totalInvested + amount,
    };
    this.state.projects.set(projectId, updated);

    const key = `${projectId}-${investor}`;
    const existing = this.state.investorYields.get(key);
    if (!existing) {
      this.state.investorYields.set(key, {
        claimed: 0n,
        lastClaimBlock: this.blockHeight,
      });
    }
    return { ok: true, value: true };
  }

  calculateCurrentYieldRate(projectId: bigint): Result<bigint> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };

    const key = `${projectId}-${this.blockHeight - 1n}`;
    const reading = this.state.flowReadings.get(key);
    if (!reading) return { ok: false, value: ERR_INSUFFICIENT_DATA };

    const flow = reading.flow;
    const baseline = project.baselineFlow;
    const baseRate = project.baseYieldRate;

    let ratio: bigint;
    if (flow >= baseline) {
      ratio = (flow * 100n) / baseline;
      ratio = ratio > 300n ? 300n : ratio;
    } else {
      ratio = (flow * 100n) / baseline;
      ratio = ratio < 50n ? 50n : ratio;
    }

    let adjusted = baseRate * ratio;
    adjusted = adjusted > 5000n ? 5000n : adjusted;
    return { ok: true, value: adjusted };
  }

  estimateYield(
    projectId: bigint,
    investment: bigint,
    days: bigint
  ): Result<bigint> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };

    const rateResult = this.calculateCurrentYieldRate(projectId);
    if (!rateResult.ok) return rateResult;

    const rate = (rateResult as { value: bigint }).value;
    const annual = (investment * rate) / 10000n;
    const daily = annual / 365n;
    const total = daily * days;
    return { ok: true, value: total };
  }

  claimYield(
    projectId: bigint,
    investor: string,
    investmentAmount: bigint
  ): Result<bigint> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };

    const key = `${projectId}-${investor}`;
    const yieldData = this.state.investorYields.get(key) || {
      claimed: 0n,
      lastClaimBlock: project.startBlock,
    };

    const blocksPerPeriod = project.periodDays * 144n;
    const blocksSince = this.blockHeight - yieldData.lastClaimBlock;
    if (blocksSince < blocksPerPeriod)
      return { ok: false, value: ERR_YIELD_NOT_READY };

    const rateResult = this.calculateCurrentYieldRate(projectId);
    if (!rateResult.ok) return rateResult;
    const rate = (rateResult as { value: bigint }).value;

    const totalInvested = project.totalInvested;
    if (totalInvested === 0n) return { ok: true, value: 0n };

    const investorShare = (investmentAmount * rate) / totalInvested;
    const due = investorShare - yieldData.claimed;

    this.state.investorYields.set(key, {
      claimed: investorShare,
      lastClaimBlock: this.blockHeight,
    });

    return { ok: true, value: due };
  }

  deactivateProject(projectId: bigint): Result<boolean> {
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    if (!this.isAdmin()) return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.state.projects.set(projectId, { ...project, active: false });
    return { ok: true, value: true };
  }
}

describe("YieldCalculator", () => {
  let calc: YieldCalculatorMock;

  beforeEach(() => {
    calc = new YieldCalculatorMock();
    calc.reset();
  });

  it("sets oracle successfully", () => {
    const result = calc.setOracle("ST2ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects non-admin oracle set", () => {
    calc.caller = "ST3HACKER";
    const result = calc.setOracle("ST2ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("registers project with valid params", () => {
    const result = calc.registerProject(1n, 100n, 500n, 30n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects duplicate project registration", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    const result = calc.registerProject(1n, 200n, 600n, 60n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROJECT_NOT_FOUND);
  });

  it("rejects invalid baseline flow", () => {
    const result = calc.registerProject(1n, 5n, 500n, 30n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BASELINE);
  });

  it("rejects invalid yield rate", () => {
    const result = calc.registerProject(1n, 100n, 6000n, 30n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RATE);
  });

  it("rejects invalid period", () => {
    const result = calc.registerProject(1n, 100n, 500n, 400n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PERIOD);
  });

  it("submits flow reading as oracle", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    calc.setOracle("ST2ORACLE");
    calc.caller = "ST2ORACLE";
    const result = calc.submitFlowReading(1n, 120n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects flow from non-oracle", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    const result = calc.submitFlowReading(1n, 120n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid flow values", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    calc.setOracle("ST1ADMIN");
    const low = calc.submitFlowReading(1n, 0n);
    const high = calc.submitFlowReading(1n, 1000001n);
    expect(low.ok).toBe(false);
    expect(low.value).toBe(ERR_INVALID_FLOW);
    expect(high.ok).toBe(false);
    expect(high.value).toBe(ERR_INVALID_FLOW);
  });

  it("records investment correctly", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    const result = calc.recordInvestment(1n, 1000n, "ST3INVESTOR");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("estimates yield correctly", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    calc.setOracle("ST1ADMIN");
    calc.submitFlowReading(1n, 120n);
    const result = calc.estimateYield(1n, 10000n, 30n);
    expect(result.ok).toBe(true);
    expect((result as { value: bigint }).value).toBeGreaterThan(0n);
  });

  it("rejects early claim", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    calc.recordInvestment(1n, 10000n, "ST3INVESTOR");
    calc.blockHeight += 10n;
    const result = calc.claimYield(1n, "ST3INVESTOR", 10000n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_YIELD_NOT_READY);
  });

  it("deactivates project", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    const result = calc.deactivateProject(1n);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects deactivation by non-admin", () => {
    calc.registerProject(1n, 100n, 500n, 30n);
    calc.caller = "ST3HACKER";
    const result = calc.deactivateProject(1n);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});
