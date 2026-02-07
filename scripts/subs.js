(function () {
  const DATA_URLS = ["./data/aggregated.json", "./scripts/data/aggregated.json"];

  const els = {
    updated: document.getElementById("subsUpdated"),
    paymentsTbody: document.getElementById("subsPaymentsBody"),
    paymentsCount: document.getElementById("subsPaymentsCount"),
    paymentsEmpty: document.getElementById("paymentsEmpty"),
  };

  async function loadAggregatedJson() {
    let lastErr = null;

    for (const url of DATA_URLS) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error("Failed to load aggregated.json from any known path");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function gbp(n) {
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
  }

  function fmtDateShort(isoLike) {
    if (!isoLike) return "—";
    const dt = new Date(isoLike);
    if (Number.isNaN(dt.getTime())) return escapeHtml(String(isoLike));
    return dt.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function sortMostRecentFirst(a, b) {
    const ad = new Date(a.date || 0).getTime();
    const bd = new Date(b.date || 0).getTime();
    if (bd !== ad) return bd - ad;

    const ac = new Date(a.createdTime || 0).getTime();
    const bc = new Date(b.createdTime || 0).getTime();
    if (bc !== ac) return bc - ac;

    return String(b.rowId ?? b.id ?? "").localeCompare(String(a.rowId ?? a.id ?? ""));
  }

  function normalisePaymentEntries(data) {
    // Prefer subsLedger (it definitely represents "payments")
    const ledger = Array.isArray(data?.subsLedger) ? data.subsLedger : null;
    const source = ledger && ledger.length ? ledger : Array.isArray(data?.subsTransactions) ? data.subsTransactions : [];

    return source.map((e) => ({
      date: e.date,
      createdTime: e.createdTime,
      rowId: e.rowId,
      playerName: e.playerName || "Unknown",
      amountPaid: Number(e.amountPaid ?? 0),
      gamesAdded: Number(e.subsAdded ?? 0),
      notes: e.notes ? String(e.notes) : "",
    }));
  }

  function renderPaymentsTable(entries) {
    if (!els.paymentsTbody) return;

    const list = Array.isArray(entries) ? entries.slice() : [];
    list.sort(sortMostRecentFirst);

    if (els.paymentsCount) els.paymentsCount.textContent = String(list.length);

    els.paymentsTbody.innerHTML = "";
    const hasAny = list.length > 0;

    if (els.paymentsEmpty) els.paymentsEmpty.hidden = hasAny;

    if (!hasAny) {
      els.paymentsTbody.innerHTML = `<tr><td colspan="5" class="empty">No payments found.</td></tr>`;
      return;
    }

    for (const e of list) {
      els.paymentsTbody.insertAdjacentHTML(
        "beforeend",
        `<tr>
          <td>${escapeHtml(fmtDateShort(e.date))}</td>
          <td>${escapeHtml(e.playerName)}</td>
          <td class="num">${escapeHtml(gbp(e.amountPaid))}</td>
          <td class="num">${escapeHtml(String(e.gamesAdded))}</td>
          <td class="notes">${escapeHtml(e.notes)}</td>
        </tr>`
      );
    }
  }

  async function init() {
    try {
      const data = await loadAggregatedJson();

      // Updated timestamp lives under meta.generatedAt
      if (els.updated) {
        const raw = data?.meta?.generatedAt;
        const dt = raw ? new Date(raw) : null;
        const out =
          dt && !Number.isNaN(dt.getTime())
            ? dt.toLocaleString("en-GB")
            : raw
            ? String(raw)
            : "—";
        els.updated.textContent = `Updated: ${out}`;
      }

      const entries = normalisePaymentEntries(data);
      renderPaymentsTable(entries);
    } catch (err) {
      console.error("Subs page init failed:", err);
      if (els.paymentsTbody)
        els.paymentsTbody.innerHTML = `<tr><td colspan="5" class="empty">Failed to load payments.</td></tr>`;
      if (els.paymentsEmpty) els.paymentsEmpty.hidden = true;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
