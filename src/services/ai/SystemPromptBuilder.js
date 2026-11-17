const { formatDate, formatRupiah, dayDiff } = require("./Formatters");

const ROLE_LABELS = {
  siswa: "Siswa",
  pustakawan: "Pustakawan",
  admin: "Administrator",
};

class SystemPromptBuilder {
  build(context) {
    const { books, personal, rules, settings } = context;
    const sections = [
      `Anda adalah Pustakawan Virtual dari ${rules.schoolName}, perpustakaan digital SMA NEGERI 1 MAJALENGKA.`,
      "Jawab selalu dalam bahasa Indonesia yang ramah, jelas, dan ringkas.",
      this.buildPersonalSection(personal, settings),
      `Aturan perpustakaan: durasi pinjam ${rules.maxBorrowDuration} hari, denda ${formatRupiah(rules.finePerDay)} per hari, kuota ${rules.maxBooks} buku, jam operasional ${rules.openHours}.`,
      `Koleksi perpustakaan:\n${this.buildCatalogText(books)}`,
      "Jika pertanyaan tentang akun tidak dapat dijawab dari data di atas, katakan dengan jujur datanya tidak tersedia dan arahkan pengguna ke menu Dashboard atau Riwayat.",
      "Jangan pernah mengarang judul, tanggal, denda, atau status peminjaman.",
      "Jika pertanyaan di luar konteks perpustakaan, jawab seperlunya atau sarankan untuk datang ke perpustakaan.",
    ];

    if (settings && settings.ai_system_prompt) {
      sections.push(`Instruksi tambahan dari administrator: ${settings.ai_system_prompt}`);
    }

    return sections.join("\n\n");
  }

  buildCatalogText(books) {
    return (books || [])
      .map((book) => {
        const formatLabel = book.format === "e-book" ? "E-Book" : "Fisik";
        const stock =
          book.format === "e-book"
            ? Number(book.stock_ebook) > 0
              ? "e-book tersedia"
              : "e-book tidak tersedia"
            : Number(book.stock_fisic) > 0
              ? `stok fisik ${book.stock_fisic}`
              : "stok fisik habis";
        const synopsis = book.synopsis ? ` — ${book.synopsis}` : "";
        return `- ${book.title} (${formatLabel}, ${stock}) oleh ${book.author}${synopsis}`;
      })
      .join("\n");
  }

  buildPersonalSection(personal, settings) {
    if (!personal) return "Pengguna tidak terautentikasi.";
    const snapshot = this.buildPersonalSnapshot(personal, settings);
    return `Data akun pengguna yang sedang login (gunakan untuk pertanyaan pribadi, jangan dibagikan ke pengguna lain):\n${snapshot}`;
  }

  buildPersonalSnapshot(personal, settings) {
    const profile = personal.profile;
    const lines = [];

    lines.push(
      `Nama: ${profile.full_name}; NISN: ${profile.nisn}; Kelas: ${profile.class || "-"}; Peran: ${ROLE_LABELS[profile.role] || profile.role}; Email: ${profile.email || "-"}.`
    );
    lines.push(
      `Kuota pinjam: ${profile.max_books_allowed || 3} buku; sedang dipinjam: ${personal.stats.activeCount} buku.`
    );
    lines.push(...this.buildActiveLines(personal.active, settings));
    lines.push(...this.buildPendingLines(personal.pending));
    lines.push(...this.buildReturnedLines(personal.returned));
    lines.push(...this.buildRejectedLines(personal.rejected));
    lines.push(`Total denda belum lunas: ${formatRupiah(personal.unpaidFine)}.`);

    return lines.join("\n");
  }

  buildActiveLines(active, settings) {
    if (!active.length) return ["Buku yang sedang dipinjam: tidak ada."];
    return ["Buku yang sedang dipinjam:", ...active.map((loan) => `- ${this.describeActiveLoan(loan, settings)}`)];
  }

  buildPendingLines(pending) {
    if (!pending.length) return ["Pengajuan menunggu persetujuan: tidak ada."];
    return ["Pengajuan menunggu persetujuan:", ...pending.map((loan) => `- ${this.describePendingLoan(loan)}`)];
  }

  buildReturnedLines(returned) {
    if (!returned.length) return ["Buku yang sudah selesai dipinjam (dikembalikan): belum ada."];

    const lines = ["Buku yang sudah selesai dipinjam (dikembalikan):"];
    returned.slice(0, 20).forEach((loan) => lines.push(`- ${this.describeReturnedLoan(loan)}`));
    if (returned.length > 20) lines.push(`- dan ${returned.length - 20} buku lainnya.`);
    return lines;
  }

  buildRejectedLines(rejected) {
    if (!rejected.length) return [];

    const lines = [`Pengajuan ditolak: ${rejected.length}`];
    rejected.slice(0, 10).forEach((loan) => {
      const reason = loan.admin_notes ? ` (alasan: ${loan.admin_notes})` : "";
      lines.push(`- "${loan.title}"${reason}`);
    });
    return lines;
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
}

module.exports = SystemPromptBuilder;
