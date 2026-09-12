// import { PINATA_JWT } from './config.js';
const ROLE = { NONE: 0, SHIPPER: 1, CARRIER: 2, ARBITRATOR: 3 };
const ROLE_LABELS = ["Unregistered", "Shipper", "Carrier", "Arbitrator"];
const STATUS = ["Created", "Accepted", "Rejected", "Funded", "In progress", "Completed", "Refunded", "Disputed"];
const MILESTONE_TYPES = ["", "Pickup confirmed", "Departed origin", "In-transit checkpoint", "Arrived destination", "Final delivery", "Other"];
const DISPUTE_REASONS = ["", "Milestone not completed", "Delivery evidence is unclear", "Payment is being withheld", "Cargo damaged or lost", "Other"];
const LOCATIONS = ["", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Sabah", "Sarawak", "Selangor", "Terengganu", "Kuala Lumpur", "Putrajaya / Labuan"];
const ITEM_TYPES = ["", "Documents", "Electronics", "Food", "Clothing", "Fragile goods", "Other"];
const PARCEL_SIZES = ["", "Small", "Medium", "Large", "Oversized"];
const DELIVERY_SPEEDS = ["", "Standard", "Express", "Same day"];
const GUARANTEE_TIERS = ["", "Basic", "Protected", "Premium"];
const ACTIVE_STATUSES = [3, 4];
const OPEN_STATUSES = [0, 1, 3, 4];
const CLOSED_STATUSES = [2, 5, 6, 7];
const DATE_FILTER_TABS = ["all", "closed"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';
const PINATA_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI2NjNlZDI5NC1lZjRiLTRiNDctOGQyNy1hNTlhZDQxNDAwMzMiLCJlbWFpbCI6Indlbnh1YW5uODlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImZmMzQ5NmViYzMxZDdjMTMwNWZhIiwic2NvcGVkS2V5U2VjcmV0IjoiMWNkNGJlZmQ3NzcxYWNiMmJmOTRkODBmZjI0NWQ5YzE5MzdiZDE5NmZjNWYyZDIzMzY3YzYxODRkNjY3MTlkYyIsImV4cCI6MTgyMDMxNzU2OX0.1JYGzd4hSomaSwNTCY5X79aEzHOk-7ANmUDMPbxwQoQ';
const REWARD_MIN = 1;
const REWARD_MAX = 500;
const CARRIER_PAGE_SIZE = 6;
const RECENT_AGREEMENT_STATUSES = [1, 3, 4, 5, 6, 7];
const NOTIFICATION_EVENTS = ["AgreementCreated", "AgreementAccepted", "AgreementRejected", "AgreementFunded", "DeadlineExtended", "MilestoneReported", "MilestoneVerified", "AgreementRefunded", "DisputeRaised", "EvidenceSubmitted", "DisputeResolved"];
const ETH_MYR_ENDPOINT = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr&include_last_updated_at=true";

const state = {
  web3: null,
  contract: null,
  artifact: null,
  tokenArtifact: null,
  token: null,
  account: null,
  chainId: null,
  networkId: null,
  role: ROLE.NONE,
  isArbitrator: false,
  agreements: [],
  carriers: [],
  activity: [],
  allActivity: [],
  notifications: [],
  notificationFilter: "unread",
  displayName: "",
  reputation: "0",
  completionReputation: "0",
  disputeReputation: "0",
  arbitratorEarnings: "0",
  completionReward: "100",
  disputeWinReward: "100",
  parcelPhotos: [],
  ethMyrRate: null,
  ethMyrUpdatedAt: null,
  carrierPickerPage: 1,
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

async function uploadToIPFS(file) {
    if (!file) {
        console.warn('No file provided to uploadToIPFS');
        return null;
    }
    
    try {
        showToast('Uploading photo...', 'info');
        
        const formData = new FormData();
        formData.append('file', file);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PINATA_JWT}`  // ← Uses imported key
            },
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Upload failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const cid = result.IpfsHash || result.Hash || result.cid?.['/'] || result.cid?.toString();
        
        if (!cid) {
            throw new Error('No CID returned from IPFS');
        }

        console.log('Uploaded to IPFS:', cid);
        console.log('View at:', `${IPFS_GATEWAY}${cid}`);
        
        showToast('Photo uploaded successfully.', 'success');
        return cid;
        
    } catch (error) {
        console.error('IPFS upload failed:', error);
        if (error.name === 'AbortError') {
            showToast('The photo upload took too long. You can continue without the photo or try again.', 'error');
        } else {
            showToast('The photo could not be uploaded. You can continue without it or try again.', 'error');
        }
        return null;
    }
}

function deadlineLocalDate(deadline) {
  const timestamp = Number(deadline);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : "";
}

function validDate(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day ? value : "";
}

function updateAgreementDateBounds() {
  const dateInput = $("#agreementDate");
  if (!dateInput) return;
  if (!state.monthFilter) {
    dateInput.removeAttribute("min");
    dateInput.removeAttribute("max");
    return;
  }
  const [year, month] = state.monthFilter.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  dateInput.min = `${state.monthFilter}-01`;
  dateInput.max = `${state.monthFilter}-${String(lastDay).padStart(2, "0")}`;
}

function resetAgreementDateFilters(render = false) {
  state.monthFilter = "";
  state.dateFilter = "";
  if ($("#agreementMonth")) $("#agreementMonth").value = "";
  if ($("#agreementDate")) $("#agreementDate").value = "";
  updateAgreementDateBounds();
  if (render) renderAgreementGrid();
}

function setAgreementMonthFilter(value) {
  state.monthFilter = validMonth(value);
  if (state.dateFilter && !state.dateFilter.startsWith(`${state.monthFilter}-`)) {
    state.dateFilter = "";
    $("#agreementDate").value = "";
  }
  updateAgreementDateBounds();
  renderAgreementGrid();
}

function setAgreementDateFilter(value) {
  state.dateFilter = validDate(value);
  if (state.dateFilter) {
    state.monthFilter = state.dateFilter.slice(0, 7);
    $("#agreementMonth").value = state.monthFilter;
  }
  updateAgreementDateBounds();
  renderAgreementGrid();
}

function setAgreementStatusFilter(filter) {
  state.filter = ["all", "active", "attention", "closed"].includes(filter) ? filter : "all";
  $$('[data-filter]').forEach(item => item.classList.toggle("active", item.dataset.filter === state.filter));
  renderAgreementGrid();
  updateCountdowns();
}

function renderAgreementFilterState(resultCount) {
  const dateFiltersEnabled = DATE_FILTER_TABS.includes(state.filter);
  $("#agreementDateFilters")?.classList.toggle("hidden", !dateFiltersEnabled);
  const summary = $("#agreementFilterSummary");
  if (!summary) return;
  const countLabel = `${resultCount} agreement${resultCount === 1 ? "" : "s"}`;
  if (state.filter === "active") return void (summary.textContent = `${countLabel} · closest deadline first`);
  if (state.filter === "attention") return void (summary.textContent = `${countLabel} requiring action`);
  if (state.dateFilter) {
    const [year, month, day] = state.dateFilter.split("-").map(Number);
    const label = new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(new Date(year, month - 1, day));
    return void (summary.textContent = `${countLabel} with deadline on ${label}`);
  }
  if (state.monthFilter) {
    const [year, month] = state.monthFilter.split("-").map(Number);
    const label = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
    return void (summary.textContent = `${countLabel} with deadline in ${label}`);
  }
  summary.textContent = state.filter === "closed" ? `${countLabel} · most recently closed` : countLabel;
}

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

function formatMyrFromEth(ethValue) {
  const amount = Number(ethValue);
  if (!state.ethMyrRate || !Number.isFinite(amount)) return "RM —";
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 }).format(amount * state.ethMyrRate);
}

function formatMyrFromWei(wei) {
  if (!state.ethMyrRate || wei === undefined || wei === null) return "";
  try {
    const eth = state.demo ? Number(wei) : Number(state.web3.utils.fromWei(String(wei), "ether"));
    return formatMyrFromEth(eth);
  } catch (_) { return ""; }
}

function updateMyrEstimate() {
  const value = Number($("#totalValue")?.value || 0);
  const estimate = $("#myrEstimate");
  const status = $("#myrRateStatus");
  if (estimate) estimate.textContent = value > 0 ? `Approximately ${formatMyrFromEth(value)}` : "Enter an ETH amount to see MYR";
  if (!status) return;
  if (!state.ethMyrRate) {
    status.textContent = "The live ETH/MYR rate is unavailable. You can still create the agreement in ETH.";
    return;
  }
  const updated = state.ethMyrUpdatedAt ? new Date(state.ethMyrUpdatedAt * 1000) : new Date();
  status.textContent = `1 ETH ≈ ${formatMyrFromEth(1)} · updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(updated)}`;
}

function loadCachedEthMyrRate() {
  try {
    const cached = JSON.parse(localStorage.getItem("chainfreight:eth-myr") || "null");
    if (cached && Number(cached.rate) > 0) {
      state.ethMyrRate = Number(cached.rate);
      state.ethMyrUpdatedAt = Number(cached.updatedAt) || null;
    }
  } catch (_) { /* Ignore an invalid local cache. */ }
  updateMyrEstimate();
}

async function refreshEthMyrRate(showMessage = false) {
  const button = $("#refreshRateButton");
  if (button) button.disabled = true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(ETH_MYR_ENDPOINT, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error("Rate service unavailable");
    const data = await response.json();
    const rate = Number(data?.ethereum?.myr);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid ETH/MYR rate");
    state.ethMyrRate = rate;
    state.ethMyrUpdatedAt = Number(data?.ethereum?.last_updated_at) || Math.floor(Date.now() / 1000);
    localStorage.setItem("chainfreight:eth-myr", JSON.stringify({ rate, updatedAt: state.ethMyrUpdatedAt }));
    updateMyrEstimate();
    if (state.agreements.length) renderDashboard();
    if (showMessage) showToast("The ETH to MYR estimate has been updated.");
  } catch (_) {
    updateMyrEstimate();
    if (showMessage) showToast("The live MYR rate could not be updated. You can still use ETH.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function statusClass(status) {
  return `status-${(STATUS[status] || "Unknown").toLowerCase().replace(/\s+/g, "")}`;
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}">${escapeHtml(STATUS[status] || `Unknown (${status})`)}</span>`;
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
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), type === "error" ? 7000 : 4800);
}

function showValidationError(message, selector) {
  showToast(message, "error");
  const field = selector ? $(selector) : null;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus({ preventScroll: true });
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.classList.add("input-error");
    setTimeout(() => {
      field.classList.remove("input-error");
      field.removeAttribute("aria-invalid");
    }, 7000);
  }
  return false;
}

function readableError(error) {
  const raw = error?.message || String(error || "Unknown error");
  const revert = raw.match(/revert(?:ed)?(?: with reason string)?[\s:'"]+([^"\n]+)/i);
  if (error?.code === 4001 || /user denied|user rejected/i.test(raw)) return "You cancelled the request in MetaMask. No changes were made.";
  if (/insufficient funds/i.test(raw)) return "This wallet does not have enough ETH for the payment and network fee.";
  if (/network|connection|failed to fetch|disconnected/i.test(raw)) return "The app cannot reach the blockchain. Check your connection and make sure MetaMask is using the correct network.";
  const reason = revert ? revert[1].replace(/["'}].*$/, "").trim() : "";
  const friendly = [
    [/Already registered/i, "This wallet already has a role and cannot register again."],
    [/Not registered/i, "Register this wallet as a shipper or carrier before continuing."],
    [/Only Shipper/i, "Only the shipper for this agreement can do this."],
    [/Only.*Carrier|agreement's carrier/i, "Only the carrier assigned to this agreement can do this."],
    [/Only arbitrator/i, "Only the arbitrator wallet can do this."],
    [/Not a participant/i, "Only the shipper or carrier in this agreement can do this."],
    [/Agreement does not exist/i, "This agreement could not be found. Refresh the page and try again."],
    [/Agreement not in required status/i, "This action is not available at the current stage of the agreement."],
    [/Selected address is not a registered Carrier/i, "The selected wallet is not registered as a carrier. Choose another carrier."],
    [/Must fund exact total value/i, "Send the exact agreement amount shown on the page."],
    [/Deadline has passed/i, "The delivery deadline has passed. Check the refund or dispute options."],
    [/Deadline has not passed yet/i, "A refund is available only after the delivery deadline has passed."],
    [/New deadline must be later/i, "Choose a date later than the current delivery deadline."],
    [/Agreement is closed/i, "This agreement is closed, so its deadline cannot be changed."],
    [/not funded\/active|not in a payable state/i, "This action is available only after the agreement has been funded."],
    [/inactive or finalized/i, "A dispute can be raised only for an active, funded agreement."],
    [/not in refundable status/i, "This agreement is not ready for a refund."],
    [/Milestone already reported/i, "This milestone has already been reported."],
    [/Milestone already completed|Milestone already verified/i, "This milestone has already been verified and paid."],
    [/Milestone has not been reported/i, "The carrier must report this milestone before the shipper can verify it."],
    [/Invalid milestone index/i, "This milestone could not be found. Refresh the agreement and try again."],
    [/percentages must sum to 100/i, "Milestone payouts must add up to exactly 100%."],
    [/At least one milestone/i, "Add at least one delivery milestone."],
    [/Other description required/i, "Enter a short description for every milestone marked Other."],
    [/Origin and destination must differ/i, "Pickup and delivery locations must be different."],
    [/Display name is too long/i, "Use a display name with no more than 64 characters."],
    [/Invalid location/i, "Choose a location from the list."],
    [/Invalid delivery type/i, "Choose at least one available delivery type."],
    [/Invalid dispute reason/i, "Choose a dispute reason from the list."],
    [/Other reason required/i, "Explain the dispute reason before continuing."],
    [/Agreement is not disputed|not in Disputed status/i, "This action is available only while the agreement has an active dispute."],
    [/Description required/i, "Enter a short description of the evidence."],
    [/No remaining funds/i, "There is no money left in escrow to refund."],
    [/Payout exceeds escrow balance/i, "The requested payment is higher than the money remaining in escrow."],
    [/transfer.*failed|withdrawal failed|Payout to carrier failed/i, "The wallet transfer failed. No money was lost; please try again."],
    [/No commission/i, "There is no commission available to withdraw."],
    [/greater than zero/i, `Enter a reward from ${REWARD_MIN} to ${REWARD_MAX} points.`],
    [/exceeds maximum/i, `The maximum reward is ${REWARD_MAX} points.`]
  ];
  const match = friendly.find(([pattern]) => pattern.test(reason || raw));
  if (match) return match[1];
  if (reason) return `This action could not be completed: ${reason}`;
  console.error("Blockchain request failed:", error);
  return "This action could not be completed. Check MetaMask and the agreement status, then try again.";
}

function completedActionMessage(label) {
  const messages = {
    "Create agreement": "Agreement created. The carrier can now accept or reject it.",
    "Accept agreement": "Agreement accepted. The shipper can now fund it.",
    "Reject agreement": "Agreement rejected. It cannot be funded.",
    "Fund agreement": "Agreement funded. The carrier can now report delivery progress.",
    "Report milestone": "Milestone update sent to the shipper.",
    "Verify milestone": "Milestone verified and payment released to the carrier.",
    "Extend deadline": "Delivery deadline updated.",
    "Claim refund": "Remaining money returned to the shipper.",
    "Raise dispute": "Dispute opened. Further payments are paused.",
    "Submit dispute evidence": "Evidence added to the dispute.",
    "Submit evidence": "Evidence added to the dispute.",
    "Resolve dispute for shipper": "Dispute resolved. Remaining money returned to the shipper.",
    "Resolve dispute for carrier": "Dispute resolved. Remaining money released to the carrier.",
    "Update display name": "Display name updated.",
    "Update carrier profile": "Carrier profile updated.",
    "Withdraw commission": "Commission sent to the arbitrator wallet.",
    "Update completion reward": "Completed-delivery reward updated.",
    "Update dispute reward": "Dispute-win reward updated."
  };
  if (label.startsWith("Register as ")) return `${label.replace("Register as ", "")} registration complete.`;
  return messages[label] || `${label} completed successfully.`;
}

function setTransactionState(visible, title = "Confirm in MetaMask", message = "Review the details in MetaMask, then select Confirm.") {
  $("#transactionOverlay").classList.toggle("hidden", !visible);
  $("#transactionTitle").textContent = title;
  $("#transactionMessage").textContent = message;
}

async function sendTransaction(method, options, label) {
  if (state.demo) {
    showToast("This action is unavailable in preview mode.", "error");
    return null;
  }
  setTransactionState(true, "Confirm in MetaMask", `Review the ${label.toLowerCase()} details, then select Confirm.`);
  try {
    const receipt = await method.send({ from: state.account, ...options });
    const successMessage = completedActionMessage(label);
    setTransactionState(true, "Saved", successMessage);
    await refreshAll();
    showToast(successMessage);
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
    showToast("MetaMask is not available. Install or enable it, then reload this page.", "error");
    return;
  }
  if (typeof Web3 === "undefined") {
    showToast("The app did not load correctly. Restart it with npm run dev, then refresh this page.", "error");
    return;
  }
  try {
    const method = requestAccess ? "eth_requestAccounts" : "eth_accounts";
    const accounts = await window.ethereum.request({ method });
    if (!accounts.length) return;
    state.web3 = new Web3(window.ethereum);
    state.account = accounts[0];
    [state.chainId, state.networkId] = await Promise.all([
      state.web3.eth.getChainId().then(Number),
      state.web3.eth.net.getId().then(Number)
    ]);
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
      if (!response.ok) throw new Error("The Escrow contract file is missing. Compile the contracts, then reload the page.");
      state.artifact = await response.json();
    }

    const deploymentKey = state.networkId ?? state.chainId;
    const savedAddress = localStorage.getItem(`escrowAddress:${deploymentKey}`) || localStorage.getItem(`escrowAddress:${state.chainId}`);
    const deployed = state.artifact.networks?.[String(deploymentKey)]?.address || state.artifact.networks?.[String(state.chainId)]?.address;
    const address = manualAddress || savedAddress || deployed;
    if (!address || !state.web3.utils.isAddress(address) || address === ZERO_ADDRESS) {
      showSetup("No Escrow contract was found on this network. Run the contract migration, then reload the page.");
      return;
    }
    const code = await state.web3.eth.getCode(address);
    if (!code || code === "0x") {
      showSetup(`No contract was found at ${shortAddress(address)} on ${networkName(state.chainId)}. Check the address and MetaMask network.`);
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
    localStorage.setItem(`escrowAddress:${deploymentKey}`, address);
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
  setTransactionState(true, "Loading your workspace", "Checking your wallet role and agreements…");
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
  $$(".participant-only").forEach(node => node.classList.toggle("role-hidden", isArbitrator));
  
  $("#profileRole").textContent = roleLabel(state.role);
  $("#profileAddress").textContent = shortAddress(state.account, 8, 6);
  $("#profileAvatar").textContent = state.account.slice(2, 4).toUpperCase();
  $("#profileAvatar").style.background = avatarColor(state.account).replace("86%", "34%");
  $("#dashboardEyebrow").textContent = `${roleLabel(state.role)} dashboard`;
  $("#dashboardGreeting").textContent = isArbitrator ? "Dispute centre" : `Welcome back, ${roleLabel(state.role).toLowerCase()}`;
  $("#dashboardIntro").textContent = isArbitrator ? "Review disputes and decide who receives the remaining money." : "View your delivery agreements and next actions.";
  $("#notificationHeading").textContent = isArbitrator ? "Disputes waiting for a decision" : isShipper ? "Delivery updates" : "Requests and delivery updates";
  $("#agreementSectionTitle").textContent = isArbitrator ? "Dispute centre" : "Your agreements";
  $("#agreementSectionCopy").textContent = isArbitrator ? "Review open and decided disputes, including all submitted evidence." : "Open an agreement to view its payment, deadline and delivery history.";
  $("#allFilterButton").textContent = isArbitrator ? "All disputes" : "All";
  $("#activeFilterButton").textContent = isArbitrator ? "Active" : "Active";
  $("#closedFilterButton").textContent = isArbitrator ? "Resolved" : "Closed";
  $("#attentionFilterButton").classList.toggle("hidden", isArbitrator);
  
  state.filter = "all";
  resetAgreementDateFilters(false);
  $$('[data-filter]').forEach(item => item.classList.toggle("active", item.dataset.filter === "all"));

  $("#statOneLabel").textContent = "Wallet balance";
  $("#statOneHelp").textContent = "Available in this wallet";
  $("#statTwoLabel").textContent = "Locked in escrow";
  $("#statTwoHelp").textContent = "Payment waiting to be released";
  $("#statThreeLabel").textContent = "Active agreements";
  $("#statThreeHelp").textContent = "Funded or in progress";
  $("#statFourLabel").textContent = "Completed";
  $("#statFourHelp").textContent = "Successfully settled";

  if (isArbitrator) {
    $("#statOneLabel").textContent = "Open agreements";
    $("#statOneHelp").textContent = "Not yet completed or refunded";
    $("#statTwoLabel").textContent = "Active disputes";
    $("#statTwoHelp").textContent = "Waiting for your decision";
    $("#statThreeLabel").textContent = "Completed agreements";
    $("#statThreeHelp").textContent = "Successfully settled";
    $("#statFourLabel").textContent = "Resolved disputes";
    $("#statFourHelp").textContent = "A final decision was made";
  }
}

async function refreshAll() {
  if (!state.contract && !state.demo) return;
  try {
    await Promise.all([refreshBalances(), refreshCarriers(), refreshAgreements(), refreshProfile(), refreshArbitratorControls()]);
    await refreshActivity();
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
  if (state.role === ROLE.CARRIER) {
    try { state.reputation = state.token ? await state.token.methods.balanceOf(state.account).call() : "0"; } catch (_) { state.reputation = "0"; }
    try { state.completionReputation = await state.contract.methods.completionReputationEarned(state.account).call(); } catch (_) { state.completionReputation = "0"; }
    try { state.disputeReputation = await state.contract.methods.disputeReputationEarned(state.account).call(); } catch (_) { state.disputeReputation = "0"; }
  }
  $("#displayNameInput").value = state.displayName || "";
  const points = Number(state.reputation || 0);
  const stars = Math.min(5, Math.floor(points / 100));
  $("#reputationStars").textContent = `${"★".repeat(stars)}${"☆".repeat(5 - stars)}`;
  $("#reputationPoints").textContent = `${points.toLocaleString()} point${points === 1 ? "" : "s"}`;
  $("#completionReputation").textContent = Number(state.completionReputation || 0).toLocaleString();
  $("#disputeReputation").textContent = Number(state.disputeReputation || 0).toLocaleString();
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
  if (state.role !== ROLE.ARBITRATOR) return;
  const missing = ["acceptAgreement", "rejectAgreement", "extendDeadline", "withdrawCommission", "setCompletionReward", "setDisputeWinReward"].filter(name => !supportsMethod(name));
  $("#backendCapabilityText").textContent = missing.length
    ? "Some features are unavailable because this contract version is out of date. Deploy the latest contracts to enable every action."
    : "All features are available with this contract.";
}

async function refreshArbitratorControls() {
  if (state.role !== ROLE.ARBITRATOR || state.demo) return;
  try {
    const [earnings, completion, dispute] = await Promise.all([
      state.contract.methods.arbitratorEarnings().call(),
      state.contract.methods.completionReward().call(),
      state.contract.methods.disputeWinReward().call()
    ]);
    state.arbitratorEarnings = earnings;
    state.completionReward = completion;
    state.disputeWinReward = dispute;
    $("#arbitratorEarnings").textContent = formatEth(earnings);
    $("#completionRewardInput").value = completion;
    $("#disputeRewardInput").value = dispute;
    $("#withdrawCommissionButton").disabled = BigInt(earnings) === 0n;
  } catch (_) { /* capability notice explains older deployments */ }
}

async function refreshActivity() {
  if (state.demo) return;
  try {
    const events = await state.contract.getPastEvents("allEvents", { 
      fromBlock: 0, 
      toBlock: "latest" 
    });
    
    const participantAgreementIds = new Set(state.agreements.map(agreement => String(agreement.id)));
    const acceptedAgreementIds = new Set(state.agreements.filter(agreement => RECENT_AGREEMENT_STATUSES.includes(agreement.status)).map(agreement => String(agreement.id)));
    const participantEvents = state.role === ROLE.ARBITRATOR ? events : events.filter(event => {
      const agreementId = event.returnValues?.agreementId;
      return agreementId !== undefined && participantAgreementIds.has(String(agreementId));
    });
    const relevant = participantEvents.slice(-200).reverse();
    const blockNumbers = [...new Set(relevant.map(event => event.blockNumber))];
    const blocks = await Promise.all(blockNumbers.map(number => state.web3.eth.getBlock(number)));
    const timestamps = Object.fromEntries(blocks.map(block => [block.number, Number(block.timestamp)]));
    state.allActivity = relevant
      .map(event => ({ ...event, timestamp: timestamps[event.blockNumber] || 0 }))
      .sort((a, b) => b.timestamp - a.timestamp || b.blockNumber - a.blockNumber);
    state.activity = state.allActivity
      .filter(event => {
        const agreementId = event.returnValues?.agreementId;
        return state.role === ROLE.ARBITRATOR || (agreementId !== undefined && acceptedAgreementIds.has(String(agreementId)));
      })
      .slice(0, 50);
    buildNotifications();
    renderActivity();
  } catch (_) {
    state.activity = [];
    state.allActivity = [];
    buildNotifications();
  }
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
  if (includeEvidence && agreement.disputeReason > 0) {
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
  state.agreements = all;
}

function escrowRemaining(agreement) {
  if (state.demo) return Math.max(0, Number(agreement.fundedAmount) - Number(agreement.releasedAmount));
  try { return (BigInt(agreement.fundedAmount) - BigInt(agreement.releasedAmount)).toString(); } catch (_) { return "0"; }
}

function completedMilestones(agreement) {
  return agreement.milestones.filter(milestone => milestone.completed).length;
}

function needsAttention(agreement) {

  if (agreement.status === 7) return true;
  if ([3, 4].includes(agreement.status) && agreement.deadline < Date.now() / 1000) return true;
  
  if (state.role === ROLE.SHIPPER) {
    if (agreement.status === 0) return true;
    
    if (agreement.status === 1) return true;

    if ([3, 4].includes(agreement.status) && 
        agreement.milestones.some(m => m.reported && !m.completed)) return true;
    
    if ([3, 4].includes(agreement.status) && 
        agreement.milestones.some(m => !m.reported && !m.completed)) return true;
  }
  

  if (state.role === ROLE.CARRIER) {

    if (agreement.status === 0) return true;

    if (agreement.status === 1) return true;
    
    if ([3, 4].includes(agreement.status) && 
        agreement.milestones.some(m => !m.reported && !m.completed)) return true;
  }
  
  return false;
}

function renderDashboard() {
  const created = state.agreements.filter(a => a.status === 0).length;
  const accepted = state.agreements.filter(a => a.status === 1).length;
  const rejected = state.agreements.filter(a => a.status === 2).length;
  const funded = state.agreements.filter(a => a.status === 3).length;
  const inProgress = state.agreements.filter(a => a.status === 4).length;
  const completed = state.agreements.filter(a => a.status === 5).length;
  const refunded = state.agreements.filter(a => a.status === 6).length;
  const disputed = state.agreements.filter(a => a.status === 7).length;

  const active = funded + inProgress;
  const open = created + accepted + funded + inProgress;
  const total = state.agreements.length;
  const activeDisputes = state.agreements.filter(a => a.status === 7).length;
  const resolvedDisputes = state.agreements.filter(a => a.disputeReason > 0 && a.status !== 7).length;
  
  const totalEscrow = state.agreements.reduce((sum, agreement) => {
    if (state.demo) return sum + escrowRemaining(agreement);
    return sum + BigInt(escrowRemaining(agreement));
  }, state.demo ? 0 : 0n);
  
  if (state.role !== ROLE.ARBITRATOR) {
    $("#escrowBalance").textContent = formatEth(totalEscrow);
    $("#activeCount").textContent = active;
    $("#completedCount").textContent = completed;
    $("#agreementNavCount").textContent = total;
  }

  if (state.role === ROLE.ARBITRATOR) {

    $("#walletBalance").textContent = open;
    $("#escrowBalance").textContent = activeDisputes;
    $("#activeCount").textContent = completed;
    $("#completedCount").textContent = resolvedDisputes;
    $("#agreementNavCount").textContent = activeDisputes + resolvedDisputes;
  }
  renderRecentAgreements();
  renderAgreementGrid();
  renderCarriers();
  renderActivity();
  renderNotifications();
  updateCountdowns();
}

function renderRecentAgreements() {
  const container = $("#recentAgreementList");
  const recent = (state.role === ROLE.ARBITRATOR ? state.agreements.filter(agreement => agreement.disputeReason > 0) : state.agreements.filter(agreement => RECENT_AGREEMENT_STATUSES.includes(agreement.status))).slice(0, 4);
  if (!recent.length) {
    container.innerHTML = `<div class="empty-state"><strong>No accepted agreements yet</strong>${state.role === ROLE.SHIPPER ? "Accepted delivery requests will appear here." : state.role === ROLE.CARRIER ? "Accepted work will appear here. Check Notifications for new requests." : "Active and resolved disputes will appear here."}</div>`;
    return;
  }
  container.innerHTML = recent.map(agreement => {
    return `<article class="agreement-row" data-agreement-id="${agreement.id}" tabindex="0">
      <span class="agreement-row-icon">#${agreement.id}</span>
      <div class="agreement-row-main"><strong>Agreement #${agreement.id}</strong><small>Shipper wallet: ${shortAddress(agreement.shipper, 8, 5)}</small><small>Carrier wallet: ${shortAddress(agreement.carrier, 8, 5)}</small></div>
      <div class="agreement-row-meta"><strong>${formatEth(agreement.totalValue)}</strong><small>${formatMyrFromWei(agreement.totalValue)}</small><small class="countdown" data-deadline="${agreement.deadline}">${deadlineText(agreement.deadline)}</small></div>
      ${statusPill(agreement.status)}
    </article>`;
  }).join("");
}

function notificationStorageKey() {
  const address = state.contract?.options?.address || "preview";
  return `chainfreight:read-notifications:${state.chainId || state.networkId || "local"}:${String(address).toLowerCase()}:${String(state.account || "guest").toLowerCase()}`;
}

function readNotificationIds() {
  try { return new Set(JSON.parse(localStorage.getItem(notificationStorageKey()) || "[]")); }
  catch (_) { return new Set(); }
}

function saveReadNotificationIds(ids) {
  localStorage.setItem(notificationStorageKey(), JSON.stringify([...ids].slice(-1000)));
}

function notificationCopy(event, agreement) {
  const milestoneIndex = Number(event.returnValues?.milestoneIndex ?? -1);
  const milestone = agreement.milestones?.[milestoneIndex];
  const milestoneLabel = milestone ? milestoneName(milestone) : `Milestone ${milestoneIndex + 1}`;
  const amount = event.returnValues?.amount ?? event.returnValues?.payoutAmount;
  const lastVerifiedEvent = state.allActivity.find(item => item.event === "MilestoneVerified" && String(item.returnValues?.agreementId) === String(agreement.id));
  const completesAgreement = agreement.status === 5 && lastVerifiedEvent === event;
  const copies = {
    AgreementCreated: { level: "attention", title: `New delivery request: Agreement #${agreement.id}`, message: "Review the delivery details, then accept or reject it." },
    AgreementAccepted: { level: "success", title: `Agreement #${agreement.id} accepted`, message: "The carrier accepted your request. You can now add the payment to escrow." },
    AgreementRejected: { level: "danger", title: `Agreement #${agreement.id} rejected`, message: "The carrier declined your request. Create a new agreement with another carrier." },
    AgreementFunded: { level: "success", title: `Payment received for Agreement #${agreement.id}`, message: `${amount ? `${formatEth(amount)} is now held safely. ` : "The payment is now held safely. "}You can begin the delivery.` },
    DeadlineExtended: { level: "attention", title: `Deadline changed for Agreement #${agreement.id}`, message: `The shipper changed the delivery deadline to ${formatDate(event.returnValues?.newDeadline)}.` },
    MilestoneReported: { level: "attention", title: `New delivery update: ${milestoneLabel}`, message: `The carrier updated Agreement #${agreement.id}. Review the update before releasing payment.` },
    MilestoneVerified: completesAgreement
      ? { level: "success", title: `Agreement #${agreement.id} completed`, message: `${milestoneLabel} was approved. All delivery milestones are now complete.` }
      : { level: "success", title: `${milestoneLabel} approved`, message: `${amount ? `${formatEth(amount)} was paid to the carrier.` : "The milestone payment was sent to the carrier."}` },
    AgreementRefunded: { level: "success", title: `Refund sent for Agreement #${agreement.id}`, message: `${amount ? `${formatEth(amount)} was returned` : "The remaining money was returned"} to the shipper.` },
    DisputeRaised: { level: "danger", title: `Dispute opened for Agreement #${agreement.id}`, message: "Payments are paused until the arbitrator makes a decision." },
    EvidenceSubmitted: { level: "attention", title: `New dispute evidence for Agreement #${agreement.id}`, message: "New information was added to the dispute. Open the agreement to review it." },
    DisputeResolved: { level: "success", title: `Dispute decided for Agreement #${agreement.id}`, message: /shipper/i.test(event.returnValues?.resolution || "") ? "The remaining money was returned to the shipper." : /carrier/i.test(event.returnValues?.resolution || "") ? "The remaining money was released to the carrier." : "The arbitrator has made a final decision." }
  };
  return copies[event.event];
}

function notificationApplies(event, agreement) {
  if (!NOTIFICATION_EVENTS.includes(event.event)) return false;
  if (event.event === "EvidenceSubmitted" && String(event.returnValues?.submittedBy || "").toLowerCase() === String(state.account || "").toLowerCase()) return false;
  if (state.role === ROLE.ARBITRATOR) return ["DisputeRaised", "EvidenceSubmitted"].includes(event.event);
  if (state.role === ROLE.SHIPPER) return ["AgreementAccepted", "AgreementRejected", "MilestoneReported", "MilestoneVerified", "AgreementRefunded", "DisputeRaised", "EvidenceSubmitted", "DisputeResolved"].includes(event.event);
  if (state.role === ROLE.CARRIER) return ["AgreementCreated", "AgreementFunded", "DeadlineExtended", "MilestoneVerified", "DisputeRaised", "EvidenceSubmitted", "DisputeResolved"].includes(event.event);
  return false;
}

function buildNotifications() {
  const readIds = readNotificationIds();
  state.notifications = state.allActivity.flatMap((event, index) => {
    const agreementId = event.returnValues?.agreementId;
    const agreement = state.agreements.find(item => String(item.id) === String(agreementId));
    if (!agreement || !notificationApplies(event, agreement)) return [];
    const copy = notificationCopy(event, agreement);
    if (!copy) return [];
    const id = `${event.transactionHash || event.blockHash || "event"}:${event.logIndex ?? index}:${event.event}:${agreement.id}`;
    return [{ id, agreement, agreementId: agreement.id, timestamp: event.timestamp || 0, read: readIds.has(id), ...copy }];
  });
}

function markNotificationRead(id) {
  const item = state.notifications.find(notification => notification.id === id);
  if (!item || item.read) return;
  item.read = true;
  const readIds = readNotificationIds();
  readIds.add(id);
  saveReadNotificationIds(readIds);
  renderNotifications();
}

function markAllNotificationsRead() {
  const readIds = readNotificationIds();
  state.notifications.forEach(item => { item.read = true; readIds.add(item.id); });
  saveReadNotificationIds(readIds);
  renderNotifications();
  showToast("All messages marked as read.");
}

function notificationMarkup(item, compact = false) {
  return `<button class="notification-item ${item.level} ${item.read ? "read" : "unread"}" type="button" data-notification-id="${escapeHtml(item.id)}" data-agreement-id="${item.agreementId}">
    <span class="notification-dot"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small>${compact ? "" : `<time>${item.timestamp ? formatDate(item.timestamp) : "Recent update"}</time>`}</span><span aria-hidden="true">→</span>
  </button>`;
}

function renderNotifications() {
  const container = $("#notificationList");
  const count = $("#notificationCount");
  if (!container || !count) return;
  const unread = state.notifications.filter(item => !item.read);
  count.textContent = String(unread.length);
  count.classList.toggle("hidden", unread.length === 0);
  const navCount = $("#notificationNavCount");
  if (navCount) { navCount.textContent = String(unread.length); navCount.classList.toggle("hidden", unread.length === 0); }
  const unreadCount = $("#unreadNotificationCount");
  if (unreadCount) unreadCount.textContent = String(unread.length);
  const emptyMessage = state.role === ROLE.CARRIER ? "New delivery requests, payments and decisions will appear here." : state.role === ROLE.SHIPPER ? "Carrier replies, delivery updates, refunds and decisions will appear here." : "New disputes will appear here for review.";
  container.innerHTML = unread.length ? unread.slice(0, 4).map(item => notificationMarkup(item, true)).join("") + (unread.length > 4 ? `<button class="text-button notification-view-all" type="button" data-section-target="notificationsSection">View all ${unread.length} unread messages →</button>` : "") : `<div class="empty-state compact"><strong>No unread notifications</strong>${escapeHtml(emptyMessage)}</div>`;

  const centre = $("#notificationCentreList");
  if (!centre) return;
  const filtered = state.notificationFilter === "all" ? state.notifications : state.notifications.filter(item => state.notificationFilter === "read" ? item.read : !item.read);
  const emptyHeading = state.notificationFilter === "unread" ? "No unread messages" : state.notificationFilter === "read" ? "No read messages" : "No messages yet";
  centre.innerHTML = filtered.length ? filtered.map(item => notificationMarkup(item)).join("") : `<div class="empty-state"><strong>${emptyHeading}</strong>Your agreement updates will appear here.</div>`;
  $$('[data-notification-filter]').forEach(button => button.classList.toggle("active", button.dataset.notificationFilter === state.notificationFilter));
  const markAll = $("#markAllNotificationsRead");
  if (markAll) markAll.disabled = unread.length === 0;
}

function agreementMatchesFilter(agreement) {
  let matchesStatus = true;
  if (state.role === ROLE.ARBITRATOR) {
    matchesStatus = agreement.disputeReason > 0;
    if (state.filter === "active" || state.filter === "attention") matchesStatus = agreement.status === 7;
    if (state.filter === "closed") matchesStatus = agreement.disputeReason > 0 && agreement.status !== 7;
  } else {
    if (state.filter === "active") matchesStatus = OPEN_STATUSES.includes(agreement.status);
    if (state.filter === "attention") matchesStatus = needsAttention(agreement);
    if (state.filter === "closed") matchesStatus = CLOSED_STATUSES.includes(agreement.status);
  }
  if (!matchesStatus) return false;
  if (!DATE_FILTER_TABS.includes(state.filter)) return true;
  const localDate = deadlineLocalDate(agreement.deadline);
  if (state.monthFilter && !localDate.startsWith(`${state.monthFilter}-`)) return false;
  if (state.dateFilter && localDate !== state.dateFilter) return false;
  return true;
}

function renderAgreementGrid() {
  const container = $("#agreementGrid");
  const agreements = state.agreements.filter(agreementMatchesFilter).sort((a, b) => {
    const activeA = OPEN_STATUSES.includes(a.status); const activeB = OPEN_STATUSES.includes(b.status);
    if (activeA !== activeB) return activeA ? -1 : 1;
    if (activeA) return a.deadline - b.deadline || b.id - a.id;
    return b.deadline - a.deadline || b.id - a.id;
  });
  renderAgreementFilterState(agreements.length);
  if (!agreements.length) {
    container.innerHTML = `<div class="empty-state"><strong>No matching agreements</strong>Change or clear the filters to see more agreements.</div>`;
    return;
  }
  container.innerHTML = agreements.map(agreement => {
    const complete = completedMilestones(agreement);
    const total = agreement.milestones.length;
    const progress = total ? Math.round(complete / total * 100) : 0;
    return `<article class="agreement-card" data-agreement-id="${agreement.id}" tabindex="0">
      <div class="agreement-card-top"><div><span class="section-label">Agreement #${agreement.id}</span><h3>${agreement.details ? `${escapeHtml(LOCATIONS[agreement.details.origin])} → ${escapeHtml(LOCATIONS[agreement.details.destination])}` : "Delivery agreement"}</h3><p>${agreement.details ? escapeHtml(ITEM_TYPES[agreement.details.itemType]) : "Shipment details unavailable"}</p><p>Deadline ${formatDate(agreement.deadline)}</p></div>${statusPill(agreement.status)}</div>
      <div class="agreement-parties compact"><span><b>Shipper wallet</b>${shortAddress(agreement.shipper, 10, 6)}</span><span><b>Carrier wallet</b>${shortAddress(agreement.carrier, 10, 6)}</span></div>
      <div class="agreement-finance"><div><span>Total</span><strong>${formatEth(agreement.totalValue)}</strong><small>${formatMyrFromWei(agreement.totalValue)}</small></div><div><span>Released</span><strong>${formatEth(agreement.releasedAmount)}</strong></div><div><span>In escrow</span><strong>${formatEth(escrowRemaining(agreement))}</strong></div></div>
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
        quick.innerHTML = `<div class="empty-state"><strong>No carriers registered yet</strong>A carrier must register before a shipper can create an agreement.</div>`;
        picker.innerHTML = `<div class="empty-state"><strong>No carriers available</strong>Ask a carrier to register and complete their service profile.</div>`;
        marketplace.innerHTML = picker.innerHTML;
        return;
    }
    quick.innerHTML = state.carriers.slice(0, 4).map(carrierCardSmall).join("");
    updateCarrierPicker();
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
  const selectedAddress = $("#selectedCarrier")?.value || "";
  const isSelected = selectOnly && selectedAddress.toLowerCase() === carrier.address.toLowerCase();
  return `<article class="carrier-card marketplace-card ${selectOnly ? "selectable" : ""} ${isSelected ? "selected" : ""}" ${selectOnly ? `data-select-carrier="${carrier.address}" tabindex="0"` : ""}>${selectOnly ? `<span class="selected-badge">Selected</span>` : ""}<span class="identicon" style="--avatar-color:${avatarColor(carrier.address)}">${carrier.address.slice(2,4).toUpperCase()}</span><div><strong>${escapeHtml(carrier.name)}</strong><small>${shortAddress(carrier.address, 10, 6)}</small><p>${carrier.profile?.isSet ? escapeHtml(LOCATIONS[carrier.profile.location]) : "Location not set"} · ${escapeHtml(deliveryLabels(carrier.profile?.deliveryTypes))}</p><span class="rating">${escapeHtml(reputationLabel(carrier.reputation))}</span></div>${selectOnly ? `<button class="button button-secondary carrier-select-button" type="button" data-select-carrier="${carrier.address}">${isSelected ? "Selected" : "Select"}</button>` : `<button class="button button-primary" type="button" data-select-carrier="${carrier.address}">Create agreement</button>`}</article>`;
}

function matchingCarriersForForm() {
    const destination = Number($("#destination")?.value || 0);
    const speed = Number($("#deliverySpeed")?.value || 0);
    const speedBit = speed <= 3 ? 2 ** (speed - 1) : 0;
    
    return state.carriers.filter(carrier => {
       
        if (!carrier.profile?.isSet) return false;
        
        if (destination && carrier.profile.location !== destination) return false;
        
        if (speedBit && !(carrier.profile.deliveryTypes & speedBit)) return false;
        
        return true;
    });
}

function updateCarrierPicker(resetPage = false) {
    const picker = $("#carrierPicker");
    const destination = Number($("#destination")?.value || 0);
    const speed = Number($("#deliverySpeed")?.value || 0);
    const query = ($("#carrierPickerSearch")?.value || "").trim().toLowerCase();
    const summary = $("#carrierPickerSummary");
    const pagination = $("#carrierPickerPagination");
    let matchingCarriers = matchingCarriersForForm().filter(carrier => !query || `${carrier.name} ${carrier.address}`.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
    if (resetPage) state.carrierPickerPage = 1;
    
    if (!destination) {
        picker.innerHTML = `
            <div class="empty-state">
                <strong>Select a destination first</strong>
                <p>Choose the delivery destination to see carriers serving that location.</p>
            </div>
        `;
        $("#selectedCarrier").value = "";
        if (summary) summary.textContent = "Choose a destination and delivery type first.";
        pagination?.classList.add("hidden");
        return;
    }

    if (matchingCarriers.length === 0) {
        const speedLabel = speed ? DELIVERY_SPEEDS[speed] : "selected";
        picker.innerHTML = `
            <div class="empty-state">
                <strong>No carriers match</strong>
                <p>No carriers serving ${LOCATIONS[destination]} offer ${speedLabel} delivery.</p>
                <p style="font-size:12px;margin-top:8px;">Try changing the destination or delivery type.</p>
            </div>
        `;
        $("#selectedCarrier").value = "";
        if (summary) summary.textContent = query ? "No carrier matches your search, destination and delivery type." : "No carrier matches this destination and delivery type.";
        pagination?.classList.add("hidden");
        return;
    }

    const totalPages = Math.max(1, Math.ceil(matchingCarriers.length / CARRIER_PAGE_SIZE));
    state.carrierPickerPage = Math.min(Math.max(1, state.carrierPickerPage), totalPages);
    const start = (state.carrierPickerPage - 1) * CARRIER_PAGE_SIZE;
    const visibleCarriers = matchingCarriers.slice(start, start + CARRIER_PAGE_SIZE);
    picker.innerHTML = visibleCarriers.map(carrier => carrierCard(carrier, true)).join("");
    if (summary) summary.textContent = `${matchingCarriers.length} matching carrier${matchingCarriers.length === 1 ? "" : "s"} · showing ${start + 1}–${Math.min(start + CARRIER_PAGE_SIZE, matchingCarriers.length)} · up to ${CARRIER_PAGE_SIZE} per page`;
    if (pagination) {
      pagination.classList.toggle("hidden", totalPages <= 1);
      $("#carrierPickerPage").textContent = `Page ${state.carrierPickerPage} of ${totalPages}`;
      $("#carrierPickerPrev").disabled = state.carrierPickerPage === 1;
      $("#carrierPickerNext").disabled = state.carrierPickerPage === totalPages;
    }
    if (matchingCarriers.length === 1) {
        selectCarrier(matchingCarriers[0].address);
    }
}

function changeCarrierPickerPage(direction) {
  state.carrierPickerPage += direction;
  updateCarrierPicker(false);
  $("#carrierPickerTools")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateSpeedOptions() {
    const speedSelect = $("#deliverySpeed");
    
    speedSelect.innerHTML = `
        <option value="">Select speed...</option>
        <option value="1">Standard</option>
        <option value="2">Express</option>
        <option value="3">Same day</option>
    `;
}

function getAvailableSpeedsForCarrier(carrierAddress) {
    const carrier = state.carriers.find(c => c.address.toLowerCase() === carrierAddress.toLowerCase());
    if (!carrier || !carrier.profile?.isSet) return [];
    
    const mask = carrier.profile.deliveryTypes;
    const speeds = [];
    if (mask & 1) speeds.push({ value: 1, label: "Standard" });
    if (mask & 2) speeds.push({ value: 2, label: "Express" });
    if (mask & 4) speeds.push({ value: 3, label: "Same day" });
    return speeds;
}

function updateDeliverySpeedOptions() {
    const carrierAddress = $("#selectedCarrier").value;
    const speedSelect = $("#deliverySpeed");
    const availableSpeeds = getAvailableSpeedsForCarrier(carrierAddress);
    
    speedSelect.innerHTML = '<option value="">Select speed...</option>';
    
    if (availableSpeeds.length === 0) {
        speedSelect.innerHTML = '<option value="">No speeds available</option>';
        return;
    }
    
    availableSpeeds.forEach(speed => {
        const option = document.createElement('option');
        option.value = speed.value;
        option.textContent = speed.label;
        speedSelect.appendChild(option);
    });
}

function selectCarrier(address) {
    const input = $("#selectedCarrier");
    const alreadySelected = input.value.toLowerCase() === address.toLowerCase();
    const createPageIsOpen = !$("#createSection").classList.contains("hidden");
    input.value = address;
    $$('[data-select-carrier]').forEach(node => {
        node.classList.toggle("selected", node.dataset.selectCarrier.toLowerCase() === address.toLowerCase());
    });
    $$(".carrier-select-button").forEach(button => {
      button.textContent = button.dataset.selectCarrier.toLowerCase() === address.toLowerCase() ? "Selected" : "Select";
    });
    if (!createPageIsOpen) showSection("createSection");
    if (alreadySelected) return;
    const carrier = state.carriers.find(item => item.address.toLowerCase() === address.toLowerCase());
    showToast(`${carrier?.name || "Carrier"} selected.`);
}

function renderMarketplace() {
  const query = ($("#carrierSearch")?.value || "").trim().toLowerCase(); const locationValue = Number($("#carrierLocationFilter")?.value || 0); const speed = Number($("#carrierSpeedFilter")?.value || 0);
  let carriers = state.carriers.filter(carrier => (!query || `${carrier.name} ${carrier.address}`.toLowerCase().includes(query)) && (!locationValue || carrier.profile?.location === locationValue) && (!speed || (carrier.profile?.deliveryTypes & speed)));
  carriers.sort((a, b) => $("#carrierSort")?.value === "reputation" ? Number(b.reputation) - Number(a.reputation) : a.name.localeCompare(b.name));
  $("#carrierMarketplace").innerHTML = carriers.length ? carriers.map(carrier => carrierCard(carrier)).join("") : `<div class="empty-state"><strong>No matching carriers</strong>Change or clear the filters to see more carriers.</div>`;
}
function renderActivity() {
  const labels = { 
    AgreementCreated: "Delivery agreement created", 
    AgreementAccepted: "Agreement accepted", 
    AgreementRejected: "Agreement rejected", 
    AgreementFunded: "Payment added to escrow", 
    DeadlineExtended: "Delivery deadline changed", 
    MilestoneReported: "Delivery update reported", 
    MilestoneVerified: "Milestone approved and paid", 
    AgreementRefunded: "Refund sent to shipper", 
    DisputeRaised: "Dispute raised", 
    DisputeResolved: "Dispute decided", 
    EvidenceSubmitted: "Evidence submitted", 
    CommissionCollected: "Service fee collected", 
    CommissionWithdrawn: "Service fee sent to arbitrator", 
    ReputationRewardsUpdated: "Carrier reward settings changed", 
    CarrierProfileUpdated: "Carrier services updated", 
    DisplayNameUpdated: "Display name updated" 
  };
  
  if (!state.activity.length) {
    $("#activityFeed").innerHTML = `<div class="empty-state"><strong>No activity yet</strong>Updates will appear after a carrier accepts an agreement.</div>`;
    return;
  }
  
  $("#activityFeed").innerHTML = state.activity.map(event => {
    const label = labels[event.event] || event.event;
    let extraInfo = '';

    if (event.returnValues?.agreementId !== undefined) {
      extraInfo = ` · Agreement #${event.returnValues.agreementId}`;
    }

    if (event.returnValues?.amount !== undefined) {
      extraInfo += ` · ${formatEth(event.returnValues.amount)}`;
    }

    let who = '';
    if (event.returnValues?.shipper) who = `Shipper: ${shortAddress(event.returnValues.shipper, 6, 4)}`;
    else if (event.returnValues?.carrier) who = `Carrier: ${shortAddress(event.returnValues.carrier, 6, 4)}`;
    
    return `<article class="activity-item">
      <span>${escapeHtml(label)}${extraInfo}</span>
      <small>${event.timestamp ? formatDate(event.timestamp) : 'Just now'}${who ? ' · ' + who : ''}</small>
    </article>`;
  }).join("");
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
  $("#priceSuggestion").textContent = `Suggested amount: ${estimate} ETH. You can change it.`;
  if (fillIfEmpty && !$("#totalValue").value) $("#totalValue").value = estimate;
  updateMyrEstimate();
}

async function createAgreement(event) {
    event.preventDefault();
    if (state.demo) return showToast("Agreement creation is unavailable in preview mode. Connect to Ganache to create one.", "error");

    const carrier = $("#selectedCarrier").value;
    const ethValue = $("#totalValue").value;
    const deadline = Math.floor(new Date($("#deadline").value).getTime() / 1000);
    const rows = $$(".milestone-form-row");
    const types = rows.map(row => Number($(".milestone-type", row).value));
    const descriptions = rows.map(row => Number($(".milestone-type", row).value) === 6 ? $(".milestone-description", row).value.trim() : "");
    const percentages = rows.map(row => Number($(".milestone-percentage", row).value));
    const selectedSpeed = Number($("#deliverySpeed").value);
    const origin = Number($("#origin").value);
    const destination = Number($("#destination").value);

    if (!origin) return showValidationError("Choose the parcel pickup location.", "#origin");
    if (!destination) return showValidationError("Choose the parcel delivery location.", "#destination");
    if (origin === destination) return showValidationError("Pickup and delivery locations must be different.", "#destination");
    if (Number($("#weight").value) <= 0) return showValidationError("Enter a parcel weight greater than 0 kg.", "#weight");
    if (!selectedSpeed) return showValidationError("Choose a delivery speed.", "#deliverySpeed");
    if (!carrier) return showValidationError("Choose a carrier that serves this destination and offers the selected delivery type.", "#carrierPickerSearch");

    const carrierData = state.carriers.find(c => c.address.toLowerCase() === carrier.toLowerCase());
    if (carrierData && carrierData.profile?.isSet) {
        const speedBit = selectedSpeed <= 3 ? 2 ** (selectedSpeed - 1) : 0;
        if (carrierData.profile.location !== destination) {
            return showValidationError("The selected carrier does not serve this destination. Choose a carrier from the updated list.", "#carrierPickerSearch");
        }
        if (!(carrierData.profile.deliveryTypes & speedBit)) {
            return showValidationError("The selected carrier does not offer this delivery type. Choose another carrier.", "#carrierPickerSearch");
        }
    }
    
    if (!ethValue || Number(ethValue) <= 0) return showValidationError("Enter the agreement value in ETH. It must be greater than zero.", "#totalValue");
    if (!deadline || deadline <= Date.now() / 1000) return showValidationError("Choose a delivery deadline later than the current date and time.", "#deadline");
    
    if (!rows.length || percentages.some(value => !Number.isInteger(value) || value <= 0) || percentages.reduce((a, b) => a + b, 0) !== 100) {
        return showValidationError("Check the milestone payouts. Use positive whole numbers that add up to exactly 100%.", ".milestone-percentage");
    }
    
    if (types.some((type, index) => type === 6 && !descriptions[index])) {
        return showValidationError("Add a short description for each milestone marked Other.", ".milestone-description");
    }
    
    if (new Set(types).size !== types.length) {
        return showValidationError("The same milestone cannot be added twice. Choose a different checkpoint for each row.", ".milestone-type");
    }

    let photoCID = "";
    if (state.parcelPhotos.length > 0) {
        setTransactionState(true, "Uploading parcel photo", "Please wait while the photo is uploaded.");
        try {
            const file = state.parcelPhotos[0].file;
            photoCID = (await uploadToIPFS(file)) || "";
            if (photoCID) {
                console.log('Parcel photo uploaded:', photoCID);
                showToast('Parcel photo uploaded.', 'success');
            }
        } catch (error) {
            console.error('Photo upload failed:', error);
            showToast('The parcel photo could not be uploaded. The agreement will be created without it.', 'error');
            photoCID = "";
        } finally {
            setTransactionState(false);
        }
    }

    const details = [
        Number($("#origin").value),
        Number($("#destination").value),
        Number($("#itemType").value),
        Number($("#parcelSize").value),
        String(Math.round(Number($("#weight").value) * 1000)),
        Number($("#deliverySpeed").value),
        Number($("#guaranteeTier").value),
        photoCID
    ];
    
    const totalValue = state.web3.utils.toWei(ethValue, "ether");

    try {
        const receipt = await sendTransaction(
            state.contract.methods.createAgreement(
                carrier,
                totalValue,
                deadline,
                types,
                descriptions,
                percentages,
                details
            ),
            {},
            "Create agreement"
        );
        
        if (!receipt) return;
 
        event.target.reset();
        clearParcelPhotos();
        $("#selectedCarrier").value = "";
        $("#milestoneRows").innerHTML = "";
        addMilestoneRow(1, 30);
        addMilestoneRow(5, 70);
        setDefaultDeadline();
        updatePriceSuggestion(true);
      
        updateCarrierPicker();
        
        showSection("agreementsSection");
        
    } catch (_) {
        // Error already handled by sendTransaction
    }
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
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">View photo or file ↗</a>` : `<span>Attachment unavailable</span>`;
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
  return `<div class="image-input-card" data-image-input><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></div><label class="file-button">Choose photo<input name="${escapeHtml(name)}" type="file" accept="image/*" data-image-file></label><figure class="image-preview hidden" data-image-preview-wrap><img alt="${escapeHtml(label)} preview" data-image-preview><figcaption data-image-caption>Photo preview</figcaption></figure></div>`;
}

function updateImagePreview(input) {
  const card = input.closest("[data-image-input]");
  if (!card) return;
  const preview = $("[data-image-preview]", card); const wrap = $("[data-image-preview-wrap]", card); const caption = $("[data-image-caption]", card);
  delete preview.dataset.fallback;
  if (input.matches("[data-image-file]")) {
    const file = input.files?.[0];
    if (!file) return;
    preview.src = URL.createObjectURL(file); wrap.classList.remove("hidden");
    caption.textContent = `${file.name} selected.`;
    return;
  }
}

function parcelPhotoKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function syncParcelPhotoInput() {
  const input = $("#parcelPhotoFile");
  if (!input || typeof DataTransfer === "undefined") return;
  const transfer = new DataTransfer();
  state.parcelPhotos.forEach(item => transfer.items.add(item.file));
  input.files = transfer.files;
}

function renderParcelPhotoPreviews() {
  const grid = $("#parcelPhotoGrid");
  const count = state.parcelPhotos.length;
  $("#parcelPhotoCount").textContent = count ? `${count} photo${count === 1 ? "" : "s"} selected` : "No photos selected";
  grid.classList.toggle("hidden", count === 0);
  grid.innerHTML = state.parcelPhotos.map((item, index) => `<figure class="selected-photo">
    <button class="photo-remove" type="button" data-parcel-photo-remove="${index}" aria-label="Remove ${escapeHtml(item.file.name)}">×</button>
    <button class="photo-open" type="button" data-parcel-photo-open="${index}" aria-label="Enlarge ${escapeHtml(item.file.name)}"><img src="${escapeHtml(item.url)}" alt="Selected parcel photo ${index + 1}"></button>
    <figcaption title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</figcaption>
  </figure>`).join("");
}

function addParcelPhotos(input) {
  const existing = new Set(state.parcelPhotos.map(item => item.key));
  [...(input.files || [])].forEach(file => {
    if (!file.type.startsWith("image/")) return;
    const key = parcelPhotoKey(file);
    if (!existing.has(key)) {
      state.parcelPhotos.push({ file, key, url: URL.createObjectURL(file) });
      existing.add(key);
    }
  });
  syncParcelPhotoInput();
  renderParcelPhotoPreviews();
}

function removeParcelPhoto(index) {
  const [removed] = state.parcelPhotos.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.url);
  syncParcelPhotoInput();
  renderParcelPhotoPreviews();
}

function clearParcelPhotos() {
  state.parcelPhotos.forEach(item => URL.revokeObjectURL(item.url));
  state.parcelPhotos = [];
  const input = $("#parcelPhotoFile");
  if (input) input.value = "";
  renderParcelPhotoPreviews();
}

function openParcelPhoto(index) {
  const item = state.parcelPhotos[index];
  if (!item) return;
  $("#photoLightboxImage").src = item.url;
  $("#photoLightboxCaption").textContent = item.file.name;
  $("#photoLightbox").showModal();
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
    if (milestone.reportedTimestamp) events.push({ timestamp: milestone.reportedTimestamp, title: `${milestoneName(milestone)} reported`, note: milestone.proofCID ? "Delivery photo attached" : "No delivery photo attached" });
    if (milestone.completedTimestamp) events.push({ timestamp: milestone.completedTimestamp, title: `${milestoneName(milestone)} approved`, note: `${milestone.percentage}% payment released` });
  });
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

function renderAgreementDetail(agreement) {
  const complete = completedMilestones(agreement);
  
  const canDispute = [ROLE.SHIPPER, ROLE.CARRIER].includes(state.role) && 
                     [3, 4].includes(agreement.status) && 
                     agreement.deadline >= Date.now() / 1000;
  
  const canRefund = [3, 4].includes(agreement.status) && 
                    agreement.deadline < Date.now() / 1000;
  
  const isParticipant = [agreement.shipper, agreement.carrier].some(address => 
    address.toLowerCase() === state.account.toLowerCase()
  );
  
  const disputeReason = agreement.disputeReason > 0 ? 
    (agreement.disputeReason === 5 ? agreement.disputeOtherReason : DISPUTE_REASONS[agreement.disputeReason]) : 
    "";
  
  const details = agreement.details;
  
  $("#agreementDetail").innerHTML = `
    <div class="detail-head">
      <span class="section-label">Agreement details</span>
      <div class="detail-title-row">
        <div>
          <h2>Agreement #${agreement.id}</h2>
          <p>View the shipper, carrier, payment and delivery progress.</p>
        </div>
        ${statusPill(agreement.status)}
      </div>
    </div>
    
    <div class="detail-body">
      <div class="agreement-parties">
        <div><span>Shipper MetaMask wallet</span><strong>${escapeHtml(agreement.shipper)}</strong><button type="button" class="copy-inline" data-copy-address="${escapeHtml(agreement.shipper)}">Copy shipper address</button></div>
        <div><span>Carrier MetaMask wallet</span><strong>${escapeHtml(agreement.carrier)}</strong><button type="button" class="copy-inline" data-copy-address="${escapeHtml(agreement.carrier)}">Copy carrier address</button></div>
      </div>
      <div class="detail-stats">
        <div class="detail-stat">
            <span>Agreement amount</span>
          <strong>${formatEth(agreement.totalValue)}</strong>
          <small>${formatMyrFromWei(agreement.totalValue)}</small>
        </div>
        <div class="detail-stat">
            <span>Paid to carrier</span>
          <strong>${formatEth(agreement.releasedAmount)}</strong>
        </div>
        <div class="detail-stat">
            <span>Still in escrow</span>
          <strong>${formatEth(escrowRemaining(agreement))}</strong>
        </div>
        <div class="detail-stat">
          <span>Deadline</span>
          <strong class="countdown" data-deadline="${agreement.deadline}">${deadlineText(agreement.deadline)}</strong>
        </div>
      </div>
      
      ${details ? `
        <div class="shipment-details">
          <div>
            <span>Route</span>
            <strong>${escapeHtml(LOCATIONS[details.origin])} → ${escapeHtml(LOCATIONS[details.destination])}</strong>
          </div>
          <div>
            <span>Parcel</span>
            <strong>${escapeHtml(ITEM_TYPES[details.itemType])} · ${escapeHtml(PARCEL_SIZES[details.size])}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>${escapeHtml(DELIVERY_SPEEDS[details.deliverySpeed])} · ${escapeHtml(GUARANTEE_TIERS[details.guaranteeTier])}</strong>
          </div>
          <div>
            <span>Weight</span>
            <strong>${(Number(details.weight) / 1000).toLocaleString()} kg</strong>
          </div>
        </div>
        ${details.photoCID ? `
          <div class="proof-gallery">
            <div>
              <span class="section-label">Parcel photo</span>
              ${imageProof(details.photoCID, `Parcel for agreement ${agreement.id}`, "View parcel photo")}
            </div>
          </div>
        ` : ""}
      ` : ""}
      
      ${agreement.disputeReason > 0 ? `
        <div class="evidence-card">
          <span class="section-label">${agreement.status === 7 ? "Active dispute" : "Resolved dispute"}</span>
          <p>${escapeHtml(disputeReason || "Reason unavailable")}</p>
        </div>
      ` : ""}
      
      <div class="detail-section-title">
        <h3>Delivery milestones and history</h3>
        <span>${complete} of ${agreement.milestones.length} completed</span>
      </div>
      
      <div class="milestone-stepper">
        ${agreement.milestones.map(milestone => `
          <div class="milestone-item ${milestone.completed ? "complete" : milestone.reported ? "reported" : ""}">
            <span class="milestone-dot">${milestone.completed ? "✓" : milestone.index + 1}</span>
            <div class="milestone-copy">
              <h4>${escapeHtml(milestoneName(milestone))}</h4>
              <div class="milestone-history">
                ${milestone.reportedTimestamp ? `<span><b>Carrier sent an update</b>${formatDate(milestone.reportedTimestamp)}</span>` : `<span class="pending"><b>Waiting for carrier</b>No update has been sent for this milestone.</span>`}
                ${milestone.completedTimestamp ? `<span><b>Shipper approved this milestone</b>${formatDate(milestone.completedTimestamp)} · ${milestone.percentage}% of the agreement amount paid</span>` : milestone.reported ? `<span class="pending"><b>Waiting for shipper</b>The shipper must review this update before payment is released.</span>` : ""}
                ${milestone.proofCID ? `<span><b>Delivery photo</b>${cidLink(milestone.proofCID)}</span>` : ""}
              </div>
              ${milestone.proofCID ? imageProof(milestone.proofCID, `${milestoneName(milestone)} delivery proof`, "View milestone photo") : ""}
            </div>
            <span class="milestone-payout">${milestone.percentage}%</span>
            <div class="milestone-actions">${milestoneButtons(agreement, milestone)}</div>
          </div>
        `).join("")}
      </div>
      
      ${agreement.disputeReason > 0 ? `
        <div class="detail-section-title">
          <h3>Submitted evidence</h3>
          <span>${agreement.evidence?.length || 0} item(s)</span>
        </div>
        <div class="evidence-list">
          ${agreement.evidence?.length ? 
            agreement.evidence.map(item => `
              <article class="evidence-card">
                <strong>${shortAddress(item.submittedBy, 9, 6)}</strong>
                <p>${escapeHtml(item.description)}</p>
                <small>
                  ${formatDate(item.timestamp)} 
                  ${item.fileCID ? `· ${cidLink(item.fileCID)}` : ""}
                </small>
                ${item.fileCID ? imageProof(item.fileCID, "Dispute evidence", "View evidence photo") : ""}
              </article>
            `).join("") : 
            `<div class="empty-state">
              <strong>No evidence submitted</strong>
              <p>No participant evidence was attached to this dispute.</p>
            </div>`
          }
        </div>
      ` : ""}
      
      <div class="detail-actions">
        <!-- Created (0): Carrier can Accept/Reject -->
        ${agreement.status === 0 && state.role === ROLE.CARRIER ? `
          <button class="button button-primary" type="button" data-action="accept">Accept agreement</button>
          <button class="button button-danger" type="button" data-action="reject">Reject agreement</button>
        ` : ""}
        
        <!-- Created (0): Shipper waits -->
        ${agreement.status === 0 && state.role === ROLE.SHIPPER ? `
          <span class="action-note">Waiting for the carrier to accept or reject this agreement.</span>
        ` : ""}
        
        <!-- Accepted (1): Shipper can FUND -->
        ${agreement.status === 1 && state.role === ROLE.SHIPPER ? `
          <button class="button button-primary" type="button" data-action="fund">Fund ${formatEth(agreement.totalValue)}</button>
        ` : ""}
        
        <!-- Accepted (1): Carrier waits -->
        ${agreement.status === 1 && state.role === ROLE.CARRIER ? `
          <span class="action-note">Accepted. Waiting for the shipper to add the payment.</span>
        ` : ""}
        
        <!-- Rejected (2) -->
        ${agreement.status === 2 ? `
          <span class="action-note">This agreement was rejected and cannot be funded.</span>
        ` : ""}
        
        <!-- Funded/InProgress (3,4): Shipper can Extend deadline -->
        ${state.role === ROLE.SHIPPER && ![2,5,6,7].includes(agreement.status) ? `
          <button class="button button-secondary" type="button" data-action="extend">Extend deadline</button>
        ` : ""}
        
        <!-- Funded/InProgress (3,4): Participants can Dispute -->
        ${canDispute ? `
          <button class="button button-danger" type="button" data-action="dispute">Raise dispute</button>
        ` : ""}
        
        <!-- Funded/InProgress (3,4): Shipper can Refund if deadline passed -->
        ${canRefund ? `
          <button class="button button-danger" type="button" data-action="refund">Claim remaining refund</button>
        ` : ""}
        
        <!-- Disputed (7): Participants can Submit Evidence -->
        ${agreement.status === 7 && isParticipant ? `
          <button class="button button-secondary" type="button" data-action="evidence">Submit evidence</button>
        ` : ""}
        
        <!-- Disputed (7): Arbitrator can Resolve -->
        ${agreement.status === 7 && state.role === ROLE.ARBITRATOR ? `
          <button class="button button-secondary" type="button" data-action="resolve-carrier">Pay carrier</button>
          <button class="button button-danger" type="button" data-action="resolve-shipper">Refund shipper</button>
        ` : ""}
      </div>
    </div>
  `;
  
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
    description.textContent = "Send a delivery update to the shipper. You may also add a photo.";
    fields.innerHTML = imageInputMarkup("proofCID", "Delivery photo (optional)", "Add a photo of the parcel, checkpoint, receiver or delivery document.");
    submit.textContent = "Send update";
  } else if (action === "extend") {
    const agreement = state.agreements.find(item => item.id === state.currentAgreementId);
    const minimum = new Date(Math.max(Date.now() + 60000, (agreement?.deadline + 60) * 1000));
    minimum.setMinutes(minimum.getMinutes() - minimum.getTimezoneOffset());
    title.textContent = "Extend delivery deadline";
    description.textContent = "Choose a date and time later than the current deadline.";
    fields.innerHTML = `<label>New deadline<input name="newDeadline" type="datetime-local" min="${minimum.toISOString().slice(0, 16)}" value="${minimum.toISOString().slice(0, 16)}" required></label>`;
    submit.textContent = "Extend deadline";
  } else if (action === "dispute") {
    title.textContent = "Raise a dispute";
    description.textContent = "Opening a dispute pauses all payments. If you add evidence, MetaMask will ask you to confirm twice.";
    fields.innerHTML = `<label>Reason<select name="reason" required><option value="1">Milestone not completed</option><option value="2">Delivery evidence is unclear</option><option value="3">Payment is being withheld</option><option value="4">Cargo damaged or lost</option><option value="5">Other</option></select></label><label class="other-reason hidden">Other reason<textarea name="otherReason" placeholder="Explain the issue"></textarea></label><label>Evidence description (optional)<textarea name="evidenceDescription" placeholder="Describe the damage, missing item, or delivery issue"></textarea></label>${imageInputMarkup("evidenceCID", "Dispute evidence photo (optional)", "Choose a supporting photo to preview before submitting.")}`;
  } else if (action === "evidence") {
    title.textContent = "Submit dispute evidence";
    description.textContent = "Add information or a photo to help the arbitrator make a decision.";
    fields.innerHTML = `<label>Description<textarea name="description" required placeholder="Explain what this evidence shows"></textarea></label>${imageInputMarkup("fileCID", "Evidence photo or document (optional)", "Choose a supporting photo to preview before submitting.")}`;
    submit.textContent = "Submit evidence";
  }
  $("#actionDialog").showModal();
}

async function handleDetailAction(action, milestoneIndex) {
  const agreement = state.agreements.find(item => item.id === state.currentAgreementId);
  if (!agreement) return;
  if (["report", "dispute", "evidence", "extend"].includes(action)) return openActionDialog(action, milestoneIndex);
  if (state.demo) return showToast("This action is unavailable in preview mode.", "error");
  try {
    if (action === "accept" && confirm("Accept this delivery request? The shipper will then be able to add the payment.")) await sendTransaction(state.contract.methods.acceptAgreement(agreement.id), {}, "Accept agreement");
    if (action === "reject" && confirm("Reject this delivery request? This agreement will close and cannot be funded.")) await sendTransaction(state.contract.methods.rejectAgreement(agreement.id), {}, "Reject agreement");
    if (action === "fund") await sendTransaction(state.contract.methods.fundAgreement(agreement.id), { value: agreement.totalValue }, "Fund agreement");
    if (action === "verify" && confirm("Approve this milestone and pay the carrier? This cannot be undone.")) await sendTransaction(state.contract.methods.verifyMilestone(agreement.id, milestoneIndex), {}, "Verify milestone");
    if (action === "refund" && confirm("Return all money still in escrow to the shipper?")) await sendTransaction(state.contract.methods.checkAndRefund(agreement.id), {}, "Claim refund");
    if (action === "resolve-shipper" && confirm("Return all remaining money to the shipper? This decision cannot be undone.")) await sendTransaction(state.contract.methods.resolveDispute(agreement.id, true), {}, "Resolve dispute for shipper");
    if (action === "resolve-carrier" && confirm("Pay all remaining money to the carrier? This decision cannot be undone.")) await sendTransaction(state.contract.methods.resolveDispute(agreement.id, false), {}, "Resolve dispute for carrier");
  } catch (_) { /* already surfaced */ }
}

async function submitAction(event) {
    event.preventDefault();
    const data = new FormData(event.target);
    const { action, agreementId, milestoneIndex } = state.pendingAction || {};
    
    if (state.demo) {
        $("#actionDialog").close();
        return showToast("This action is unavailable in preview mode.", "error");
    }
    
    try {

        if (action === "report") {
            let proofCID = "";
            const fileInput = document.querySelector('[name="proofCID"]');

            if (fileInput?.files?.length > 0) {
                setTransactionState(true, "Uploading delivery photo", "Please wait while the photo is uploaded.");
                try {
                    proofCID = (await uploadToIPFS(fileInput.files[0])) || "";
                    if (proofCID) {
                        console.log('Milestone proof uploaded:', proofCID);
                        showToast('Delivery photo uploaded.', 'success');
                    }
                } catch (error) {
                    console.error('Proof upload failed:', error);
                    showToast('The delivery photo could not be uploaded. You can send the update without it.', 'error');
                    proofCID = "";
                } finally {
                    setTransactionState(false);
                }
            }
            
            await sendTransaction(
                state.contract.methods.reportMilestone(agreementId, milestoneIndex, proofCID),
                {},
                "Report milestone"
            );
        }

        if (action === "extend") {
            const agreement = state.agreements.find(item => item.id === Number(agreementId));
            const newDeadline = Math.floor(new Date(String(data.get("newDeadline"))).getTime() / 1000);
            if (!newDeadline || newDeadline <= Date.now() / 1000 || newDeadline <= agreement.deadline) {
                return showToast("Choose a deadline later than the current deadline.", "error");
            }
            await sendTransaction(
                state.contract.methods.extendDeadline(agreementId, newDeadline),
                {},
                "Extend deadline"
            );
        }
        
        if (action === "dispute") {
            const reason = Number(data.get("reason"));
            const otherReason = reason === 5 ? String(data.get("otherReason") || "").trim() : "";
            const evidenceDescription = String(data.get("evidenceDescription") || "").trim();
            
            let evidenceCID = "";
            const evidenceFileInput = document.querySelector('[name="evidenceCID"]');
            
            if (evidenceFileInput?.files?.length > 0) {
                setTransactionState(true, "Uploading evidence photo", "Please wait while the photo is uploaded.");
                try {
                    evidenceCID = (await uploadToIPFS(evidenceFileInput.files[0])) || "";
                    if (evidenceCID) {
                        console.log('Evidence uploaded:', evidenceCID);
                        showToast('Evidence photo uploaded.', 'success');
                    }
                } catch (error) {
                    console.error('Evidence upload failed:', error);
                    showToast('The evidence photo could not be uploaded. You can continue without it.', 'error');
                    evidenceCID = "";
                } finally {
                    setTransactionState(false);
                }
            }
            
            if (reason === 5 && !otherReason) {
                return showToast("Explain the dispute reason before continuing.", "error");
            }
            
            await sendTransaction(
                state.contract.methods.raiseDispute(agreementId, reason, otherReason),
                {},
                "Raise dispute"
            );
            
            if (evidenceDescription || evidenceCID) {
                await sendTransaction(
                    state.contract.methods.submitEvidence(
                        agreementId,
                        evidenceDescription || "Evidence submitted",
                        evidenceCID
                    ),
                    {},
                    "Submit dispute evidence"
                );
            }
        }

        if (action === "evidence") {
            const description = String(data.get("description") || "").trim();
            if (!description) {
                return showToast("Briefly explain what the evidence shows.", "error");
            }
            
            let fileCID = "";
            const fileInput = document.querySelector('[name="fileCID"]');

            if (fileInput?.files?.length > 0) {
                setTransactionState(true, "Uploading evidence photo", "Please wait while the photo is uploaded.");
                try {
                    fileCID = (await uploadToIPFS(fileInput.files[0])) || "";
                    if (fileCID) {
                        console.log('Evidence uploaded:', fileCID);
                        showToast('Evidence photo uploaded.', 'success');
                    }
                } catch (error) {
                    console.error('Evidence upload failed:', error);
                    showToast('The evidence photo could not be uploaded. You can continue without it.', 'error');
                    fileCID = "";
                } finally {
                    setTransactionState(false);
                }
            }
            
            await sendTransaction(
                state.contract.methods.submitEvidence(agreementId, description, fileCID),
                {},
                "Submit evidence"
            );
        }
        
        $("#actionDialog").close();
        
    } catch (_) {
        // Error already handled by sendTransaction
    }
}

async function registerRole(role) {
  const label = roleLabel(Number(role));
  if (!confirm(`Register this wallet as ${label}? You cannot change this role later.`)) return;
  try {
    await sendTransaction(state.contract.methods.registerUser(Number(role)), {}, `Register as ${label}`);
    await routeConnectedUser();
  } catch (_) { /* already surfaced */ }
}

function seedDemo() {
  const now = Math.floor(Date.now() / 1000);
  state.account = "0x7D44E39B5Fc66F4D89A0f41e486cF28a73915A80";
  state.chainId = 1337;
  state.networkId = 5777;
  state.role = ROLE.SHIPPER;
  state.isArbitrator = false;
  state.carriers = [
    { address: "0xA4413B7bd46e682feA6aF4339eD1fc6CC940Ab81", name: "Northstar Logistics", profile: { location: 12, deliveryTypes: 7, isSet: true }, reputation: "500" },
    { address: "0x2C990F64c3eF79724D7Dc179f8EA7CcB402CB261", name: "Meridian Freight", profile: { location: 14, deliveryTypes: 3, isSet: true }, reputation: "300" },
    { address: "0x6B86E1a3D577Fd859b7c554734dd45aE347A7C90", name: "GreenRoute Carrier", profile: { location: 7, deliveryTypes: 1, isSet: true }, reputation: "100" }
  ];
  state.agreements = [
    { id: 4, shipper: state.account, carrier: state.carriers[0].address, totalValue: 4.8, fundedAmount: 4.8, releasedAmount: 1.44, deadline: now + 172800, status: 4, details: { origin: 12, destination: 14, itemType: 2, size: 2, weight: 3500, deliverySpeed: 2, guaranteeTier: 2, photoCID: "bafycargo1042" }, milestones: [
      { index: 0, type: 1, description: "", percentage: 30, reported: true, completed: true, reportedTimestamp: now - 72000, completedTimestamp: now - 70000, proofCID: "bafybeipickup1042" },
      { index: 1, type: 3, description: "", percentage: 30, reported: true, completed: false, reportedTimestamp: now - 3600, completedTimestamp: 0, proofCID: "bafybeitransit1042" },
      { index: 2, type: 5, description: "", percentage: 40, reported: false, completed: false, reportedTimestamp: 0, completedTimestamp: 0, proofCID: "" }
    ]},
    { id: 3, shipper: state.account, carrier: state.carriers[1].address, totalValue: 2.25, fundedAmount: 2.25, releasedAmount: 0, deadline: now + 36000, status: 7, details: { origin: 14, destination: 7, itemType: 5, size: 3, weight: 8200, deliverySpeed: 1, guaranteeTier: 3, photoCID: "" }, disputeReason: 2, disputeOtherReason: "", evidence: [
      { submittedBy: state.account, description: "The attached image does not match the sealed cargo ID.", fileCID: "bafybaddocument", timestamp: now - 8200 }
    ], milestones: [
      { index: 0, type: 1, description: "", percentage: 40, reported: true, completed: false, reportedTimestamp: now - 12000, completedTimestamp: 0, proofCID: "bafyproofshipment" },
      { index: 1, type: 5, description: "", percentage: 60, reported: false, completed: false, reportedTimestamp: 0, completedTimestamp: 0, proofCID: "" }
    ]},
    { id: 1, shipper: state.account, carrier: state.carriers[2].address, totalValue: 1.6, fundedAmount: 1.6, releasedAmount: 1.6, deadline: now - 604800, status: 5, details: { origin: 7, destination: 12, itemType: 1, size: 1, weight: 900, deliverySpeed: 1, guaranteeTier: 1, photoCID: "" }, milestones: [
      { index: 0, type: 1, description: "", percentage: 25, reported: true, completed: true, reportedTimestamp: now - 900000, completedTimestamp: now - 899000, proofCID: "" },
      { index: 1, type: 3, description: "", percentage: 25, reported: true, completed: true, reportedTimestamp: now - 800000, completedTimestamp: now - 799000, proofCID: "" },
      { index: 2, type: 5, description: "", percentage: 50, reported: true, completed: true, reportedTimestamp: now - 700000, completedTimestamp: now - 699000, proofCID: "bafyfinaldelivery" }
    ]}
  ];
  state.allActivity = [
    { event: "MilestoneReported", blockNumber: 48, logIndex: 1, timestamp: now - 3600, transactionHash: "0x9156f73c8798d74b37aa001734c4795ddf22", returnValues: { agreementId: "4", milestoneIndex: "1" } },
    { event: "AgreementFunded", blockNumber: 41, logIndex: 0, timestamp: now - 7200, transactionHash: "0x20d62eaba4aa321a5998d938726c152d8b31", returnValues: { agreementId: "4", amount: "4800000000000000000" } },
    { event: "AgreementAccepted", blockNumber: 39, logIndex: 0, timestamp: now - 10800, transactionHash: "0x681bb9d24f90d50c0a909d46664bacdd", returnValues: { agreementId: "4" } },
    { event: "DisputeRaised", blockNumber: 37, logIndex: 0, timestamp: now - 12000, transactionHash: "0x77acbad772acb4f0e0a44e91e73e", returnValues: { agreementId: "3", raisedBy: state.account } }
  ];
  state.activity = [...state.allActivity];
  buildNotifications();
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
  if (state.demo) return showToast("This action is unavailable in preview mode.", "error");
  try { await sendTransaction(state.contract.methods.setDisplayName(name), {}, "Update display name"); } catch (_) { /* surfaced */ }
}

async function saveCarrierProfile(event) {
  event.preventDefault();
  const locationValue = Number($("#profileLocation").value);
  const mask = $$('[name="deliveryType"]:checked').reduce((sum, input) => sum + Number(input.value), 0);
  if (!mask) return showToast("Select at least one delivery type.", "error");
  if (state.demo) return showToast("This action is unavailable in preview mode.", "error");
  try { await sendTransaction(state.contract.methods.setCarrierProfile(locationValue, mask), {}, "Update carrier profile"); } catch (_) { /* surfaced */ }
}

async function withdrawCommission() {
  if (state.demo) return showToast("This action is unavailable in preview mode.", "error");
  if (BigInt(state.arbitratorEarnings || 0) === 0n) return showToast("There is no commission available to withdraw.", "error");
  if (!confirm(`Withdraw ${formatEth(state.arbitratorEarnings)} to the arbitrator wallet?`)) return;
  try { await sendTransaction(state.contract.methods.withdrawCommission(), {}, "Withdraw commission"); } catch (_) { /* surfaced */ }
}

async function saveRewardSettings(event) {
  event.preventDefault();
  const completion = Number($("#completionRewardInput").value);
  const dispute = Number($("#disputeRewardInput").value);
  if (!Number.isInteger(completion) || completion < REWARD_MIN || completion > REWARD_MAX) return showValidationError(`Completed-delivery reward must be a whole number from ${REWARD_MIN} to ${REWARD_MAX}.`, "#completionRewardInput");
  if (!Number.isInteger(dispute) || dispute < REWARD_MIN || dispute > REWARD_MAX) return showValidationError(`Carrier dispute-win reward must be a whole number from ${REWARD_MIN} to ${REWARD_MAX}.`, "#disputeRewardInput");
  if (state.demo) return showToast("This action is unavailable in preview mode.", "error");
  const updateCompletion = String(completion) !== String(state.completionReward);
  const updateDispute = String(dispute) !== String(state.disputeWinReward);
  try {
    if (updateCompletion) await sendTransaction(state.contract.methods.setCompletionReward(completion), {}, "Update completion reward");
    if (updateDispute) await sendTransaction(state.contract.methods.setDisputeWinReward(dispute), {}, "Update dispute reward");
    if (!updateCompletion && !updateDispute) showToast("Reward settings are already up to date.");
  } catch (_) { /* surfaced */ }
}

function bindEvents() {
  $("#connectButton").addEventListener("click", () => connectWallet(true));
  $$('[data-connect]').forEach(button => button.addEventListener("click", () => connectWallet(true)));
  $("#refreshButton").addEventListener("click", refreshAll);
  $("#profileAddress").addEventListener("click", async () => {
    await navigator.clipboard.writeText(state.account);
    showToast("Wallet address copied.");
  });
  $("#addressForm").addEventListener("submit", async event => {
    event.preventDefault();
    const address = $("#contractAddress").value.trim();
    if (!state.web3?.utils.isAddress(address)) return showToast("Enter a valid wallet address starting with 0x.", "error");
    await initializeContract(address);
  });
  $$('[data-register-role]').forEach(button => button.addEventListener("click", () => registerRole(button.dataset.registerRole)));
  $("#agreementForm").addEventListener("submit", createAgreement);
  $("#displayNameForm").addEventListener("submit", saveDisplayName);
  $("#carrierProfileForm").addEventListener("submit", saveCarrierProfile);
  $("#withdrawCommissionButton").addEventListener("click", withdrawCommission);
  $("#rewardSettingsForm").addEventListener("submit", saveRewardSettings);
  $("#refreshRateButton").addEventListener("click", () => refreshEthMyrRate(true));
  $("#totalValue").addEventListener("input", updateMyrEstimate);
  $("#carrierPickerSearch").addEventListener("input", () => updateCarrierPicker(true));
  $("#carrierPickerPrev").addEventListener("click", () => changeCarrierPickerPage(-1));
  $("#carrierPickerNext").addEventListener("click", () => changeCarrierPickerPage(1));
  ["carrierSearch", "carrierLocationFilter", "carrierSpeedFilter", "carrierSort"].forEach(id => {
    $("#" + id).addEventListener(id === "carrierSearch" ? "input" : "change", renderMarketplace);
  });
  $("#agreementMonth").addEventListener("change", event => setAgreementMonthFilter(event.target.value));
  $("#agreementDate").addEventListener("change", event => setAgreementDateFilter(event.target.value));
  $("#clearDateFilters").addEventListener("click", () => resetAgreementDateFilters(true));
  ["origin", "destination", "parcelSize", "weight", "deliverySpeed", "guaranteeTier"].forEach(id => {
    $("#" + id).addEventListener("input", () => {
      updatePriceSuggestion(false);
      renderCarriers();
    });
    $("#" + id).addEventListener("change", () => {
      updatePriceSuggestion(false);
      renderCarriers();
    });
  });
  $("#destination").addEventListener("change", function() {
    $("#selectedCarrier").value = "";
    $$('[data-select-carrier]').forEach(node => node.classList.remove("selected"));
    updateCarrierPicker(true);
  });
  $("#deliverySpeed").addEventListener("change", function() {
    $("#selectedCarrier").value = "";
    $$('[data-select-carrier]').forEach(node => node.classList.remove("selected"));
    updateCarrierPicker(true);
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
    const removePhoto = event.target.closest("[data-parcel-photo-remove]");
    if (removePhoto) {
      event.preventDefault();
      removeParcelPhoto(Number(removePhoto.dataset.parcelPhotoRemove));
      return;
    }
    const openPhoto = event.target.closest("[data-parcel-photo-open]");
    if (openPhoto) {
      event.preventDefault();
      openParcelPhoto(Number(openPhoto.dataset.parcelPhotoOpen));
      return;
    }
    const copyAddress = event.target.closest("[data-copy-address]");
    if (copyAddress) {
      event.preventDefault();
      navigator.clipboard.writeText(copyAddress.dataset.copyAddress).then(() => showToast("Wallet address copied.")).catch(() => showToast("The address could not be copied. Select and copy it manually.", "error"));
      return;
    }
    const nav = event.target.closest("[data-section-target]");
    if (nav) showSection(nav.dataset.sectionTarget);
    const notification = event.target.closest("[data-notification-id]");
    if (notification) markNotificationRead(notification.dataset.notificationId);
    const carrier = event.target.closest("[data-select-carrier]");
    if (carrier) selectCarrier(carrier.dataset.selectCarrier);
    const agreement = event.target.closest("[data-agreement-id]");
    if (agreement) openAgreement(agreement.dataset.agreementId);
    const filter = event.target.closest("[data-filter]");
    if (filter) setAgreementStatusFilter(filter.dataset.filter);
    const notificationFilter = event.target.closest("[data-notification-filter]");
    if (notificationFilter) {
      state.notificationFilter = notificationFilter.dataset.notificationFilter;
      renderNotifications();
    }
  });
  $("#markAllNotificationsRead").addEventListener("click", markAllNotificationsRead);
  $("#agreementDetail").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (button) handleDetailAction(button.dataset.action, Number(button.dataset.milestone));
  });
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => $("#agreementDialog").close()));
  $$('[data-close-action-dialog]').forEach(button => button.addEventListener("click", () => $("#actionDialog").close()));
  $$('[data-close-photo-lightbox]').forEach(button => button.addEventListener("click", () => $("#photoLightbox").close()));
  $("#actionForm").addEventListener("submit", submitAction);
  $("#actionFields").addEventListener("change", event => {
    if (event.target.name === "reason") {
      $(".other-reason")?.classList.toggle("hidden", event.target.value !== "5");
    }
    if (event.target.matches("[data-image-file]")) updateImagePreview(event.target);
  });
  document.addEventListener("change", event => {
    if (event.target.id === "parcelPhotoFile") {
      addParcelPhotos(event.target);
    } else if (event.target.matches("[data-image-file]")) {
      updateImagePreview(event.target);
    }
  });
  document.addEventListener("error", event => {
    if (!event.target.matches?.("[data-proof-image], [data-image-preview]") || event.target.dataset.fallback) return;
    event.target.dataset.fallback = "1";
    event.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='280'%3E%3Crect width='100%25' height='100%25' fill='%23edf1ec'/%3E%3Cpath d='M180 150l42-42 34 34 26-25 52 53H160z' fill='%23b6c8bd'/%3E%3Ccircle cx='290' cy='88' r='18' fill='%23c9d6ce'/%3E%3Ctext x='240' y='220' text-anchor='middle' font-family='sans-serif' font-size='16' fill='%235c6d63'%3EPreview unavailable%3C/text%3E%3C/svg%3E";
  }, true);
  [$("#agreementDialog"), $("#actionDialog"), $("#photoLightbox")].forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });
}

async function init() {
  bindEvents();
  populateLocationSelects();
  setDefaultDeadline();
  updatePriceSuggestion(true);
  loadCachedEthMyrRate();
  refreshEthMyrRate(false);
  addMilestoneRow(1, 30);
  addMilestoneRow(5, 70);
  setInterval(updateCountdowns, 30000);
  setInterval(() => refreshEthMyrRate(false), 300000);
  if (window.ethereum && !state.demo) {
    window.ethereum.on("accountsChanged", accounts => {
      state.account = accounts[0] || null;
      state.contract = null;
      state.agreements = [];
      state.activity = [];
      state.allActivity = [];
      state.notifications = [];
      state.currentAgreementId = null;
      updateWalletHeader();
      if (state.account) connectWallet(false); else showView("landingView");
    });
    window.ethereum.on("chainChanged", () => location.reload());
    await connectWallet(false);
  }
  if (state.demo) $("#networkBadge span").textContent = "Preview available";
}

document.addEventListener("DOMContentLoaded", init);