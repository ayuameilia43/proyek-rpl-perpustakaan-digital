const ACTIVE_STATUSES = new Set(["dipinjam", "terlambat"]);
const PENDING_STATUS = "menunggu_persetujuan";
const RETURNED_STATUS = "dikembalikan";
const REJECTED_STATUS = "ditolak";

class LibraryContextBuilder {
  constructor({ settingsRepository, bookRepository, userRepository, transactionRepository }) {
    this.settingsRepository = settingsRepository;
    this.bookRepository = bookRepository;
    this.userRepository = userRepository;
    this.transactionRepository = transactionRepository;
  }

  async build(user) {
    const settings = await this.settingsRepository.getSystemSettings();
    const aiConfig = await this.settingsRepository.getAiRuntimeConfig();

    const [books, profile, transactions] = await Promise.all([
      this.bookRepository.findActiveCatalog({ limit: 40 }),
      user && user.id ? this.userRepository.findProfileById(user.id) : null,
      user && user.id ? this.transactionRepository.findByUserIdWithBook(user.id) : [],
    ]);

    return {
      settings,
      aiConfig,
      books,
      personal: profile ? this.buildPersonalContext(profile, transactions) : null,
      rules: this.buildLibraryRules(settings),
    };
  }

  buildPersonalContext(profile, transactions) {
    const active = transactions.filter((transaction) => ACTIVE_STATUSES.has(transaction.status));
    const pending = transactions.filter((transaction) => transaction.status === PENDING_STATUS);
    const returned = transactions.filter((transaction) => transaction.status === RETURNED_STATUS);
    const rejected = transactions.filter((transaction) => transaction.status === REJECTED_STATUS);
    const unpaidFine = transactions.reduce((total, transaction) => {
      const fine = Number(transaction.fine_amount) || 0;
      return transaction.fine_paid_status !== "lunas" && fine > 0 ? total + fine : total;
    }, 0);

    return {
      profile,
      transactions,
      active,
      pending,
      returned,
      rejected,
      unpaidFine,
      stats: {
        total: transactions.length,
        activeCount: active.length,
        pendingCount: pending.length,
        returnedCount: returned.length,
        rejectedCount: rejected.length,
      },
    };
  }

  buildLibraryRules(settings) {
    const start = String((settings && settings.operating_hours_start) || "07:00").slice(0, 5);
    const end = String((settings && settings.operating_hours_end) || "21:00").slice(0, 5);

    return {
      schoolName: (settings && settings.school_name) || "Perpustakaan Digital SMA NEGERI 1 MAJALENGKA",
      maxBorrowDuration: Number(settings && settings.max_borrow_duration) || 7,
      finePerDay: Number((settings && settings.fine_per_day) || 0),
      maxBooks: Number(settings && settings.max_books_per_student) || 3,
      openHours: `${start} - ${end}`,
    };
  }
}

module.exports = LibraryContextBuilder;
