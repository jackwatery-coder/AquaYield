# 💧 AquaYield: NFT-Funded Hydropower Initiatives

Welcome to AquaYield, a groundbreaking Web3 platform that democratizes funding for sustainable hydropower projects! By leveraging NFTs on the Stacks blockchain, investors can fund real-world hydropower initiatives while earning yields tied directly to verifiable on-chain water flow data. This solves the real-world problem of limited access to transparent, performance-based financing for renewable energy projects in underserved regions, reducing reliance on traditional banks and ensuring returns are based on actual environmental performance.

## ✨ Features
🌊 NFT minting for funding specific hydropower projects  
💰 Crowdfunded pools that unlock when funding goals are met  
📊 On-chain oracles feeding real-time water flow data from trusted sources  
📈 Dynamic yield calculations based on water flow metrics (e.g., cubic meters per second)  
🔄 Automated yield distribution to NFT holders via STX or tokens  
🗳️ Governance for proposing and voting on new hydropower initiatives  
🔒 Secure escrow for funds until project milestones are verified  
📝 Immutable registry of projects and their performance history  
✅ Data verification to prevent tampering with oracle inputs  
🚀 Scalable for multiple global hydropower sites

## 🛠 How It Works
AquaYield uses 8 smart contracts written in Clarity to create a decentralized ecosystem for funding and rewarding hydropower development. Here's a high-level overview:

### Core Smart Contracts
1. **NFT-Minter.clar**: Handles minting unique NFTs representing shares in hydropower projects. Each NFT includes metadata like project ID, funding tier, and expected yield range.
2. **Funding-Pool.clar**: Manages crowdfunding pools for each initiative. Collects STX from NFT purchases and releases funds to project owners only when thresholds are met or refunded if not.
3. **Water-Oracle.clar**: Integrates with external oracles (e.g., via Chainlink on Stacks) to pull and store water flow data periodically, ensuring it's tamper-proof and timestamped.
4. **Yield-Calculator.clar**: Computes investor yields based on oracle data. For example, yields scale with water flow: higher flow = higher returns, using formulas like `yield = base_rate * (current_flow / avg_flow)`.
5. **Distribution-Engine.clar**: Automatically distributes calculated yields to NFT holders as STX or custom tokens, prorated by ownership percentage.
6. **Project-Registry.clar**: Maintains an immutable list of registered hydropower projects, including details like location, capacity, and historical data.
7. **Governance-Voting.clar**: Allows NFT holders to propose new projects or vote on upgrades, with voting power weighted by NFT holdings.
8. **Milestone-Verifier.clar**: Verifies real-world milestones (e.g., plant construction) via oracle proofs before releasing escrowed funds, ensuring accountability.

### For Investors
- Browse registered projects via the Project-Registry contract.
- Mint an NFT by calling `mint-nft` in NFT-Minter with the project ID and your STX payment.
- Stake your NFT (if integrated) for bonus yields.
- Monitor water flow data through Water-Oracle and watch yields auto-distribute via Distribution-Engine.

### For Project Owners
- Register your hydropower initiative with Project-Registry, providing details like target funding, location, and expected water flow baselines.
- Set up a funding pool with Funding-Pool to attract NFT buyers.
- Submit milestone proofs to Milestone-Verifier for fund releases.
- Use on-chain data to prove performance and build trust for future rounds.

### For Verifiers and Auditors
- Query any contract (e.g., `get-project-details` in Project-Registry) to view immutable records.
- Call `verify-yield` in Yield-Calculator to confirm calculations match oracle data.
- Use Governance-Voting to participate in community oversight.

That's it! AquaYield turns hydropower funding into a transparent, yield-generating Web3 experience, powering clean energy while rewarding participants based on real environmental impact. Deploy on Stacks for low-cost, Bitcoin-secured transactions.