class PersonalIntentDetector {
  detect(text) {
    const question = this.normalizeQuestion(text);
    if (!this.hasSelfReference(question)) return [];

    const intents = new Set();
    this.collectIdentity(question, intents);
    this.collectLoanIntents(question, intents);
    this.collectAccountIntents(question, intents);
    this.collectFallbackIntents(question, intents);
    this.fixUnreturnedBookIntent(question, intents);

    return Array.from(intents);
  }

  normalizeQuestion(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  hasSelfReference(question) {
    return /\b(saya|aku|ku|gue|gua|gw)\b/.test(question);
  }

  collectIdentity(question, intents) {
    const identityPattern =
      /siapa (saya|aku)|saya siapa|nama saya|profil saya|data (saya|akun)|akun saya|identitas saya|kelas saya|nisn saya|email saya|role saya|peran saya/;
    if (identityPattern.test(question)) intents.add("identity");
  }

  collectLoanIntents(question, intents) {
    const loanWord = /pinjam|meminjam|pinjaman|dipinjam/.test(question);
    const activeWord = /sedang|lagi|masih|aktif|sekarang|berjalan/.test(question);
    const completedWord = /selesai|sudah|pernah|riwayat|dikembalikan|kembali/.test(question);

    if (loanWord && activeWord) intents.add("active");
    if (loanWord && completedWord) intents.add("returned");
    if (!loanWord && /buku/.test(question) && (/selesai|sudah|pernah/.test(question) || /yang (saya|aku) kembalikan/.test(question))) {
      intents.add("returned");
    }
    if (/jatuh tempo|harus dikembalikan|kapan kembali|kapan dikembalikan/.test(question)) intents.add("active");
    if (/terlambat/.test(question)) intents.add("active");
  }

  collectAccountIntents(question, intents) {
    if (/menunggu|pending|pengajuan|diajukan|persetujuan/.test(question)) intents.add("pending");
    if (/denda|tunggakan/.test(question)) intents.add("fines");
    if (/kuota|batas|maksimal|jatah|bisa pinjam berapa/.test(question)) intents.add("quota");
    if (/bisa (pinjam|meminjam)|boleh (pinjam|meminjam)|syarat (pinjam|peminjaman)|apakah saya bisa/.test(question)) {
      intents.add("eligibility");
    }
    if (/riwayat/.test(question)) intents.add("history");
  }

  collectFallbackIntents(question, intents) {
    if (intents.size) return;

    const loanWord = /pinjam|meminjam|pinjaman|dipinjam/.test(question);
    if (loanWord) {
      intents.add("overview");
      return;
    }

    const mentionsOwnBooks = /buku (saya|aku)|pinjaman saya|buku yang saya/.test(question);
    const excludesRecommendations = /favorit|rekomendasi|suka|ingin baca/.test(question);
    if (mentionsOwnBooks && !excludesRecommendations) intents.add("overview");
  }

  fixUnreturnedBookIntent(question, intents) {
    if (!/belum (saya )?kembalikan|belum dikembalikan/.test(question)) return;
    intents.delete("returned");
    intents.add("active");
  }
}

module.exports = PersonalIntentDetector;
