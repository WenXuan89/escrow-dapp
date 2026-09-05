/* global Web3 */

const ROLE = { NONE: 0, SHIPPER: 1, CARRIER: 2, ARBITRATOR: 3 };
const ROLE_LABELS = ["Unregistered", "Shipper", "Carrier", "Arbitrator"];
const STATUS = ["Created", "Funded", "In progress", "Completed", "Refunded", "Disputed"];
const MILESTONE_TYPES = ["", "Pickup confirmed", "Departed origin", "In-transit checkpoint", "Arrived destination", "Final delivery", "Other"];
const DISPUTE_REASONS = ["", "Milestone not completed", "Proof is insufficient", "Payment is being withheld", "Cargo damaged or lost", "Other"];
const LOCATIONS = ["", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya / Labuan"];
const ITEM_TYPES = ["", "Documents", "Electronics", "Food", "Clothing", "Fragile goods", "Other"];
const PARCEL_SIZES = ["", "Small", "Medium", "Large", "Oversized"];
const DELIVERY_SPEEDS = ["", "Standard", "Express", "Same day", "Scheduled"];
const GUARANTEE_TIERS = ["", "Basic", "Protected", "Premium"];
const ACTIVE_STATUSES = [1, 2];
const CLOSED_STATUSES = [3, 4];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const state = {
  web3: null,
  contract: null,
  artifact: null,
  tokenArtifact: null,
  token: null,
  account: null,
  chainId: null,
  role: ROLE.NONE,
  isArbitrator: false,
  agreements: [],
  carriers: [],
  activity: [],
  displayName: "",
  reputation: "0",
  currentAgreementId: null,
  pendingAction: null,
  filter: "all",
  monthFilter: "",
  dateFilter: "",
  demo: new URLSearchParams(location.search).get("demo") === "1"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const valueAt = (result, name, index) => result?.[name] ?? result?.[index];
const toNumber = value => Number(value ?? 0);
const shortAddress = (address, head = 6, tail = 4) => address ? `${address.slice(0, head)}…${address.slice(-tail)}` : "—";
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const formatDate = timestamp => timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(Number(timestamp) * 1000)) : "Not yet";
const roleLabel = role => ROLE_LABELS[role] || "Unknown";

function formatEth(wei, precision = 4) {
  if (wei === undefined || wei === null) return "—";
  if (state.demo) return `${Number(wei).toFixed(precision).replace(/\.?0+$/, "")} ETH`;
  try {
    const value = state.web3.utils.fromWei(String(wei), "ether");
    return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: precision })} ETH`;
  } catch (_) {
    return "—";
  }
}

function statusClass(status) {
  return `status-${STATUS[status].toLowerCase().replace(/\s+/g, "")}`;
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(STATUS[status])}</span>`;
}

function avatarColor(address) {
  const hue = parseInt((address || "0x73").slice(2, 6), 16) % 360;
  return `hsl(${hue} 36% 86%)`;
}

function deadlineText(deadline) {
  const seconds = Number(deadline) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "Deadline passed";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${Math.max(minutes, 0)}m remaining`;
}

function updateCountdowns() {
  $$('[data-deadline]').forEach(node => {
    node.textContent = deadlineText(node.dataset.deadline);
    node.classList.toggle("urgent", Number(node.dataset.deadline) - Date.now() / 1000 < 86400);
  });
}

function showView(id) {
  ["landingView", "how-it-works", "setupView", "registrationView", "dashboardView"].forEach(viewId => {
    const node = document.getElementById(viewId);
    if (node) node.classList.toggle("hidden", viewId !== id && !(id === "landingView" && viewId === "how-it-works"));
  });
  if (id !== "landingView") $("#how-it-works")?.classList.add("hidden");
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 4800);
}

function readableError(error) {
  const raw = error?.message || String(error || "Unknown error");
  const revert = raw.match(/revert(?:ed)?(?: with reason string)?[\s:'"]+([^"\n]+)/i);
  if (error?.code === 4001 || /user denied|user rejected/i.test(raw)) return "The wallet request was rejected.";
  if (/insufficient funds/i.test(raw)) return "This wallet does not have enough ETH for the transaction and gas.";
  if (revert) return revert[1].replace(/["'}].*$/, "").trim();
  return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
}

function setTransactionState(visible, title = "Confirm in your wallet", message = "Waiting for transaction confirmation…") {
  $("#transactionOverlay").classList.toggle("hidden", !visible);
  $("#transactionTitle").textContent = title;
  $("#transactionMessage").textContent = message;
}

async function sendTransaction(method, options, label) {
  if (state.demo) {
    showToast(`${label} is disabled in preview mode.`, "error");
    return null;
  }
  setTransactionState(true, "Confirm in your wallet", `${label}: approve the transaction in MetaMask.`);
  try {
    const receipt = await method.send({ from: state.account, ...options });
    setTransactionState(true, "Transaction confirmed", `${label} was recorded on-chain.`);
    await refreshAll();
    showToast(`${label} completed.`);
    return receipt;
  } catch (error) {
    showToast(readableError(error), "error");
    throw error;
  } finally {
    setTransactionState(false);
  }
}

function networkName(chainId) {
  const known = { 1: "Ethereum", 11155111: "Sepolia", 1337: "Ganache", 5777: "Ganache", 31337: "Localhost" };
  return known[Number(chainId)] || `Chain ${chainId}`;
}

function updateWalletHeader() {
  const button = $("#connectButton");
  const badge = $("#networkBadge");
  if (!state.account) {
    button.querySelector("span").textContent = "Connect wallet";
    badge.classList.remove("connected");
    badge.querySelector("span").textContent = "Not connected";
    return;
  }
  button.querySelector("span").textContent = shortAddress(state.account);
  badge.classList.add("connected");
  badge.querySelector("span").textContent = state.demo ? "Preview network" : networkName(state.chainId);
}

async function connectWallet(requestAccess = true) {
  if (state.demo) {
    seedDemo();
    return;
  }
  if (!window.ethereum) {
    showToast("MetaMask was not detected. Install or enable the extension, then reload.", "error");
    return;
  }
  if (typeof Web3 === "undefined") {
    showToast("Web3 could not be loaded. Run npm install and start the app with npm run dev.", "error");
    return;
  }
  try {
    const method = requestAccess ? "eth_requestAccounts" : "eth_accounts";
    const accounts = await window.ethereum.request({ method });
    if (!accounts.length) return;
    state.web3 = new Web3(window.ethereum);
    state.account = accounts[0];
    state.chainId = Number(await state.web3.eth.getChainId());
    updateWalletHeader();
    await initializeContract();
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

async function initializeContract(manualAddress = null) {
  try {
    if (!state.artifact) {
      const response = await fetch("/contracts/Escrow.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Escrow artifact was not found. Compile the contracts first.");
      state.artifact = await response.json();
    }
    const savedAddress = localStorage.getItem(`escrowAddress:${state.chainId}`);
    const deployed = state.artifact.networks?.[String(state.chainId)]?.address;
    const address = manualAddress || savedAddress || deployed;
    if (!address || !state.web3.utils.isAddress(address) || address === ZERO_ADDRESS) {
      showSetup("No Escrow deployment was found for the connected network.");
      return;
    }
    const code = await state.web3.eth.getCode(address);
    if (!code || code === "0x") {
      showSetup(`There is no contract at ${shortAddress(address)} on ${networkName(state.chainId)}.`);
      return;
    }
    state.contract = new state.web3.eth.Contract(state.artifact.abi, address);
    try {
      if (!state.tokenArtifact) {
        const tokenResponse = await fetch("/contracts/ReputationToken.json", { cache: "no-store" });
        if (tokenResponse.ok) state.tokenArtifact = await tokenResponse.json();
      }
      const tokenAddress = await state.contract.methods.reputationToken().call();
      if (state.tokenArtifact?.abi && tokenAddress !== ZERO_ADDRESS) state.token = new state.web3.eth.Contract(state.tokenArtifact.abi, tokenAddress);
    } catch (_) { state.token = null; }
    localStorage.setItem(`escrowAddress:${state.chainId}`, address);
    $("#contractAddressShort").textContent = shortAddress(address, 8, 6);
    await routeConnectedUser();
  } catch (error) {
    showSetup(readableError(error));
  }
}

function showSetup(message) {
  $("#setupMessage").textContent = message;
  showView("setupView");
}

async function routeConnectedUser() {
  setTransactionState(true, "Loading your workspace", "Checking your on-chain role and agreements…");
  try {
    const [arbitrator, role] = await Promise.all([
      state.contract.methods.arbitrator().call(),
      state.contract.methods.userRole(state.account).call()
    ]);
    state.isArbitrator = arbitrator.toLowerCase() === state.account.toLowerCase();
    state.role = state.isArbitrator ? ROLE.ARBITRATOR : Number(role);
    if (state.role === ROLE.NONE) {
      showView("registrationView");
      return;
    }
    showView("dashboardView");
    configureDashboardForRole();
    await refreshAll();
  } finally {
    setTransactionState(false);
  }
}

function configureDashboardForRole() {
  const isShipper = state.role === ROLE.SHIPPER;
  const isArbitrator = state.role === ROLE.ARBITRATOR;
  $$(".shipper-only").forEach(node => node.classList.toggle("role-hidden", !isShipper));
  $$(".carrier-only").forEach(node => node.classList.toggle("role-hidden", state.role !== ROLE.CARRIER));
  $$(".arbitrator-only").forEach(node => node.classList.toggle("role-hidden", !isArbitrator));
  $("#profileRole").textContent = roleLabel(state.role);
  $("#profileAddress").textContent = shortAddress(state.account, 8, 6);
  $("#profileAvatar").textContent = state.account.slice(2, 4).toUpperCase();
  $("#profileAvatar").style.background = avatarColor(state.account).replace("86%", "34%");
  $("#dashboardEyebrow").textContent = `${roleLabel(state.role)} dashboard`;
  $("#dashboardGreeting").textContent = isArbitrator ? "Dispute centre" : `Welcome back, ${roleLabel(state.role).toLowerCase()}`;
  $("#dashboardIntro").textContent = isArbitrator ? "Review frozen agreements and make a final on-chain decision." : "Here's what is happening with your delivery agreements.";
  $("#agreementSectionTitle").textContent = isArbitrator ? "Disputed agreements" : "Your agreements";
  $("#agreementSectionCopy").textContent = isArbitrator ? "Every agreement currently awaiting arbitration is listed here." : "Open an agreement to view balance, deadline and chronological milestone history.";
}

async function refreshAll() {
  if (!state.contract && !state.demo) return;
  try {
    await Promise.all([refreshBalances(), refreshCarriers(), refreshAgreements(), refreshProfile(), refreshActivity()]);
    renderDashboard();
    if (state.currentAgreementId !== null && $("#agreementDialog").open) await openAgreement(state.currentAgreementId, false);
  } catch (error) {
    showToast(readableError(error), "error");
  }
}

async function refreshBalances() {
  if (state.demo) {
    $("#walletBalance").textContent = "12.46 ETH";
    return;
  }
  const balance = await state.web3.eth.getBalance(state.account);
  $("#walletBalance").textContent = formatEth(balance);
}

async function refreshCarriers() {
  if (state.demo) return;
  const addresses = await state.contract.methods.getAllCarriers().call();
  state.carriers = await Promise.all(addresses.map(async address => {
    let name = ""; let profile = { location: 0, deliveryTypes: 0, isSet: false }; let reputation = "0";
    try { name = await state.contract.methods.displayName(address).call(); } catch (_) { /* optional label */ }
    try {
      const rawProfile = await state.contract.methods.getCarrierProfile(address).call();
      profile = { location: Number(valueAt(rawProfile, "location", 0)), deliveryTypes: Number(valueAt(rawProfile, "deliveryTypes", 1)), isSet: Boolean(valueAt(rawProfile, "isSet", 2)) };
    } catch (_) { /* profile was added in the latest contract */ }
    try { if (state.token) reputation = await state.token.methods.balanceOf(address).call(); } catch (_) { /* optional reputation display */ }
    return { address, name: name || "Registered carrier", profile, reputation };
  }));
}

async function refreshProfile() {
  if (state.demo) return;
  try { state.displayName = await state.contract.methods.displayName(state.account).call(); } catch (_) { state.displayName = ""; }
  try { state.reputation = state.token ? await state.token.methods.balanceOf(state.account).call() : "0"; } catch (_) { state.reputation = "0"; }
  $("#displayNameInput").value = state.displayName || "";
  const points = Number(state.reputation || 0);
  const stars = Math.min(5, Math.floor(points / 100));
  $("#reputationStars").textContent = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
  $("#reputationPoints").textContent = `${points.toLocaleString()} point${points === 1 ? "" : "s"}`;
  if (state.role === ROLE.CARRIER) {
    try {
      const profile = await state.contract.methods.getCarrierProfile(state.account).call();
      $("#profileLocation").value = String(Number(valueAt(profile, "location", 0)) || 1);
      const mask = Number(valueAt(profile, "deliveryTypes", 1));
      $$('[name="deliveryType"]').forEach(input => { input.checked = Boolean(mask & Number(input.value)); });
    } catch (_) { /* keep defaults */ }
  }
  renderCapabilityNotice();
}

function supportsMethod(name) {
  return Boolean(state.artifact?.abi?.some(item => item.type === "function" && item.name === name));
}

function renderCapabilityNotice() {
  const missing = ["acceptAgreement", "rejectAgreement", "extendDeadline", "withdrawCommission", "setRewardAmount"].filter(name => !supportsMethod(name));
  $("#backendCapabilityText").textContent = missing.length
    ? `This deployment supports shipment details, carrier profiles, reputation and disputes. Acceptance, rejection, deadline extension, commission withdrawal and reward settings require the planned Solidity update.`
    : "All planned frontend integration methods are present in this deployment.";
}

async function refreshActivity() {
  if (state.demo) return;
  try {
    const events = await state.contract.getPastEvents("allEvents", { fromBlock: 0, toBlock: "latest" });
    const account = state.account.toLowerCase();
    state.activity = events.filter(event => Object.values(event.returnValues || {}).some(value => typeof value === "string" && value.toLowerCase() === account)).slice(-12).reverse();
  } catch (_) { state.activity = []; }
}

async function agreementIdsForCurrentUser() {
  if (state.role !== ROLE.ARBITRATOR) return state.contract.methods.getUserAgreements(state.account).call();
  const count = Number(await state.contract.methods.agreementCount().call());
  return Array.from({ length: count }, (_, index) => index);
}

async function loadAgreement(id, includeEvidence = false) {
  const raw = await state.contract.methods.getAgreement(id).call();
  const agreement = {
    id: Number(id),
    shipper: valueAt(raw, "shipper", 0),
    carrier: valueAt(raw, "carrier", 1),
    totalValue: valueAt(raw, "totalValue", 2),
    fundedAmount: valueAt(raw, "fundedAmount", 3),
    releasedAmount: valueAt(raw, "releasedAmount", 4),
    deadline: Number(valueAt(raw, "deadline", 5)),
    status: Number(valueAt(raw, "status", 6)),
    milestones: [],
    evidence: []
  };
  const milestoneCount = Number(await state.contract.methods.getMilestoneCount(id).call());
  try {
    const details = await state.contract.methods.getAgreementDetails(id).call();
    agreement.details = {
      origin: Number(valueAt(details, "origin", 0)), destination: Number(valueAt(details, "destination", 1)),
      itemType: Number(valueAt(details, "itemType", 2)), size: Number(valueAt(details, "size", 3)),
      weight: valueAt(details, "weight", 4), deliverySpeed: Number(valueAt(details, "deliverySpeed", 5)),
      guaranteeTier: Number(valueAt(details, "guaranteeTier", 6)), photoCID: valueAt(details, "photoCID", 7)
    };
  } catch (_) { agreement.details = null; }
  agreement.milestones = await Promise.all(Array.from({ length: milestoneCount }, async (_, index) => {
    const milestone = await state.contract.methods.getMilestone(id, index).call();
    return {
      index,
      type: Number(valueAt(milestone, "milestoneType", 0)),
      description: valueAt(milestone, "otherDescription", 1),
      percentage: Number(valueAt(milestone, "payoutPercentage", 2)),
      reported: Boolean(valueAt(milestone, "reported", 3)),
      completed: Boolean(valueAt(milestone, "completed", 4)),
      reportedTimestamp: Number(valueAt(milestone, "reportedTimestamp", 5)),
      completedTimestamp: Number(valueAt(milestone, "completedTimestamp", 6)),
      proofCID: valueAt(milestone, "proofCID", 7)
    };
  }));
  try {
    const reasonResult = await state.contract.methods.getDisputeReason(id).call();
    agreement.disputeReason = Number(valueAt(reasonResult, "reason", 0));
    agreement.disputeOtherReason = valueAt(reasonResult, "otherReason", 1);
  } catch (_) { agreement.disputeReason = 0; agreement.disputeOtherReason = ""; }
  if (includeEvidence && agreement.status === 5) {
    const evidenceCount = await state.contract.methods.getEvidenceCount(id).call();
    agreement.evidence = await Promise.all(Array.from({ length: Number(evidenceCount) }, async (_, index) => {
      const evidence = await state.contract.methods.getEvidence(id, index).call();
      return {
        submittedBy: valueAt(evidence, "submittedBy", 0),
        description: valueAt(evidence, "description", 1),
        fileCID: valueAt(evidence, "fileCID", 2),
        timestamp: Number(valueAt(evidence, "timestamp", 3))
      };
    }));
  }
  return agreement;
}

async function refreshAgreements() {
  if (state.demo) return;
  const ids = await agreementIdsForCurrentUser();
  const all = await Promise.all([...ids].reverse().map(id => loadAgreement(id)));
  state.agreements = state.role === ROLE.ARBITRATOR ? all.filter(item => item.disputeReason > 0 || item.status === 5) : all;
}

function escrowRemaining(agreement) {
  if (state.demo) return Math.max(0, Number(agreement.fundedAmount) - Number(agreement.releasedAmount));
  try { return (BigInt(agreement.fundedAmount) - BigInt(agreement.releasedAmount)).toString(); } catch (_) { return "0"; }
}

function completedMilestones(agreement) {
  return agreement.milestones.filter(milestone => milestone.completed).length;
}

function needsAttention(agreement) {
  if (agreement.status === 5) return true;
  if (state.role === ROLE.SHIPPER && agreement.status === 0) return true;
  if (state.role === ROLE.SHIPPER && agreement.milestones.some(milestone => milestone.reported && !milestone.completed)) return true;
  if (state.role === ROLE.CARRIER && ACTIVE_STATUSES.includes(agreement.status) && agreement.milestones.some(milestone => !milestone.reported)) return true;
  return ACTIVE_STATUSES.includes(agreement.status) && agreement.deadline < Date.now() / 1000;
}

function renderDashboard() {
  const active = state.agreements.filter(agreement => ACTIVE_STATUSES.includes(agreement.status));
  const completed = state.agreements.filter(agreement => agreement.status === 3);
  const totalEscrow = state.agreements.reduce((sum, agreement) => {
    if (state.demo) return sum + escrowRemaining(agreement);
    return sum + BigInt(escrowRemaining(agreement));
  }, state.demo ? 0 : 0n);
  $("#escrowBalance").textContent = formatEth(totalEscrow);
  $("#activeCount").textContent = active.length;
  $("#completedCount").textContent = completed.length;
  $("#agreementNavCount").textContent = state.agreements.length;
  renderRecentAgreements();
  renderAgreementGrid();
  renderCarriers();
  renderActivity();
  updateCountdowns();
}

function counterpart(agreement) {
  if (state.role === ROLE.CARRIER) return { label: "Shipper", address: agreement.shipper };
  return { label: "Carrier", address: agreement.carrier };
}

function renderRecentAgreements() {
  const container = $("#recentAgreementList");
  const recent = state.agreements.slice(0, 4);
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><strong>No agreements yet</strong>${state.role === ROLE.SHIPPER ? "Choose a carrier and create your first escrow." : "Agreements assigned to this wallet will appear here."}</div>`;
    return;
  }
  container.innerHTML = recent.map(agreement => {
    const party = counterpart(agreement);
    return `<article class="agreement-row" data-agreement-id="${agreement.id}" tabindex="0">
      <span class="agreement-row-icon">#${agreement.id}</span>
      <div class="agreement-row-main"><strong>Agreement #${agreement.id}</strong><small>${party.label}: ${shortAddress(party.address, 8, 5)}</small></div>
      <div class="agreement-row-meta"><strong>${formatEth(agreement.totalValue)}</strong><small class="countdown" data-deadline="${agreement.deadline}">${deadlineText(agreement.deadline)}</small></div>
      ${statusPill(agreement.status)}
    </article>`;
  }).join("");
}

function agreementMatchesFilter(agreement) {
  let matchesStatus = true;
  if (state.role === ROLE.ARBITRATOR) {
    if (state.filter === "active" || state.filter === "attention") matchesStatus = agreement.status === 5;
    if (state.filter === "closed") matchesStatus = agreement.disputeReason > 0 && agreement.status !== 5;
  } else {
    if (state.filter === "active") matchesStatus = ACTIVE_STATUSES.includes(agreement.status);
    if (state.filter === "attention") matchesStatus = needsAttention(agreement);
    if (state.filter === "closed") matchesStatus = CLOSED_STATUSES.includes(agreement.status);
  }
  if (!matchesStatus) return false;
  const date = new Date(agreement.deadline * 1000);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (state.monthFilter && !localDate.startsWith(state.monthFilter)) return false;
  if (state.dateFilter && localDate !== state.dateFilter) return false;
  return true;
}

function renderAgreementGrid() {
  const container = $("#agreementGrid");
  const agreements = state.agreements.filter(agreementMatchesFilter).sort((a, b) => {
    const activeA = ACTIVE_STATUSES.includes(a.status); const activeB = ACTIVE_STATUSES.includes(b.status);
    if (activeA !== activeB) return activeA ? -1 : 1;
    return activeA ? a.deadline - b.deadline : b.id - a.id;
  });
  if (!agreements.length) {
    container.innerHTML = `<div class="empty-state"><strong>Nothing to show</strong>No agreements match this filter.</div>`;
    return;
  }
  container.innerHTML = agreements.map(agreement => {
    const complete = completedMilestones(agreement);
    const total = agreement.milestones.length;
    const progress = total ? Math.round(complete / total * 100) : 0;
    const party = counterpart(agreement);
    return `<article class="agreement-card" data-agreement-id="${agreement.id}" tabindex="0">
      <div class="agreement-card-top"><div><span class="section-label">${party.label}: ${shortAddress(party.address)}</span><h3>Agreement #${agreement.id}</h3><p>${agreement.details ? `${escapeHtml(LOCATIONS[agreement.details.origin])} → ${escapeHtml(LOCATIONS[agreement.details.destination])} · ${escapeHtml(ITEM_TYPES[agreement.details.itemType])}` : "Shipment details unavailable"}</p><p>Deadline ${formatDate(agreement.deadline)}</p></div>${statusPill(agreement.status)}</div>
      <div class="agreement-finance"><div><span>Total</span><strong>${formatEth(agreement.totalValue)}</strong></div><div><span>Released</span><strong>${formatEth(agreement.releasedAmount)}</strong></div><div><span>In escrow</span><strong>${formatEth(escrowRemaining(agreement))}</strong></div></div>
      <div class="progress-track"><i style="width:${progress}%"></i></div>
      <div class="agreement-progress-labels"><span>${complete} of ${total} verified</span><span class="countdown" data-deadline="${agreement.deadline}">${deadlineText(agreement.deadline)}</span></div>
    </article>`;
  }).join("");
}

function renderCarriers() {
  const quick = $("#carrierQuickList");
  const picker = $("#carrierPicker");
  const marketplace = $("#carrierMarketplace");
  if (!quick || !picker || !marketplace) return;
  if (!state.carriers.length) {
    quick.innerHTML = `<div class="empty-state"><strong>No carriers registered</strong>Connect another wallet and register it as a carrier.</div>`;
    picker.innerHTML = `<div class="empty-state"><strong>No carriers available</strong>A carrier must register on-chain first.</div>`;
    marketplace.innerHTML = picker.innerHTML;
    return;
  }
  quick.innerHTML = state.carriers.slice(0, 4).map(carrierCardSmall).join("");
  picker.innerHTML = matchingCarriersForForm().map(carrier => carrierCard(carrier, true)).join("") || `<div class="empty-state"><strong>No route match</strong>Adjust the shipment origin or delivery speed.</div>`;
  renderMarketplace();
}

function reputationLabel(points) {
  const score = Number(points || 0); const stars = Math.min(5, Math.floor(score / 100));
  return `${stars ? "★".repeat(stars) : "New"} · ${score} pts`;
}

function deliveryLabels(mask) {
  return [[1, "Standard"], [2, "Express"], [4, "Same day"]].filter(([bit]) => Number(mask) & bit).map(([, label]) => label).join(", ") || "Profile not set";
}

function carrierCardSmall(carrier) {
  return `<button class="carrier-quick" type="button" data-select-carrier="${carrier.address}"><span class="identicon" style="--avatar-color:${avatarColor(carrier.address)}">${carrier.address.slice(2,4).toUpperCase()}</span><div><strong>${escapeHtml(carrier.name)}</strong><small>${shortAddress(carrier.address, 9, 6)} · ${escapeHtml(reputationLabel(carrier.reputation))}</small></div></button>`;
}

function carrierCard(carrier, selectOnly = false) {
  return `<article class="carrier-card marketplace-card ${selectOnly ? "selectable" : ""}" ${selectOnly ? `data-select-carrier="${carrier.address}" tabindex="0"` : ""}><span class="identicon" style="--avatar-color:${avatarColor(carrier.address)}">${carrier.address.slice(2,4).toUpperCase()}</span><div><strong>${escapeHtml(carrier.name)}</strong><small>${shortAddress(carrier.address, 10, 6)}</small><p>${carrier.profile?.isSet ? escapeHtml(LOCATIONS[carrier.profile.location]) : "Location not set"} · ${escapeHtml(deliveryLabels(carrier.profile?.deliveryTypes))}</p><span class="rating">${escapeHtml(reputationLabel(carrier.reputation))}</span></div>${selectOnly ? `<button class="button button-secondary" type="button" data-select-carrier="${carrier.address}">Select</button>` : `<button class="button button-primary" type="button" data-select-carrier="${carrier.address}">Create agreement</button>`}</article>`;
}

function matchingCarriersForForm() {
  const origin = Number($("#origin")?.value || 0); const speed = Number($("#deliverySpeed")?.value || 0); const bit = speed <= 3 ? 2 ** (speed - 1) : 0;
  return state.carriers.filter(carrier => !carrier.profile?.isSet || ((!origin || carrier.profile.location === origin) && (!bit || (carrier.profile.deliveryTypes & bit))));
}

function renderMarketplace() {
  const query = ($("#carrierSearch")?.value || "").trim().toLowerCase(); const locationValue = Number($("#carrierLocationFilter")?.value || 0); const speed = Number($("#carrierSpeedFilter")?.value || 0);
  let carriers = state.carriers.filter(carrier => (!query || `${carrier.name} ${carrier.address}`.toLowerCase().includes(query)) && (!locationValue || carrier.profile?.location === locationValue) && (!speed || (carrier.profile?.deliveryTypes & speed)));
  carriers.sort((a, b) => $("#carrierSort")?.value === "reputation" ? Number(b.reputation) - Number(a.reputation) : a.name.localeCompare(b.name));
  $("#carrierMarketplace").innerHTML = carriers.length ? carriers.map(carrier => carrierCard(carrier)).join("") : `<div class="empty-state"><strong>No matching carriers</strong>Try removing one of the marketplace filters.</div>`;
}

function renderActivity() {
  const labels = { AgreementCreated: "Agreement created", AgreementFunded: "Escrow funded", MilestoneReported: "Milestone reported", MilestoneVerified: "Milestone verified", AgreementRefunded: "Agreement refunded", DisputeRaised: "Dispute raised", DisputeResolved: "Dispute resolved", EvidenceSubmitted: "Evidence submitted", CarrierProfileUpdated: "Carrier profile updated", DisplayNameUpdated: "Display name updated" };
  $("#activityFeed").innerHTML = state.activity.length ? state.activity.map(event => `<article class="activity-item"><span>${escapeHtml(labels[event.event] || event.event)}</span><small>Block ${event.blockNumber} · transaction ${shortAddress(event.transactionHash, 10, 6)}</small></article>`).join("") : `<div class="empty-state"><strong>No recent account events</strong>New on-chain activity will appear here.</div>`;
}

function selectCarrier(address) {
  $("#selectedCarrier").value = address;
  $$('[data-select-carrier]').forEach(node => node.classList.toggle("selected", node.dataset.selectCarrier.toLowerCase() === address.toLowerCase()));
  showSection("createSection");
  showToast(`Selected ${shortAddress(address, 8, 6)}.`);
}

function showSection(sectionId) {
  $$(".dashboard-section").forEach(section => section.classList.toggle("hidden", section.id !== sectionId));
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.sectionTarget === sectionId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function addMilestoneRow(type = 1, percentage = "", description = "") {
  const row = $("#milestoneRowTemplate").content.firstElementChild.cloneNode(true);
  $(".milestone-type", row).value = String(type);
  $(".milestone-percentage", row).value = percentage;
  $(".milestone-description", row).value = description;
  $(".other-description", row).classList.toggle("hidden", Number(type) !== 6);
  $("#milestoneRows").append(row);
  updatePercentageTotal();
}

function updatePercentageTotal() {
  const total = $$(".milestone-percentage").reduce((sum, input) => sum + Number(input.value || 0), 0);
  const badge = $("#percentageTotal");
  badge.textContent = `${total} / 100%`;
  badge.classList.toggle("valid", total === 100);
  badge.classList.toggle("invalid", total > 100);
}

function suggestedPrice() {
  const origin = Number($("#origin").value || 1); const destination = Number($("#destination").value || 1);
  const size = Number($("#parcelSize").value || 1); const weight = Number($("#weight").value || 1);
  const speed = Number($("#deliverySpeed").value || 1); const tier = Number($("#guaranteeTier").value || 1);
  const routeFactor = 1 + Math.min(8, Math.abs(origin - destination)) * 0.12;
  const estimate = (0.003 + size * 0.002 + weight * 0.00045) * routeFactor * [0, 1, 1.45, 1.9, 1.25][speed] * [0, 1, 1.2, 1.45][tier];
  return Math.max(0.001, estimate);
}

function updatePriceSuggestion(fillIfEmpty = false) {
  const estimate = suggestedPrice().toFixed(6);
  $("#priceSuggestion").textContent = `Suggested ${estimate} ETH — editable; this estimate is calculated in the browser and is not a fixed on-chain price.`;
  if (fillIfEmpty && !$("#totalValue").value) $("#totalValue").value = estimate;
}

async function createAgreement(event) {
  event.preventDefault();
  if (state.demo) return showToast("Creation is disabled in preview mode.", "error");
  const carrier = $("#selectedCarrier").value;
  const ethValue = $("#totalValue").value;
  const deadline = Math.floor(new Date($("#deadline").value).getTime() / 1000);
  const rows = $$(".milestone-form-row");
  const types = rows.map(row => Number($(".milestone-type", row).value));
  const descriptions = rows.map(row => Number($(".milestone-type", row).value) === 6 ? $(".milestone-description", row).value.trim() : "");
  const percentages = rows.map(row => Number($(".milestone-percentage", row).value));
  const details = [Number($("#origin").value), Number($("#destination").value), Number($("#itemType").value), Number($("#parcelSize").value), String(Math.round(Number($("#weight").value) * 1000)), Number($("#deliverySpeed").value), Number($("#guaranteeTier").value), $("#photoCID").value.trim()];
  if (!carrier) return showToast("Select a registered carrier.", "error");
  if (!ethValue || Number(ethValue) <= 0) return showToast("Enter a total value above zero.", "error");
  if (deadline <= Date.now() / 1000) return showToast("The deadline must be in the future.", "error");
  if (!rows.length || percentages.some(value => !Number.isInteger(value) || value <= 0) || percentages.reduce((a, b) => a + b, 0) !== 100) return showToast("Milestone payouts must be positive whole numbers totaling exactly 100%.", "error");
  if (types.some((type, index) => type === 6 && !descriptions[index])) return showToast("Describe every milestone marked Other.", "error");
  if (new Set(types).size !== types.length) return showToast("Each milestone checkpoint type can only be used once.", "error");
  if (details[0] === details[1]) return showToast("Origin and destination must be different.", "error");
  if (Number(details[4]) <= 0) return showToast("Weight must be greater than zero.", "error");
  if ($("#parcelPhotoFile").files?.length && !details[7]) return showToast("The selected parcel photo is only a local preview. Upload it to IPFS and enter its CID or image URL before creating the agreement.", "error");
  const totalValue = state.web3.utils.toWei(ethValue, "ether");
  try {
    const receipt = await sendTransaction(state.contract.methods.createAgreement(carrier, totalValue, deadline, types, descriptions, percentages, details), {}, "Create agreement");
    if (!receipt) return;
    const createdEvent = receipt.events?.AgreementCreated;
    const agreementId = Number(createdEvent?.returnValues?.agreementId ?? createdEvent?.returnValues?.[0] ?? (await state.contract.methods.agreementCount().call()) - 1);
    if ($("#fundImmediately").checked) await sendTransaction(state.contract.methods.fundAgreement(agreementId), { value: totalValue }, "Fund agreement");
    event.target.reset();
    $("#selectedCarrier").value = "";
    $("#milestoneRows").innerHTML = "";
    addMilestoneRow(1, 30);
    addMilestoneRow(5, 70);
    setDefaultDeadline();
    updatePriceSuggestion(true);
    showSection("agreementsSection");
  } catch (_) { /* sendTransaction already reports the reason */ }
}

async function openAgreement(id, showModal = true) {
  state.currentAgreementId = Number(id);
  let agreement = state.agreements.find(item => item.id === Number(id));
  if (!agreement) return;
  if (!state.demo) agreement = await loadAgreement(id, true);
  renderAgreementDetail(agreement);
  if (showModal && !$("#agreementDialog").open) $("#agreementDialog").showModal();
}

function milestoneName(milestone) {
  return milestone.type === 6 ? (milestone.description || "Other milestone") : MILESTONE_TYPES[milestone.type] || `Milestone ${milestone.index + 1}`;
}

function cidLink(cid) {
  if (!cid) return "";
  const url = imageUrl(cid);
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">View proof ↗</a>` : `<span>${escapeHtml(cid)}</span>`;
}

function imageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const ipfsPath = raw.replace(/^ipfs:\/\//i, "").replace(/^\/ipfs\//i, "");
  if (/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ipfsPath)) return `https://ipfs.io/ipfs/${ipfsPath.split("/").map(encodeURIComponent).join("/")}`;
  return "";
}

function imageProof(cid, alt, caption = "Open original") {
  const url = imageUrl(cid);
  if (!url) return "";
  return `<figure class="proof-image"><a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" data-proof-image></a><figcaption>${escapeHtml(caption)} ↗</figcaption></figure>`;
}

function imageInputMarkup(name, label, description) {
  return `<div class="image-input-card" data-image-input><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div><label class="file-button">Choose photo<input type="file" accept="image/*" data-image-file></label><label>IPFS CID or image URL<input name="${escapeHtml(name)}" type="text" placeholder="bafy… or https://…" data-image-cid></label><figure class="image-preview hidden" data-image-preview-wrap><img alt="${escapeHtml(label)} preview" data-image-preview><figcaption data-image-caption>Photo preview</figcaption></figure></div>`;
}

function updateImagePreview(input) {
  const card = input.closest("[data-image-input]");
  if (!card) return;
  const preview = $("[data-image-preview]", card); const wrap = $("[data-image-preview-wrap]", card); const caption = $("[data-image-caption]", card);
  if (input.matches("[data-image-file]")) {
    const file = input.files?.[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file); wrap.classList.remove("hidden");
    caption.textContent = `${file.name} — local preview only; enter a CID or URL before submitting.`;
    return;
  }
  const url = imageUrl(input.value);
  if (!url) { wrap.classList.add("hidden"); preview.removeAttribute("src"); return; }
  preview.src = url; wrap.classList.remove("hidden"); caption.textContent = "This CID or URL will be saved on-chain.";
}

function milestoneButtons(agreement, milestone) {
  if (!ACTIVE_STATUSES.includes(agreement.status)) return "";
  if (state.role === ROLE.CARRIER && !milestone.reported && agreement.deadline >= Date.now() / 1000) return `<button class="button button-secondary" type="button" data-action="report" data-milestone="${milestone.index}">Report milestone</button>`;
  if (state.role === ROLE.SHIPPER && milestone.reported && !milestone.completed) return `<button class="button button-primary" type="button" data-action="verify" data-milestone="${milestone.index}">Verify & release ${milestone.percentage}%</button>`;
  return "";
}

function timelineEvents(agreement) {
  const events = [];
  agreement.milestones.forEach(milestone => {
    if (milestone.reportedTimestamp) events.push({ timestamp: milestone.reportedTimestamp, title: `${milestoneName(milestone)} reported`, note: milestone.proofCID ? `Proof CID: ${milestone.proofCID}` : "No proof CID attached" });
    if (milestone.completedTimestamp) events.push({ timestamp: milestone.completedTimestamp, title: `${milestoneName(milestone)} verified`, note: `${milestone.percentage}% payout released` });
  });
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function renderAgreementDetail(agreement) {
  const complete = completedMilestones(agreement);
  const events = timelineEvents(agreement);
  const canDispute = [ROLE.SHIPPER, ROLE.CARRIER].includes(state.role) && ACTIVE_STATUSES.includes(agreement.status) && agreement.deadline >= Date.now() / 1000;
  const canRefund = ACTIVE_STATUSES.includes(agreement.status) && agreement.deadline < Date.now() / 1000;
  const isParticipant = [agreement.shipper, agreement.carrier].some(address => address.toLowerCase() === state.account.toLowerCase());
  const disputeReason = agreement.status === 5 ? (agreement.disputeReason === 5 ? agreement.disputeOtherReason : DISPUTE_REASONS[agreement.disputeReason]) : "";
  const details = agreement.details;
  $("#agreementDetail").innerHTML = `
    <div class="detail-head"><span class="section-label">On-chain agreement</span><div class="detail-title-row"><div><h2>Agreement #${agreement.id}</h2><p>${shortAddress(agreement.shipper, 9, 6)} → ${shortAddress(agreement.carrier, 9, 6)}</p></div>${statusPill(agreement.status)}</div></div>
    <div class="detail-body">
      <div class="detail-stats">
        <div class="detail-stat"><span>Total value</span><strong>${formatEth(agreement.totalValue)}</strong></div>
        <div class="detail-stat"><span>Released</span><strong>${formatEth(agreement.releasedAmount)}</strong></div>
        <div class="detail-stat"><span>Current escrow</span><strong>${formatEth(escrowRemaining(agreement))}</strong></div>
        <div class="detail-stat"><span>Deadline</span><strong class="countdown" data-deadline="${agreement.deadline}">${deadlineText(agreement.deadline)}</strong></div>
      </div>
      ${details ? `<div class="shipment-details"><div><span>Route</span><strong>${escapeHtml(LOCATIONS[details.origin])} → ${escapeHtml(LOCATIONS[details.destination])}</strong></div><div><span>Parcel</span><strong>${escapeHtml(ITEM_TYPES[details.itemType])} · ${escapeHtml(PARCEL_SIZES[details.size])}</strong></div><div><span>Service</span><strong>${escapeHtml(DELIVERY_SPEEDS[details.deliverySpeed])} · ${escapeHtml(GUARANTEE_TIERS[details.guaranteeTier])}</strong></div><div><span>Weight</span><strong>${(Number(details.weight) / 1000).toLocaleString()} kg</strong></div></div>${details.photoCID ? `<div class="proof-gallery"><div><span class="section-label">Parcel photo</span>${imageProof(details.photoCID, `Parcel for agreement ${agreement.id}`, "View parcel photo")}</div></div>` : ""}` : ""}
      ${agreement.status === 5 ? `<div class="evidence-card"><span class="section-label">Dispute reason</span><p>${escapeHtml(disputeReason || "Reason unavailable")}</p></div>` : ""}
      <div class="detail-section-title"><h3>Milestone progress</h3><span>${complete} of ${agreement.milestones.length} verified</span></div>
      <div class="milestone-stepper">${agreement.milestones.map(milestone => `
        <div class="milestone-item ${milestone.completed ? "complete" : milestone.reported ? "reported" : ""}">
          <span class="milestone-dot">${milestone.completed ? "✓" : milestone.index + 1}</span>
          <div class="milestone-copy"><h4>${escapeHtml(milestoneName(milestone))}</h4><p>${milestone.completed ? `Verified ${formatDate(milestone.completedTimestamp)}` : milestone.reported ? `Reported ${formatDate(milestone.reportedTimestamp)}` : "Waiting for carrier report"}${milestone.proofCID ? `<br>${cidLink(milestone.proofCID)}` : ""}</p>${milestone.proofCID ? imageProof(milestone.proofCID, `${milestoneName(milestone)} delivery proof`, "View milestone photo") : ""}</div>
          <span class="milestone-payout">${milestone.percentage}%</span>
          <div class="milestone-actions">${milestoneButtons(agreement, milestone)}</div>
        </div>`).join("")}</div>
      <div class="detail-section-title"><h3>Chronological history</h3><span>Newest first</span></div>
      <div class="timeline">${events.length ? events.map(event => `<div class="timeline-event"><strong>${escapeHtml(event.title)}</strong><span>${formatDate(event.timestamp)} · ${escapeHtml(event.note)}</span></div>`).join("") : `<div class="timeline-event"><strong>No milestone activity yet</strong><span>Reports and verifications will appear here.</span></div>`}</div>
      ${agreement.status === 5 ? `<div class="detail-section-title"><h3>Submitted evidence</h3><span>${agreement.evidence?.length || 0} item(s)</span></div><div class="evidence-list">${agreement.evidence?.length ? agreement.evidence.map(item => `<article class="evidence-card"><strong>${shortAddress(item.submittedBy, 9, 6)}</strong><p>${escapeHtml(item.description)}</p><small>${formatDate(item.timestamp)} ${item.fileCID ? `· ${cidLink(item.fileCID)}` : ""}</small>${item.fileCID ? imageProof(item.fileCID, "Dispute evidence", "View evidence photo") : ""}</article>`).join("") : `<div class="empty-state"><strong>No evidence submitted</strong>Participants can attach a description and optional IPFS CID.</div>`}</div>` : ""}
      <div class="detail-actions">
        ${agreement.status === 0 && state.role === ROLE.SHIPPER ? `<button class="button button-primary" type="button" data-action="fund">Fund ${formatEth(agreement.totalValue)}</button>` : ""}
        ${canDispute ? `<button class="button button-danger" type="button" data-action="dispute">Raise dispute</button>` : ""}
        ${canRefund ? `<button class="button button-danger" type="button" data-action="refund">Claim remaining refund</button>` : ""}
        ${agreement.status === 5 && isParticipant ? `<button class="button button-secondary" type="button" data-action="evidence">Submit evidence</button>` : ""}
        ${agreement.status === 5 && state.role === ROLE.ARBITRATOR ? `<button class="button button-secondary" type="button" data-action="resolve-carrier">Pay carrier</button><button class="button button-danger" type="button" data-action="resolve-shipper">Refund shipper</button>` : ""}
      </div>
    </div>`;
  updateCountdowns();
}

function openActionDialog(action, milestoneIndex = null) {
  state.pendingAction = { action, agreementId: state.currentAgreementId, milestoneIndex };
  const title = $("#actionTitle");
  const description = $("#actionDescription");
  const fields = $("#actionFields");
  const submit = $("#actionSubmit");
  fields.innerHTML = "";
  submit.textContent = "Confirm";
  if (action === "report") {
    title.textContent = "Report milestone";
    description.textContent = "Record delivery progress and optionally attach a proof photo. The contract stores its CID or URL.";
    fields.innerHTML = imageInputMarkup("proofCID", "Milestone delivery photo (optional)", "Photograph the parcel, checkpoint, receiver, or delivery document.");
    submit.textContent = "Report on-chain";
  } else if (action === "dispute") {
    title.textContent = "Raise a dispute";
    description.textContent = "Raising a dispute freezes payouts. Optional evidence is submitted in a second wallet transaction after the dispute opens.";
    fields.innerHTML = `<label>Reason<select name="reason" required><option value="1">Milestone not completed</option><option value="2">Proof is insufficient</option><option value="3">Payment is being withheld</option><option value="4">Cargo damaged or lost</option><option value="5">Other</option></select></label><label class="other-reason hidden">Other reason<textarea name="otherReason" placeholder="Explain the issue"></textarea></label><label>Evidence description (optional)<textarea name="evidenceDescription" placeholder="Describe the damage, missing item, or delivery issue"></textarea></label>${imageInputMarkup("evidenceCID", "Dispute evidence photo (optional)", "Add an IPFS CID or image URL. A description is required when evidence is attached.")}`;
  } else if (action === "evidence") {
    title.textContent = "Submit dispute evidence";
    description.textContent = "Evidence is permanently associated with this disputed agreement.";
    fields.innerHTML = `<label>Description<textarea name="description" required placeholder="Explain what this evidence shows"></textarea></label>${imageInputMarkup("fileCID", "Evidence photo or document (optional)", "Enter the uploaded file's IPFS CID or a public URL to save it on-chain.")}`;
    submit.textContent = "Submit evidence";
  }
  $("#actionDialog").showModal();
}

async function handleDetailAction(action, milestoneIndex) {
  const agreement = state.agreements.find(item => item.id === state.currentAgreementId);
  if (!agreement) return;
  if (["report", "dispute", "evidence"].includes(action)) return openActionDialog(action, milestoneIndex);
  if (state.demo) return showToast("Transactions are disabled in preview mode.", "error");
  try {
    if (action === "fund") await sendTransaction(state.contract.methods.fundAgreement(agreement.id), { value: agreement.totalValue }, "Fund agreement");
    if (action === "verify" && confirm("Verify this milestone and release its payout to the carrier?")) await sendTransaction(state.contract.methods.verifyMilestone(agreement.id, milestoneIndex), {}, "Verify milestone");
    if (action === "refund" && confirm("Claim the remaining escrow balance for the shipper?")) await sendTransaction(state.contract.methods.checkAndRefund(agreement.id), {}, "Claim refund");
    if (action === "resolve-shipper" && confirm("Final decision: refund all remaining escrow to the shipper? This cannot be undone.")) await sendTransaction(state.contract.methods.resolveDispute(agreement.id, true), {}, "Resolve dispute for shipper");
    if (action === "resolve-carrier" && confirm("Final decision: release all remaining escrow to the carrier? This cannot be undone.")) await sendTransaction(state.contract.methods.resolveDispute(agreement.id, false), {}, "Resolve dispute for carrier");
  } catch (_) { /* already surfaced */ }
}

async function submitAction(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  const { action, agreementId, milestoneIndex } = state.pendingAction || {};
  const localPhoto = $("[data-image-file]", $("#actionFields"));
  const storedPhoto = $("[data-image-cid]", $("#actionFields"));
  if (localPhoto?.files?.length && !storedPhoto?.value.trim()) return showToast("The selected photo is only a local preview. Upload it to IPFS and enter its CID or image URL before submitting.", "error");
  if (state.demo) {
    $("#actionDialog").close();
    return showToast("Transactions are disabled in preview mode.", "error");
  }
  try {
    if (action === "report") await sendTransaction(state.contract.methods.reportMilestone(agreementId, milestoneIndex, String(data.get("proofCID") || "").trim()), {}, "Report milestone");
    if (action === "dispute") {
      const reason = Number(data.get("reason"));
      const otherReason = reason === 5 ? String(data.get("otherReason") || "").trim() : "";
      const evidenceDescription = String(data.get("evidenceDescription") || "").trim();
      const evidenceCID = String(data.get("evidenceCID") || "").trim();
      if (reason === 5 && !otherReason) return showToast("Enter the other dispute reason.", "error");
      if (evidenceCID && !evidenceDescription) return showToast("Describe what the dispute evidence photo shows.", "error");
      await sendTransaction(state.contract.methods.raiseDispute(agreementId, reason, otherReason), {}, "Raise dispute");
      if (evidenceDescription) await sendTransaction(state.contract.methods.submitEvidence(agreementId, evidenceDescription, evidenceCID), {}, "Submit dispute evidence");
    }
    if (action === "evidence") {
      const description = String(data.get("description") || "").trim();
      if (!description) return showToast("Evidence description is required.", "error");
      await sendTransaction(state.contract.methods.submitEvidence(agreementId, description, String(data.get("fileCID") || "").trim()), {}, "Submit evidence");
    }
    $("#actionDialog").close();
  } catch (_) { /* already surfaced */ }
}

async function registerRole(role) {
  const label = roleLabel(Number(role));
  if (!confirm(`Register this wallet permanently as ${label}? The role cannot be changed later.`)) return;
  try {
    await sendTransaction(state.contract.methods.registerUser(Number(role)), {}, `Register as ${label}`);
    await routeConnectedUser();
  } catch (_) { /* already surfaced */ }
}

function seedDemo() {
  const now = Math.floor(Date.now() / 1000);
  state.account = "0x7D44E39B5Fc66F4D89A0f41e486cF28a73915A80";
  state.chainId = 1337;
  state.role = ROLE.SHIPPER;
  state.isArbitrator = false;
  state.carriers = [
    { address: "0xA4413B7bd46e682feA6aF4339eD1fc6CC940Ab81", name: "Northstar Logistics", profile: { location: 12, deliveryTypes: 7, isSet: true }, reputation: "500" },
    { address: "0x2C990F64c3eF79724D7Dc179f8EA7CcB402CB261", name: "Meridian Freight", profile: { location: 14, deliveryTypes: 3, isSet: true }, reputation: "300" },
    { address: "0x6B86E1a3D577Fd859b7c554734dd45aE347A7C90", name: "GreenRoute Carrier", profile: { location: 7, deliveryTypes: 1, isSet: true }, reputation: "100" }
  ];
  state.agreements = [
    { id: 4, shipper: state.account, carrier: state.carriers[0].address, totalValue: 4.8, fundedAmount: 4.8, releasedAmount: 1.44, deadline: now + 172800, status: 2, details: { origin: 12, destination: 14, itemType: 2, size: 2, weight: 3500, deliverySpeed: 2, guaranteeTier: 2, photoCID: "bafycargo1042" }, milestones: [
      { index: 0, type: 1, description: "", percentage: 30, reported: true, completed: true, reportedTimestamp: now - 72000, completedTimestamp: now - 70000, proofCID: "bafybeipickup1042" },
      { index: 1, type: 3, description: "", percentage: 30, reported: true, completed: false, reportedTimestamp: now - 3600, completedTimestamp: 0, proofCID: "bafybeitransit1042" },
      { index: 2, type: 5, description: "", percentage: 40, reported: false, completed: false, reportedTimestamp: 0, completedTimestamp: 0, proofCID: "" }
    ]},
    { id: 3, shipper: state.account, carrier: state.carriers[1].address, totalValue: 2.25, fundedAmount: 2.25, releasedAmount: 0, deadline: now + 36000, status: 5, details: { origin: 14, destination: 7, itemType: 5, size: 3, weight: 8200, deliverySpeed: 1, guaranteeTier: 3, photoCID: "" }, disputeReason: 2, disputeOtherReason: "", evidence: [
      { submittedBy: state.account, description: "The attached image does not match the sealed cargo ID.", fileCID: "bafybaddocument", timestamp: now - 8200 }
    ], milestones: [
      { index: 0, type: 1, description: "", percentage: 40, reported: true, completed: false, reportedTimestamp: now - 12000, completedTimestamp: 0, proofCID: "bafyproofshipment" },
      { index: 1, type: 5, description: "", percentage: 60, reported: false, completed: false, reportedTimestamp: 0, completedTimestamp: 0, proofCID: "" }
    ]},
    { id: 1, shipper: state.account, carrier: state.carriers[2].address, totalValue: 1.6, fundedAmount: 1.6, releasedAmount: 1.6, deadline: now - 604800, status: 3, details: { origin: 7, destination: 12, itemType: 1, size: 1, weight: 900, deliverySpeed: 1, guaranteeTier: 1, photoCID: "" }, milestones: [
      { index: 0, type: 1, description: "", percentage: 25, reported: true, completed: true, reportedTimestamp: now - 900000, completedTimestamp: now - 899000, proofCID: "" },
      { index: 1, type: 3, description: "", percentage: 25, reported: true, completed: true, reportedTimestamp: now - 800000, completedTimestamp: now - 799000, proofCID: "" },
      { index: 2, type: 5, description: "", percentage: 50, reported: true, completed: true, reportedTimestamp: now - 700000, completedTimestamp: now - 699000, proofCID: "bafyfinaldelivery" }
    ]}
  ];
  state.activity = [{ event: "MilestoneReported", blockNumber: 48, transactionHash: "0x9156f73c8798d74b37aa001734c4795ddf22" }, { event: "AgreementFunded", blockNumber: 41, transactionHash: "0x20d62eaba4aa321a5998d938726c152d8b31" }];
  updateWalletHeader();
  showView("dashboardView");
  configureDashboardForRole();
  $("#contractAddressShort").textContent = "Preview data";
  $("#walletBalance").textContent = "12.46 ETH";
  renderCapabilityNotice();
  renderDashboard();
}

function setDefaultDeadline() {
  const date = new Date(Date.now() + 3 * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  $("#deadline").value = date.toISOString().slice(0, 16);
}

function populateLocationSelects() {
  const options = LOCATIONS.slice(1).map((label, index) => `<option value="${index + 1}">${escapeHtml(label)}</option>`).join("");
  $("#origin").innerHTML = options;
  $("#destination").innerHTML = options;
  $("#origin").value = "12";
  $("#destination").value = "14";
  $("#profileLocation").innerHTML = options;
  $("#carrierLocationFilter").insertAdjacentHTML("beforeend", options);
}

async function saveDisplayName(event) {
  event.preventDefault();
  const name = $("#displayNameInput").value.trim();
  if (state.demo) return showToast("Transactions are disabled in preview mode.", "error");
  try { await sendTransaction(state.contract.methods.setDisplayName(name), {}, "Update display name"); } catch (_) { /* surfaced */ }
}

async function saveCarrierProfile(event) {
  event.preventDefault();
  const locationValue = Number($("#profileLocation").value);
  const mask = $$('[name="deliveryType"]:checked').reduce((sum, input) => sum + Number(input.value), 0);
  if (!mask) return showToast("Select at least one delivery type.", "error");
  if (state.demo) return showToast("Transactions are disabled in preview mode.", "error");
  try { await sendTransaction(state.contract.methods.setCarrierProfile(locationValue, mask), {}, "Update carrier profile"); } catch (_) { /* surfaced */ }
}

function bindEvents() {
  $("#connectButton").addEventListener("click", () => connectWallet(true));
  $$('[data-connect]').forEach(button => button.addEventListener("click", () => connectWallet(true)));
  $("#refreshButton").addEventListener("click", refreshAll);
  $("#profileAddress").addEventListener("click", async () => { await navigator.clipboard.writeText(state.account); showToast("Wallet address copied."); });
  $("#addressForm").addEventListener("submit", async event => {
    event.preventDefault();
    const address = $("#contractAddress").value.trim();
    if (!state.web3?.utils.isAddress(address)) return showToast("Enter a valid Ethereum address.", "error");
    await initializeContract(address);
  });
  $$('[data-register-role]').forEach(button => button.addEventListener("click", () => registerRole(button.dataset.registerRole)));
  $("#agreementForm").addEventListener("submit", createAgreement);
  $("#displayNameForm").addEventListener("submit", saveDisplayName);
  $("#carrierProfileForm").addEventListener("submit", saveCarrierProfile);
  ["carrierSearch", "carrierLocationFilter", "carrierSpeedFilter", "carrierSort"].forEach(id => $("#" + id).addEventListener(id === "carrierSearch" ? "input" : "change", renderMarketplace));
  $("#agreementMonth").addEventListener("change", event => { state.monthFilter = event.target.value; renderAgreementGrid(); });
  $("#agreementDate").addEventListener("change", event => { state.dateFilter = event.target.value; renderAgreementGrid(); });
  $("#clearDateFilters").addEventListener("click", () => { state.monthFilter = state.dateFilter = ""; $("#agreementMonth").value = $("#agreementDate").value = ""; renderAgreementGrid(); });
  ["origin", "destination", "parcelSize", "weight", "deliverySpeed", "guaranteeTier"].forEach(id => {
    $("#" + id).addEventListener("input", () => { updatePriceSuggestion(false); renderCarriers(); });
    $("#" + id).addEventListener("change", () => { updatePriceSuggestion(false); renderCarriers(); });
  });
  $("#addMilestoneButton").addEventListener("click", () => addMilestoneRow());
  $("#milestoneRows").addEventListener("input", updatePercentageTotal);
  $("#milestoneRows").addEventListener("change", event => {
    if (!event.target.matches(".milestone-type")) return;
    const row = event.target.closest(".milestone-form-row");
    const other = $(".other-description", row);
    const isOther = event.target.value === "6";
    other.classList.toggle("hidden", !isOther);
    $(".milestone-description", row).required = isOther;
  });
  $("#milestoneRows").addEventListener("click", event => {
    const button = event.target.closest(".remove-milestone");
    if (!button) return;
    if ($$(".milestone-form-row").length <= 1) return showToast("At least one milestone is required.", "error");
    button.closest(".milestone-form-row").remove();
    updatePercentageTotal();
  });
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-section-target]");
    if (nav) showSection(nav.dataset.sectionTarget);
    const carrier = event.target.closest("[data-select-carrier]");
    if (carrier) selectCarrier(carrier.dataset.selectCarrier);
    const agreement = event.target.closest("[data-agreement-id]");
    if (agreement) openAgreement(agreement.dataset.agreementId);
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      state.filter = filter.dataset.filter;
      $$("[data-filter]").forEach(item => item.classList.toggle("active", item === filter));
      renderAgreementGrid();
      updateCountdowns();
    }
  });
  $("#agreementDetail").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (button) handleDetailAction(button.dataset.action, Number(button.dataset.milestone));
  });
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => $("#agreementDialog").close()));
  $$('[data-close-action-dialog]').forEach(button => button.addEventListener("click", () => $("#actionDialog").close()));
  $("#actionForm").addEventListener("submit", submitAction);
  $("#actionFields").addEventListener("change", event => {
    if (event.target.name === "reason") $(".other-reason")?.classList.toggle("hidden", event.target.value !== "5");
    if (event.target.matches("[data-image-file]")) updateImagePreview(event.target);
  });
  document.addEventListener("input", event => { if (event.target.matches("[data-image-cid]")) updateImagePreview(event.target); });
  document.addEventListener("change", event => { if (event.target.matches("[data-image-file]")) updateImagePreview(event.target); });
  document.addEventListener("error", event => {
    if (!event.target.matches?.("[data-proof-image]") || event.target.dataset.fallback) return;
    event.target.dataset.fallback = "1";
    event.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='280'%3E%3Crect width='100%25' height='100%25' fill='%23edf1ec'/%3E%3Cpath d='M180 150l42-42 34 34 26-25 52 53H160z' fill='%23b6c8bd'/%3E%3Ccircle cx='290' cy='88' r='18' fill='%23c9d6ce'/%3E%3Ctext x='240' y='220' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%235c6d63'%3EPreview unavailable%3C/text%3E%3C/svg%3E";
  }, true);
  [$("#agreementDialog"), $("#actionDialog")].forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
}

async function init() {
  bindEvents();
  populateLocationSelects();
  setDefaultDeadline();
  updatePriceSuggestion(true);
  addMilestoneRow(1, 30);
  addMilestoneRow(5, 70);
  setInterval(updateCountdowns, 30000);
  if (window.ethereum && !state.demo) {
    window.ethereum.on("accountsChanged", accounts => {
      state.account = accounts[0] || null;
      state.contract = null;
      state.agreements = [];
      updateWalletHeader();
      if (state.account) connectWallet(false); else showView("landingView");
    });
    window.ethereum.on("chainChanged", () => location.reload());
    await connectWallet(false);
  }
  if (state.demo) $("#networkBadge span").textContent = "Preview available";
}

document.addEventListener("DOMContentLoaded", init);