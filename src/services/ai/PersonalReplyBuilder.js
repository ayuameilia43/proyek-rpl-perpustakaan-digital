const { formatDate, formatRupiah, dayDiff, numberedList } = require("./Formatters");

const ROLE_LABELS = {
  siswa: "Siswa",
  pustakawan: "Pustakawan",
  admin: "Administrator",
};

class PersonalReplyBuilder {
  build({ intents, personal, settings }) {
    const selected = new Set(intents);
    const parts = [
      selected.has("identity") ? this.buildIdentity(personal) : null,
      selected.has("quota") ? this.buildQuota(personal) : null,
      selected.has("eligibility") ? this.buildEligibility(personal) : null,
      selected.has("active") ? this.buildActive(personal, settings) : null,
      selected.has("pending") ? this.buildPending(personal) : null,
      selected.has("returned") ? this.buildReturned(personal) : null,
      selected.has("fines") ? this.buildFines(personal) : null,
      selected.has("history") ? this.buildHistory(personal, selected.has("returned")) : null,
      selected.has("overview") ? this.buildOverview(personal, settings) : null,
    ].filter(Boolean);

    if (!parts.length) parts.push(this.buildOverview(personal, settings));
    return parts.join("\n\n");
  }

  buildIdentity(personal) {
    const profile = personal.profile;
    const className = profile.class ? ` kelas ${profile.class}` : "";
    return `Anda adalah ${profile.full_name} (NISN ${profile.nisn}), akun ${ROLE_LABELS[profile.role] || profile.role}${className}. Email: ${profile.email || "-"}.`;
  }

  buildQuota(personal) {
    const profile = personal.profile;
    return `Kuota peminjaman Anda ${profile.max_books_allowed || 3} buku. Saat ini ${personal.stats.activeCount} buku sedang dipinjam dan ${personal.stats.pendingCount} pengajuan menunggu persetujuan.`;
  }

  buildEligibility(personal) {
    const limit = personal.profile.max_books_allowed || 3;
    const overdue = personal.active.filter(
      (loan) => loan.status === "terlambat" || dayDiff(new Date(), loan.due_date) < 0
    );
    const parts = [];

    if (overdue.length) {
      const titles = overdue.map((loan) => `"${loan.title}"`).join(", ");
      parts.push(
        `Anda belum bisa meminjam buku baru karena masih ada peminjaman terlambat: ${titles}. Kembalikan buku tersebut terlebih dahulu.`
      );
    } else if (personal.stats.activeCount >= limit) {
      parts.push(
        `Anda belum bisa meminjam buku baru karena kuota ${limit} buku sudah penuh. Kembalikan salah satu buku terlebih dahulu.`
      );
    } else {
      parts.push(`Anda bisa meminjam buku baru. Sisa kuota Anda ${limit - personal.stats.activeCount} dari ${limit} buku.`);
    }

    if (personal.unpaidFine > 0) {
      parts.push(`Catatan: Anda masih memiliki denda belum lunas sebesar ${formatRupiah(personal.unpaidFine)}.`);
    }

    return parts.join(" ");
  }

  buildActive(personal, settings) {
    if (!personal.active.length) return "Saat ini Anda tidak sedang meminjam buku.";
    const lines = personal.active.map((loan) => this.describeActiveLoan(loan, settings));
    return `Buku yang sedang Anda pinjam:\n${numberedList(lines)}`;
  }

  buildPending(personal) {
    if (!personal.pending.length) return "Tidak ada pengajuan peminjaman yang menunggu persetujuan.";
    const lines = personal.pending.map((loan) => this.describePendingLoan(loan));
    return `Pengajuan yang masih menunggu persetujuan:\n${numberedList(lines)}`;
  }

  buildReturned(personal) {
    if (!personal.returned.length) return "Belum ada buku yang selesai Anda pinjam (dikembalikan).";
    const lines = personal.returned.map((loan) => this.describeReturnedLoan(loan));
    return `Buku yang sudah selesai Anda pinjam (dikembalikan):\n${numberedList(lines)}`;
  }

  buildFines(personal) {
    if (personal.unpaidFine <= 0) return "Tidak ada denda yang belum lunas.";

    const parts = [`Total denda yang belum lunas: ${formatRupiah(personal.unpaidFine)}.`];
    const fineTransactions = personal.transactions.filter((transaction) => Number(transaction.fine_amount) > 0);

    if (fineTransactions.length) {
      const lines = fineTransactions.map((transaction) => this.describeFine(transaction));
      parts.push(`Rincian denda:\n${numberedList(lines)}`);
    }

    return parts.join("\n\n");
  }

  buildHistory(personal, hasReturnedSection) {
    const stats = personal.stats;
    const summary = `Riwayat peminjaman Anda: total ${stats.total} transaksi (${stats.activeCount} aktif, ${stats.pendingCount} menunggu persetujuan, ${stats.returnedCount} selesai, ${stats.rejectedCount} ditolak).`;

    if (!personal.returned.length || hasReturnedSection) return summary;
    const lines = personal.returned.map((loan) => this.describeReturnedLoan(loan));
    return `${summary}\n\nBuku yang sudah selesai Anda pinjam:\n${numberedList(lines)}`;
  }

  buildOverview(personal, settings) {
    const stats = personal.stats;
    const parts = [
      `Ringkasan akun Anda: ${stats.activeCount} buku sedang dipinjam, ${stats.pendingCount} pengajuan menunggu persetujuan, ${stats.returnedCount} buku sudah selesai dipinjam, dan denda belum lunas ${formatRupiah(personal.unpaidFine)}.`,
    ];

    if (personal.active.length) {
      const lines = personal.active.map((loan) => this.describeActiveLoan(loan, settings));
      parts.push(`Buku yang sedang Anda pinjam:\n${numberedList(lines)}`);
    }

    return parts.join("\n\n");
  }

  describeActiveLoan(loan, settings) {
    const daysLeft = dayDiff(new Date(), loan.due_date);
    const timing =
      daysLeft === 0
        ? "jatuh tempo hari ini"
        : daysLeft > 0
          ? `${daysLeft} hari lagi`
          : `terlambat ${Math.abs(daysLeft)} hari`;
    let fine = Number(loan.fine_amount) || 0;
    if (daysLeft < 0 && fine <= 0) fine = Math.abs(daysLeft) * Number((settings && settings.fine_per_day) || 0);
    const fineText = fine > 0 ? `, denda ${formatRupiah(fine)}` : "";
    const formatLabel = loan.format === "e-book" ? "E-Book" : "Fisik";
    return `"${loan.title}" oleh ${loan.author} (${formatLabel}) — jatuh tempo ${formatDate(loan.due_date)} (${timing}${fineText}).`;
  }

  describeReturnedLoan(loan) {
    const fine = Number(loan.fine_amount) || 0;
    let text = `"${loan.title}" — dikembalikan ${formatDate(loan.return_date)}`;
    if (fine > 0) {
      const paidStatus = loan.fine_paid_status === "lunas" ? "lunas" : "belum lunas";
      text += `, denda ${formatRupiah(fine)} (${paidStatus})`;
    }
    return `${text}.`;
  }

  describePendingLoan(loan) {
    return `"${loan.title}" — diajukan ${formatDate(loan.borrow_date)}.`;
  }

  describeFine(transaction) {
    const paidStatus = transaction.fine_paid_status === "lunas" ? "lunas" : "belum lunas";
    const returnedText = transaction.return_date ? `, dikembalikan ${formatDate(transaction.return_date)}` : "";
    return `"${transaction.title}" — ${formatRupiah(transaction.fine_amount)} (${paidStatus})${returnedText}.`;
  }
}

module.exports = PersonalReplyBuilder;
