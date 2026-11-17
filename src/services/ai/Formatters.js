function toDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parts = value.slice(0, 10).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(value);
}

function formatDate(value) {
  if (!value) return "-";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatRupiah(value) {
  const amount = Number(value || 0);
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function dayDiff(from, to) {
  if (!to) return 0;
  const startDate = toDate(from);
  const endDate = toDate(to);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
}

function numberedList(items, max = 20) {
  const shown = items.slice(0, max);
  const lines = shown.map((line, index) => `${index + 1}. ${line}`);
  if (items.length > shown.length) lines.push(`... dan ${items.length - shown.length} lainnya.`);
  return lines.join("\n");
}

module.exports = { toDate, formatDate, formatRupiah, dayDiff, numberedList };
