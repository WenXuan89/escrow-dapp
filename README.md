# escrow-dapp
# Decentralized Escrow and Milestone-Based Logistics Platform

A decentralized application (dApp) built on Ethereum using Solidity, Truffle, and Ganache, allowing Shippers and Carriers to create, fund, and execute milestone-based logistics agreements with on-chain escrow, verification, refunds, disputes, and a reputation reward token.

Repository Link: https://github.com/WenXuan89/escrow-dapp 

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
│ ├── Escrow.sol 
│ ├── ReputationToken.sol 
│ └── Escrow-flattened.sol # Flattened contract for Etherscan verification
├── migrations/
│ └── 2_deploy_contracts.js 
├── src/
│ ├── index.html 
│ ├── app.js 
│ ├── styles.css 
│ └── config.template.js 
├── test/
│ └── escrow_test.js 
├── .gitignore 
├── README.md 
├── bs-config.json 
├── package.json 
├── package-lock.json 
└── truffle-config.js 
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
   git clone https://github.com/WenXuan89/escrow-dapp.git
   cd escrow-dapp
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Create .env file for Sepolia deployment (optional):
   ```bash
   MNEMONIC="your twelve word mnemonic here"
   INFURA_KEY="your_infura_api_key_here"ALCHEMY_KEY="your_alchemy_api_key_here"    # Optional
   ETHERSCAN_KEY="your_etherscan_api_key"     # Optional for contract verification
   ```
4. Set up Pinata API key (for photo uploads):
   ```bash
   cp src/config.template.js src/config.js
   # Edit src/config.js and add your Pinata JWT token
   # Get your token from https://pinata.cloud/
   ```
5. Open the **Ganache** desktop app and start a new workspace. Note the RPC server address shown (default `127.0.0.1:7545`). Note the Chain ID (commonly 1337 or 5777).
6. Compile the contracts:
   ```bash
   truffle compile
   ```
7. Deploy the contracts to Ganache:
   ```bash
   truffle migrate --network development
   ```
   (Use `truffle migrate --reset` to redeploy fresh after making contract changes.)

## Running the frontend

```bash
npm run dev
```
This starts a local server (via `lite-server`) serving the frontend, typically at `http://localhost:3000`.

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
  
### Frontend Features

**Wallet & Authentication**
- MetaMask connect flow with automatic account/network change handling
- Role-based routing (Shipper, Carrier, Arbitrator) with on-chain registration
- Display name management and carrier service profile settings

**Carrier Marketplace**
- Searchable, sortable carrier marketplace
- Agreement details are entered before carrier selection, so the picker can filter by location and delivery speed
- The agreement picker supports name/address search and pagination with up to 12 matching carriers per page
- Selected carriers have a clear badge and selecting a carrier does not move the user away from the current form position

**Agreement Creation**
- Route-aware agreement creation with origin, destination, item type, parcel size, weight, delivery speed, guarantee tier, and optional photo CID
- Carrier speed validation: Validates that selected carrier offers the chosen delivery speed before agreement creation
- Editable browser-calculated price suggestion and duplicate-milestone validation
- Live ETH-to-MYR estimate beside the editable ETH amount (ETH remains the on-chain payment currency)
- Milestone-based payment structure with configurable percentages

**Agreement Management**
- Agreement participation tracking with wallet balance, live escrow balance, progress indicators, and deadline countdowns
- Smart deadline extension: Shipper can extend deadlines for open agreements (Created, Accepted, Funded, InProgress) but NOT for closed agreements (Completed, Refunded, Disputed, Rejected)
- Month and exact-date agreement filters with active agreements ordered by nearest deadline
- Attention filter: Shows agreements requiring immediate action (waiting for acceptance, funding, milestone reporting/verification, disputed, or deadline passed)

**Milestone & Payment Flow**
- Carrier milestone reporting with optional IPFS CID photo upload; shipper verification and automated payout release
- Milestone progress and chronological report/verification history are combined in one delivery timeline
- Status flow: Created → Accepted → Funded → InProgress → Completed
- Commission system: 5% automatically deducted from each milestone payout and allocated to arbitrator
- Automatic reputation minting: Reputation tokens awarded upon agreement completion

**Dispute Resolution**
- Dispute raising with predefined reasons and custom "Other" reason with description
- Evidence submission with optional IPFS photo uploads (Shipper/Carrier can submit; Arbitrator can view all)
- Arbitrator resolution: Pay carrier or refund shipper with automatic commission handling

**Photo & IPFS Integration**
- Optional parcel, milestone-delivery, and dispute-evidence photos with local preview
- IPFS CID/public-URL storage via Pinata IPFS service 
- No user API key required - pre-configured Pinata integration
- Image preview and gallery display in agreement details

**Dashboard & Analytics**
- Role-specific dashboards: Shipper/Carrier (wallet balance, locked escrow, active agreements, completed count) and Arbitrator (open agreements, active disputes, completed agreements, resolved disputes)
- Role-specific notifications highlight new offers, carrier acceptance, funding, reported milestones, overdue deliveries, and disputes
- Overview recent agreements and activity include accepted-and-beyond agreements only; unaccepted offers remain in carrier notifications for Accept/Reject action
- Agreement cards and details label both the Shipper MetaMask wallet and Carrier MetaMask wallet
- Arbitrator reward settings are limited to 1–500 points in the interface and smart contract
- ReputationToken point/star display for carriers

On Windows PowerShell, if `npm.ps1` is blocked by the execution policy, use `npm.cmd install`, `npm.cmd run compile`, and `npm.cmd run dev`. This runs the same npm commands without changing the computer's security policy.