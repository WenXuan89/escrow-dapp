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

## Prerequisites

Install these before doing anything else:

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
3. Open the **Ganache** desktop app and start a new workspace. Note the RPC server address shown (default `127.0.0.1:7545`).
4. Compile the contracts:
   ```bash
   truffle compile
   ```
5. Deploy the contracts to Ganache:
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

### Fronted features

- MetaMask connect flow with automatic account/network change handling
- Arbitrator-first role routing, on-chain registration, and role-specific dashboards
- Clickable registered carrier directory and validated agreement creation/funding
- Agreement participation, wallet balance, live escrow balance, progress, and deadline countdowns
- Carrier milestone reporting with optional IPFS CID; shipper verification and payout release
- Refund, dispute, evidence, and arbitrator resolution controls
- Chronological milestone report/verification history

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

## Known limitations

- Milestone completion is self-reported by the Carrier and verified by the Shipper; there is no external IoT/GPS/oracle integration to confirm real-world delivery.
- Dispute resolution authority (who may call `resolveDispute()`) is documented in the Design Document.
- Reputation tokens are reward-only in the current scope; a penalty mechanism is sketched as an optional future enhancement.
