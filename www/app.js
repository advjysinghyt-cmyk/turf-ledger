const SUPABASE_URL = "https://kwlqdpwaicpjmhwzvbed.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LTvB-htfVAplvmEzWNzOgg_hKa9-UWn";
const PUBLIC_WEB_URL = "https://advjysinghyt-cmyk.github.io/turf-ledger/";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
  accessKey: null,
  isOwner: false,
  viewerMemberId: null,
  members: [],
  playDays: [],
  memberPayments: [],
  ownerPayouts: [], monthlyFees: [], memberExemptions: [], groupExpenses: []
};

function formatINR(num) {
  const val = Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  return val.toLocaleString("en-IN", {
    minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function currentMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

function resolveAccessKey() {
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get("key");
  if (urlKey && urlKey.trim()) {
    localStorage.setItem("turf_ledger_key", urlKey.trim());
    return urlKey.trim();
  }
  return localStorage.getItem("turf_ledger_key");
}

async function loadLedger() {
  const key = resolveAccessKey();
  if (!key) {
    showAccessGate("");
    return;
  }

  state.accessKey = key;
  const { data, error } = await db.rpc("get_ledger_data", { p_key: key });

  if (error || !data) {
    localStorage.removeItem("turf_ledger_key");
    showAccessGate("Invalid or revoked access link. Ask the group admin for a new link.");
    return;
  }

  state.isOwner = data.is_owner;
  state.viewerMemberId = data.viewer_member_id;
  state.members = data.members || [];
  state.playDays = data.play_days || [];
  state.memberPayments = data.member_payments || [];
  state.ownerPayouts = data.owner_payouts || [];
  state.monthlyFees = data.monthly_fees || [];
  state.memberExemptions = data.member_exemptions || [];
  state.groupExpenses = data.group_expenses || [];

  document.getElementById("access-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");

  const badge = document.getElementById("role-badge");
  const ownerEls = document.querySelectorAll(".owner-only");
  if (state.isOwner) {
    badge.textContent = "Owner Mode (Full Edit)";
    ownerEls.forEach(el => el.classList.remove("hidden"));
  } else {
    const me = state.members.find(m => m.id === state.viewerMemberId);
    badge.textContent = `View Only${me ? " • " + me.name : ""}`;
    ownerEls.forEach(el => el.classList.add("hidden"));
  }

  renderAll();
}

function showAccessGate(errorMsg) {
  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("access-screen").classList.remove("hidden");
  document.getElementById("role-badge").textContent = "Locked";
  document.getElementById("access-error").textContent = errorMsg;
}

function renderAll() {
  renderDashboard();
  renderPlayDays();
  renderPayments();
  renderPayouts();
  renderMembership();
  renderExpenses();
  renderMonthlyReport();
  if (state.isOwner) renderMembersAdmin();
}

function sum(items, field) { return items.reduce((total, item) => total + Number(item[field] || 0), 0); }

function cashMovementBefore(date) {
  const receipts = sum(state.memberPayments.filter(p => p.pay_date < date), "amount");
  const payouts = sum(state.ownerPayouts.filter(p => p.payout_date < date), "amount");
  const expenses = sum(state.groupExpenses.filter(e => e.expense_date < date), "amount");
  return receipts - payouts - expenses;
}

function cashMovementDuring(month) {
  const receipts = sum(state.memberPayments.filter(p => p.pay_date.startsWith(month)), "amount");
  const payouts = sum(state.ownerPayouts.filter(p => p.payout_date.startsWith(month)), "amount");
  const expenses = sum(state.groupExpenses.filter(e => e.expense_date.startsWith(month)), "amount");
  return { receipts, payouts, expenses, net: receipts - payouts - expenses };
}

function renderDashboard() {
  const totalDays = state.playDays.length;
  const totalTurfCost = sum(state.playDays, "turf_rate");
  const totalCollected = sum(state.memberPayments, "amount");
  // Cash leaves the fund only when a turf-owner payout or group-expense payment is recorded.
  // Play-day turf costs are tracked separately to avoid counting the same turf bill twice.
  const totalOwnerPaid = sum(state.ownerPayouts, "amount");
  const totalGroupExpenses = sum(state.groupExpenses, "amount");
  const totalExpenses = totalTurfCost + totalGroupExpenses;
  const ownerDue = totalTurfCost - totalOwnerPaid;
  const totalCashOut = totalOwnerPaid + totalGroupExpenses;
  const cash = totalCollected - totalCashOut;
  const ym = currentMonthISO();
  const monthStart = ym + "-01";
  const fee = state.monthlyFees.find(f => f.month_start === monthStart);
  const exemptions = state.memberExemptions.filter(e => e.month_start === monthStart);
  const payments = state.memberPayments.filter(p => p.membership_month === monthStart);
  let balance = 0;
  const tbody = document.getElementById("dashboard-member-tbody");
  tbody.innerHTML = "";
  state.members.forEach(m => {
    const ex = exemptions.find(e => e.member_id === m.id);
    const paid = sum(payments.filter(p => p.member_id === m.id), "amount");
    const due = ex ? 0 : (fee ? Number(fee.fee_amount) : 0);
    const outstanding = Math.max(0, due - paid);
    balance += outstanding;
    const status = ex ? "Exempt" : !fee ? "Fee not set" : outstanding <= 0.005 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
    const cls = ex || !fee || outstanding <= 0.005 ? "pill-paid" : paid > 0 ? "pill-partial" : "pill-unpaid";
    const tr = document.createElement("tr");
    if (m.id === state.viewerMemberId) tr.classList.add("highlight-row");
    tr.innerHTML = `<td>${escapeHtml(m.name)}</td><td>${formatINR(due)}</td><td>${formatINR(paid)}</td><td class="${outstanding > 0 ? "text-danger" : "text-success"}">${formatINR(outstanding)}</td><td><span class="pill ${cls}">${status}</span></td>`;
    tbody.appendChild(tr);
  });
  document.getElementById("stat-days").textContent = totalDays;
  document.getElementById("stat-cost").textContent = formatINR(totalTurfCost);
  document.getElementById("stat-collected").textContent = formatINR(totalCollected);
  document.getElementById("stat-to-collect").textContent = formatINR(balance);
  document.getElementById("stat-paid-owner").textContent = formatINR(totalCashOut);
  document.getElementById("stat-expenses").textContent = formatINR(totalExpenses);
  document.getElementById("stat-owner-paid").textContent = formatINR(totalOwnerPaid);
  document.getElementById("stat-owner-due").textContent = formatINR(ownerDue);
  document.getElementById("stat-cash").textContent = formatINR(cash);
}

function renderPlayDays() {
  const list = document.getElementById("playdays-list");
  if (!state.playDays.length) {
    list.innerHTML = `<p class="muted">No play days logged yet.</p>`;
    return;
  }

  list.innerHTML = state.playDays.map(day => {
    const actions = state.isOwner ? `
      <div class="record-actions">
        <button class="btn-secondary btn-sm" onclick="editPlayDay('${day.id}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="deletePlayDay('${day.id}')">Delete</button>
      </div>` : "";

    return `
      <div class="record-item">
        <div class="record-main">
          <div class="record-title">${day.play_date} • Turf cost: ${formatINR(day.turf_rate)}</div>
        </div>
        ${actions}
      </div>`;
  }).join("");
}

function renderPayments() {
  const select=document.getElementById("pay-member");
  select.innerHTML=state.members.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  const list=document.getElementById("payments-list");
  if(!state.memberPayments.length){list.innerHTML='<p class="muted">No membership payments recorded yet.</p>';return;}
  const names=Object.fromEntries(state.members.map(m=>[m.id,m.name]));
  list.innerHTML=state.memberPayments.map(p=>{
    const actions=state.isOwner?`<div class="record-actions"><button class="btn-secondary btn-sm" onclick="editPayment('${p.id}')">Edit</button><button class="btn-danger btn-sm" onclick="deletePayment('${p.id}')">Delete</button></div>`:"";
    return `<div class="record-item"><div class="record-main"><div class="record-title">${escapeHtml(names[p.member_id]||"Removed")} • ${formatINR(p.amount)}</div><div class="record-sub">For ${p.membership_month.slice(0,7)} • Paid on ${p.pay_date}</div></div>${actions}</div>`;
  }).join("");
}

function renderPayouts() {
  const list = document.getElementById("payouts-list");
  if (!state.ownerPayouts.length) {
    list.innerHTML = `<p class="muted">No payouts to turf owner recorded yet.</p>`;
    return;
  }

  list.innerHTML = state.ownerPayouts.map(o => {
    const actions = state.isOwner ? `
      <div class="record-actions">
        <button class="btn-secondary btn-sm" onclick="editPayout('${o.id}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="deletePayout('${o.id}')">Delete</button>
      </div>` : "";

    return `
      <div class="record-item">
        <div class="record-main">
          <div class="record-title">${o.payout_date} • Paid: ${formatINR(o.amount)}</div>
          ${o.note ? `<div class="record-sub">Note: ${escapeHtml(o.note)}</div>` : ""}
        </div>
        ${actions}
      </div>`;
  }).join("");
}

function renderMembership() {
  const month=document.getElementById("fee-month");
  if(!month.value)month.value=currentMonthISO();
  const monthStart=month.value+"-01";
  const fee=state.monthlyFees.find(f=>f.month_start===monthStart);
  document.getElementById("fee-amount").value=fee?fee.fee_amount:"";
  const member=document.getElementById("exempt-member");
  member.innerHTML=state.members.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  const list=document.getElementById("exemptions-list");
  const entries=state.memberExemptions.filter(e=>e.month_start===monthStart);
  if(!entries.length){list.innerHTML='<p class="muted">No supply exemptions for this month.</p>';return;}
  const names=Object.fromEntries(state.members.map(m=>[m.id,m.name]));
  list.innerHTML=entries.map(e=>`<div class="record-item"><div class="record-main"><div class="record-title">${escapeHtml(names[e.member_id]||"Removed")} • Exempt</div><div class="record-sub">${escapeHtml(e.reason)}</div></div>${state.isOwner?`<button class="btn-danger btn-sm" onclick="deleteExemption('${e.id}')">Remove</button>`:""}</div>`).join("");
}

function renderExpenses() {
  const list=document.getElementById("expenses-list");
  if(!state.groupExpenses.length){list.innerHTML='<p class="muted">No group expenses recorded yet.</p>';return;}
  list.innerHTML=state.groupExpenses.map(e=>`<div class="record-item"><div class="record-main"><div class="record-title">${e.expense_date} • ${escapeHtml(e.category)} • ${formatINR(e.amount)}</div>${e.note?`<div class="record-sub">${escapeHtml(e.note)}</div>`:""}</div>${state.isOwner?`<div class="record-actions"><button class="btn-secondary btn-sm" onclick="editExpense('${e.id}')">Edit</button><button class="btn-danger btn-sm" onclick="deleteExpense('${e.id}')">Delete</button></div>`:""}</div>`).join("");
}

function renderMonthlyReport() {
  const input = document.getElementById("report-month");
  if (!input.value) input.value = currentMonthISO();
  const ym = input.value, start = ym + "-01";
  const days = state.playDays.filter(d => d.play_date.startsWith(ym));
  // Fee settlement is assigned to the selected membership month.
  const feePayments = state.memberPayments.filter(p => p.membership_month === start);
  // Cash accounting uses the actual date money entered or left the group fund.
  const movement = cashMovementDuring(ym);
  const opening = cashMovementBefore(start);
  const closing = opening + movement.net;
  const turfCost = sum(days, "turf_rate");
  const cashOut = movement.payouts + movement.expenses;
  const totalExpenses = turfCost + movement.expenses;
  // Owner dues are cumulative: all turf costs accrued up to this month-end,
  // less all payouts actually made to the owner up to the same date.
  const monthEnd = ym + "-31";
  const accruedTurfThroughMonth = sum(state.playDays.filter(d => d.play_date <= monthEnd), "turf_rate");
  const ownerPaidThroughMonth = sum(state.ownerPayouts.filter(p => p.payout_date <= monthEnd), "amount");
  const ownerDue = accruedTurfThroughMonth - ownerPaidThroughMonth;
  const fee = state.monthlyFees.find(f => f.month_start === start);
  const exemptions = state.memberExemptions.filter(e => e.month_start === start);
  const due = state.members.reduce((total, m) => total + (exemptions.some(e => e.member_id === m.id) ? 0 : Number(fee?.fee_amount || 0)), 0);
  const paidTowardMonth = sum(feePayments, "amount");
  const tbody = document.getElementById("report-member-tbody");
  tbody.innerHTML = "";
  state.members.forEach(m => {
    const ex = exemptions.find(e => e.member_id === m.id);
    const memberPaid = sum(feePayments.filter(p => p.member_id === m.id), "amount");
    const memberDue = ex ? 0 : Number(fee?.fee_amount || 0);
    const outstanding = Math.max(0, memberDue - memberPaid);
    tbody.innerHTML += `<tr><td>${escapeHtml(m.name)}</td><td>${ex ? "Exempt" : formatINR(memberDue)}</td><td>${formatINR(memberPaid)}</td><td class="${outstanding > 0 ? "text-danger" : "text-success"}">${ex ? "Exempt" : formatINR(outstanding)}</td></tr>`;
  });
  const daysInMonth = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  document.getElementById("rep-days").textContent = days.length;
  document.getElementById("rep-avg-week").textContent = (days.length / (daysInMonth / 7)).toFixed(1);
  document.getElementById("rep-cost").textContent = formatINR(turfCost);
  document.getElementById("rep-collected").textContent = formatINR(movement.receipts);
  document.getElementById("rep-paid").textContent = formatINR(cashOut);
  document.getElementById("rep-expenses").textContent = formatINR(totalExpenses);
  document.getElementById("rep-owner-paid").textContent = formatINR(movement.payouts);
  document.getElementById("rep-owner-due").textContent = formatINR(ownerDue);
  document.getElementById("rep-cash").textContent = formatINR(movement.net);
  document.getElementById("rep-opening").textContent = formatINR(opening);
  document.getElementById("rep-closing").textContent = formatINR(closing);
  document.getElementById("rep-balance").textContent = formatINR(Math.max(0, due - paidTowardMonth));
}

function renderMembersAdmin() {
  const baseUrl = PUBLIC_WEB_URL.endsWith("/") ? PUBLIC_WEB_URL : PUBLIC_WEB_URL + "/";
  document.getElementById("owner-link-display").value = `${baseUrl}?key=${state.accessKey}`;

  const list = document.getElementById("members-admin-list");
  if (!state.members.length) {
    list.innerHTML = `<p class="muted">No members added yet.</p>`;
    return;
  }

  list.innerHTML = state.members.map(m => {
    const hasKey = Boolean(m.access_key);
    const link = hasKey ? `${baseUrl}?key=${m.access_key}` : "Link revoked (no access)";
    return `
      <div class="record-item" style="flex-direction:column;">
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <strong>${escapeHtml(m.name)}</strong>
          <div class="record-actions">
            <button class="btn-secondary btn-sm" onclick="editMember('${m.id}', '${escapeAttr(m.name)}')">Rename</button>
            <button class="btn-secondary btn-sm" onclick="rotateMemberKey('${m.id}', false)">New Link</button>
            ${hasKey ? `<button class="btn-danger btn-sm" onclick="rotateMemberKey('${m.id}', true)">Revoke</button>` : ""}
            <button class="btn-danger btn-sm" onclick="deleteMember('${m.id}')">Remove</button>
          </div>
        </div>
        <div class="copy-box" style="width:100%; margin-top:8px;">
          <input type="text" readonly value="${link}" id="link-${m.id}" />
          ${hasKey ? `<button class="btn-primary btn-sm" onclick="copyText('link-${m.id}')">Copy Link</button>` : ""}
        </div>
      </div>`;
  }).join("");
}

async function runAdminRpc(fnName, params, successMsg) {
  const { error } = await db.rpc(fnName, { p_key: state.accessKey, ...params });
  if (error) {
    alert("Action failed: " + error.message);
    return false;
  }
  showToast(successMsg);
  await loadLedger();
  return true;
}

document.getElementById("btn-save-playday").onclick = async () => {
  const id = document.getElementById("edit-playday-id").value || null;
  const play_date = document.getElementById("pd-date").value;
  const turf_rate = Number(document.getElementById("pd-rate").value);

  if (!play_date || turf_rate <= 0) {
    return alert("Please enter the play date and total turf amount.");
  }

  const ok = await runAdminRpc("admin_save_play_day", {
    p_id: id, p_play_date: play_date, p_turf_rate: turf_rate, p_player_ids: []
  }, id ? "Play day updated" : "Play day added");

  if (ok) resetPlayDayForm();
};

window.editPlayDay = (id) => {
  const day = state.playDays.find(d => d.id === id);
  if (!day) return;
  document.getElementById("edit-playday-id").value = day.id;
  document.getElementById("pd-date").value = day.play_date;
  document.getElementById("pd-rate").value = day.turf_rate;
  document.getElementById("playday-form-title").textContent = "Edit Play Day";
  document.getElementById("btn-cancel-playday").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.deletePlayDay = async (id) => {
  if (confirm("Delete this play day?")) {
    await runAdminRpc("admin_delete_play_day", { p_id: id }, "Play day deleted");
  }
};

function resetPlayDayForm() {
  document.getElementById("edit-playday-id").value = "";
  document.getElementById("pd-date").value = todayISO();
  document.getElementById("pd-rate").value = "1400";
  document.getElementById("playday-form-title").textContent = "Log Play Day";
  document.getElementById("btn-cancel-playday").classList.add("hidden");
}
document.getElementById("btn-cancel-playday").onclick = resetPlayDayForm;

document.getElementById("btn-save-payment").onclick = async () => {
  const id = document.getElementById("edit-payment-id").value || null;
  const member_id = document.getElementById("pay-member").value;
  const pay_date = document.getElementById("pay-date").value;
  const membership_month = document.getElementById("pay-month").value + "-01";
  const amount = Number(document.getElementById("pay-amount").value);

  if (!member_id || !pay_date || !membership_month || amount <= 0) return alert("Enter member, payment date, membership month and positive amount.");
  const ok = await runAdminRpc("admin_save_payment", {
    p_id: id, p_member_id: member_id, p_pay_date: pay_date, p_membership_month: membership_month, p_amount: amount
  }, id ? "Payment updated" : "Payment recorded");
  if (ok) resetPaymentForm();
};

window.editPayment = (id) => {
  const p = state.memberPayments.find(x => x.id === id);
  if (!p) return;
  document.getElementById("edit-payment-id").value = p.id;
  document.getElementById("pay-member").value = p.member_id;
  document.getElementById("pay-date").value = p.pay_date;
  document.getElementById("pay-month").value = p.membership_month.slice(0,7);
  document.getElementById("pay-amount").value = p.amount;
  document.getElementById("payment-form-title").textContent = "Edit Member Payment";
  document.getElementById("btn-cancel-payment").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.deletePayment = async (id) => {
  if (confirm("Delete this payment record?")) {
    await runAdminRpc("admin_delete_payment", { p_id: id }, "Payment deleted");
  }
};

function resetPaymentForm() {
  document.getElementById("edit-payment-id").value = "";
  document.getElementById("pay-date").value = todayISO();
  document.getElementById("pay-month").value = currentMonthISO();
  document.getElementById("pay-amount").value = "";
  document.getElementById("payment-form-title").textContent = "Record Member Payment";
  document.getElementById("btn-cancel-payment").classList.add("hidden");
}
document.getElementById("btn-cancel-payment").onclick = resetPaymentForm;

document.getElementById("btn-save-payout").onclick = async () => {
  const id = document.getElementById("edit-payout-id").value || null;
  const payout_date = document.getElementById("out-date").value;
  const amount = Number(document.getElementById("out-amount").value);
  const note = document.getElementById("out-note").value;

  if (!payout_date || amount <= 0) return alert("Enter date and positive payout amount.");
  const ok = await runAdminRpc("admin_save_payout", {
    p_id: id, p_payout_date: payout_date, p_amount: amount, p_note: note
  }, id ? "Payout updated" : "Payout recorded");
  if (ok) resetPayoutForm();
};

window.editPayout = (id) => {
  const o = state.ownerPayouts.find(x => x.id === id);
  if (!o) return;
  document.getElementById("edit-payout-id").value = o.id;
  document.getElementById("out-date").value = o.payout_date;
  document.getElementById("out-amount").value = o.amount;
  document.getElementById("out-note").value = o.note || "";
  document.getElementById("payout-form-title").textContent = "Edit Payout";
  document.getElementById("btn-cancel-payout").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.deletePayout = async (id) => {
  if (confirm("Delete this payout?")) {
    await runAdminRpc("admin_delete_payout", { p_id: id }, "Payout deleted");
  }
};

function resetPayoutForm() {
  document.getElementById("edit-payout-id").value = "";
  document.getElementById("out-date").value = todayISO();
  document.getElementById("out-amount").value = "";
  document.getElementById("out-note").value = "";
  document.getElementById("payout-form-title").textContent = "Record Payout to Turf Owner";
  document.getElementById("btn-cancel-payout").classList.add("hidden");
}
document.getElementById("btn-cancel-payout").onclick = resetPayoutForm;

document.getElementById("btn-save-member").onclick = async () => {
  const id = document.getElementById("edit-member-id").value || null;
  const name = document.getElementById("member-name-input").value.trim();
  if (!name) return alert("Enter member name.");
  const ok = await runAdminRpc("admin_save_member", { p_id: id, p_name: name }, id ? "Member renamed" : "Member added");
  if (ok) resetMemberForm();
};

window.editMember = (id, name) => {
  document.getElementById("edit-member-id").value = id;
  document.getElementById("member-name-input").value = name;
  document.getElementById("member-form-title").textContent = "Rename Member";
  document.getElementById("btn-cancel-member").classList.remove("hidden");
};

window.rotateMemberKey = async (memberId, revoke) => {
  const msg = revoke ? "Revoke this member's access link?" : "Generate a new link? Their old link will stop working.";
  if (confirm(msg)) {
    await runAdminRpc("admin_set_member_key", { p_member_id: memberId, p_revoke: revoke }, revoke ? "Link revoked" : "New link generated");
  }
};

window.deleteMember = async (memberId) => {
  if (confirm("Remove member and all their play/payment history?")) {
    await runAdminRpc("admin_delete_member", { p_member_id: memberId }, "Member removed");
  }
};

function resetMemberForm() {
  document.getElementById("edit-member-id").value = "";
  document.getElementById("member-name-input").value = "";
  document.getElementById("member-form-title").textContent = "Add New Member";
  document.getElementById("btn-cancel-member").classList.add("hidden");
}
document.getElementById("btn-cancel-member").onclick = resetMemberForm;

document.querySelectorAll(".tab").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  };
});

document.getElementById("btn-save-key").onclick = () => {
  const val = document.getElementById("manual-key-input").value.trim();
  if (!val) return;
  localStorage.setItem("turf_ledger_key", val);
  loadLedger();
};

document.getElementById("btn-refresh").onclick = async () => {
  await loadLedger();
  showToast("Ledger refreshed");
};

document.getElementById("report-month").onchange = renderMonthlyReport;
document.getElementById("fee-month").onchange = renderMembership;
document.getElementById("btn-copy-owner").onclick = () => copyText("owner-link-display");

window.copyText = (inputId) => {
  const el = document.getElementById(inputId);
  el.select();
  navigator.clipboard.writeText(el.value);
  showToast("Copied to clipboard!");
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s]));
}
function escapeAttr(str) {
  return String(str).replace(/'/g, "\'");
}

document.getElementById("pd-date").value = todayISO();
document.getElementById("pay-date").value = todayISO();
document.getElementById("out-date").value = todayISO();
document.getElementById("pay-month").value = currentMonthISO();
document.getElementById("fee-month").value = currentMonthISO();
document.getElementById("btn-save-fee").onclick = async () => {
  const month=document.getElementById("fee-month").value, amount=Number(document.getElementById("fee-amount").value);
  if(!month || !Number.isFinite(amount) || amount<0)return alert("Enter a month and valid fee.");
  await runAdminRpc("admin_save_month_fee",{p_month_start:month+"-01",p_fee_amount:amount},"Monthly fee saved");
};
document.getElementById("btn-save-exemption").onclick = async () => {
  const member=document.getElementById("exempt-member").value, month=document.getElementById("fee-month").value, reason=document.getElementById("exempt-reason").value.trim();
  if(!member || !month || !reason)return alert("Select a member, month and supply contribution.");
  const ok=await runAdminRpc("admin_save_exemption",{p_member_id:member,p_month_start:month+"-01",p_reason:reason},"Member exemption saved");
  if(ok)document.getElementById("exempt-reason").value="";
};
window.deleteExemption=async id=>{if(confirm("Remove this monthly exemption?"))await runAdminRpc("admin_delete_exemption",{p_id:id},"Exemption removed");};
document.getElementById("btn-save-expense").onclick=async()=>{
 const id=document.getElementById("edit-expense-id").value||null, date=document.getElementById("expense-date").value, category=document.getElementById("expense-category").value, amount=Number(document.getElementById("expense-amount").value), note=document.getElementById("expense-note").value;
 if(!date||!category||amount<=0)return alert("Enter date, category and positive amount.");
 const ok=await runAdminRpc("admin_save_expense",{p_id:id,p_expense_date:date,p_category:category,p_amount:amount,p_note:note},id?"Expense updated":"Expense recorded");
 if(ok)resetExpenseForm();
};
window.editExpense=id=>{const e=state.groupExpenses.find(x=>x.id===id);if(!e)return;document.getElementById("edit-expense-id").value=e.id;document.getElementById("expense-date").value=e.expense_date;document.getElementById("expense-category").value=e.category;document.getElementById("expense-amount").value=e.amount;document.getElementById("expense-note").value=e.note||"";document.getElementById("expense-form-title").textContent="Edit Group Expense";document.getElementById("btn-cancel-expense").classList.remove("hidden");};
window.deleteExpense=async id=>{if(confirm("Delete this expense?"))await runAdminRpc("admin_delete_expense",{p_id:id},"Expense deleted");};
function resetExpenseForm(){document.getElementById("edit-expense-id").value="";document.getElementById("expense-date").value=todayISO();document.getElementById("expense-category").value="Water";document.getElementById("expense-amount").value="";document.getElementById("expense-note").value="";document.getElementById("expense-form-title").textContent="Record Group Expense";document.getElementById("btn-cancel-expense").classList.add("hidden");}
document.getElementById("btn-cancel-expense").onclick=resetExpenseForm;
document.getElementById("expense-date").value=todayISO();
loadLedger();