# escrow-dapp
# Decentralized Escrow and Milestone-Based Logistics Platform

A decentralized application (dApp) built on Ethereum using Solidity, Truffle, and Ganache, allowing Shippers and Carriers to create, fund, and execute milestone-based logistics agreements with on-chain escrow, verification, refunds, disputes, and a reputation reward token.

## Team

| Member | Role |
|---|---|
| A | Registration, Agreement Creation & Milestone Reporting |
| B | Funding & Milestone Verification/Payout |
| C | Deadlines, Refunds, Disputes & Reputation Token |
| D | Frontend & Integration |

## Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Blockchain** | Ethereum (Sepolia Testnet) | - |
| **Smart Contracts** | Solidity | 0.8.19 |
| **Development Framework** | Truffle | 5.11.5 |
| **Local Blockchain** | Ganache | Latest |
| **Frontend** | HTML5, CSS3, JavaScript (ES6) | - |
| **Web3 Library** | Web3.js | 1.8.0+ |
| **Wallet** | MetaMask | Latest |
| **Package Manager** | npm | - |
| **Testing** | Truffle Test (Mocha) | - |
| **Version Control** | Git & GitHub | - |

## Prerequisites

Install these before any next step:

| Tool | Link | Check it worked |
|---|---|---|
| Git | https://git-scm.com/downloads | `git --version` |
| Node.js (LTS) | https://nodejs.org | `node -v` |
| Truffle | `npm install -g truffle` | `truffle version` |
| Ganache (desktop app) | https://trufflesuite.com/ganache | opens as a GUI app |
| MetaMask (browser extension) | https://metamask.io | appears in your browser toolbar |

## Project structure

```
escrow-dapp/
├── contracts/
│   ├── Escrow.sol
│   └── ReputationToken.sol
├── migrations/
│   └── 2_deploy_contracts.js
├── src/                  (frontend: index.html, app.js, css)
├── test/
├── truffle-config.js
└── package.json
```

## Smart Contracts Overview

### Escrow.sol

Main contract managing users, agreements, milestones, and disputes:

| Module | Key Functions | Description |
|--------|--------------|-------------|
| **User Management** | `registerUser()`, `setDisplayName()`, `setCarrierProfile()` | User registration and profiles |
| **Agreement Management** | `createAgreement()`, `acceptAgreement()`, `rejectAgreement()`, `fundAgreement()`, `extendDeadline()` | Full agreement lifecycle |
| **Milestone Management** | `reportMilestone()`, `verifyMilestone()`, `getMilestone()` | Milestone tracking and payments |
| **Dispute Management** | `raiseDispute()`, `submitEvidence()`, `resolveDispute()` | Dispute resolution |
| **Arbitration** | `withdrawCommission()`, `setCompletionReward()`, `setDisputeWinReward()` | Commission and rewards |

### ReputationToken.sol

ERC20-compatible reputation token:
- Only Escrow contract can mint tokens
- 100 tokens on agreement completion (configurable)
- 100 tokens if arbitrator rules in carrier's favor

## Setup — first time only

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR-TEAM/escrow-dapp.git
   cd escrow-dapp
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Create .env file for Sepolia deployment (optional):
   ```bash
   MNEMONIC="your twelve word mnemonic here"
   INFURA_KEY="your_infura_api_key_here"
   ```
4. Open the **Ganache** desktop app and start a new workspace. Note the RPC server address shown (default `127.0.0.1:7545`).
5. Compile the contracts:
   ```bash
   truffle compile
   ```
6. Deploy the contracts to Ganache:
   ```bash
   truffle migrate
   ```
   (Use `truffle migrate --reset` to redeploy fresh after making contract changes.)

## Running the frontend

```bash
npm run compile
npm run dev
```
This starts a local server (via `lite-server`) serving the frontend, typically at `http://localhost:3000`.

The UI reads the active deployment from `build/contracts/Escrow.json`. If the connected network has no recorded deployment, it shows a setup panel where you can paste an Escrow contract address manually. For a UI-only preview with sample agreements, open `http://localhost:3000/?demo=1`.

## Connecting MetaMask to your local Ganache network

1. Open MetaMask → click the network dropdown → **Add network** → **Add a network manually**.
2. Enter:
   - **Network Name:** Ganache Local
   - **New RPC URL:** `http://127.0.0.1:7545`
   - **Chain ID:** whatever Ganache's UI displays (commonly `1337` or `5777`)
   - **Currency Symbol:** ETH
3. Import a couple of Ganache's test accounts into MetaMask using the private keys shown in the Ganache app (click the key icon next to an account) — use one as your test Shipper and another as your test Carrier.

## Everyday development workflow

See `docs/team-github-guide.md` for the full Git branching workflow. Short version:
```bash
git checkout main
git pull origin main
git checkout -b your-branch-name
# ... make changes ...
git add .
git commit -m "describe your change"
git push origin your-branch-name
# then open a Pull Request on GitHub and have a teammate review/merge
```

## Demo notes

- Set agreement deadlines a few minutes in the future (not days) when creating test agreements, so both the successful-completion and missed-deadline-refund paths can be demonstrated within a short presentation window.
- Simulate different users by switching the active account in MetaMask's dropdown between imported Ganache test accounts.
  
### Frontend features

- MetaMask connect flow with automatic account/network change handling
- Arbitrator-first role routing, on-chain registration, and role-specific dashboards
- Searchable, sortable carrier marketplace with location, delivery-type, profile, and reputation filters
- Route-aware carrier selection and agreement creation with origin, destination, item type, parcel size, weight, delivery speed, guarantee tier, and optional photo CID
- Editable browser-calculated price suggestion and duplicate-milestone validation
- Agreement participation, wallet balance, live escrow balance, progress, and deadline countdowns
- Month and exact-date agreement filters, plus active agreements ordered by nearest deadline
- Carrier milestone reporting with optional IPFS CID; shipper verification and payout release
- Optional parcel, milestone-delivery, and dispute-evidence photos with local preview and IPFS CID/public-URL storage
- Refund, dispute, evidence, and arbitrator resolution controls
- Chronological milestone report/verification history and recent on-chain account activity
- Editable display names, carrier service profiles, and ReputationToken point/star display

On Windows PowerShell, if `npm.ps1` is blocked by the execution policy, use `npm.cmd install`, `npm.cmd run compile`, and `npm.cmd run dev`. This runs the same npm commands without changing the computer's security policy.

## Known limitations

- Milestone completion is self-reported by the Carrier and verified by the Shipper; there is no external IoT/GPS/oracle integration to confirm real-world delivery.
- Dispute resolution authority (who may call `resolveDispute()`) is documented in the Design Document.
- Reputation tokens are reward-only in the current scope; a penalty mechanism is sketched as an optional future enhancement.
- Local image selection is a preview only. The contracts store a CID/URL string rather than image bytes, so production use still needs an IPFS uploader or another file-storage service.
- The current `Escrow.sol` ABI does not yet expose the proposed carrier accept/reject workflow, deadline extension, admin commission withdrawal, or adjustable reward settings. The frontend reports this capability gap and does not show transaction controls that would revert or call missing methods.
