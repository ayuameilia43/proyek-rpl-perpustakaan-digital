const BookRepository = require("./BookRepository");
const SettingsRepository = require("./SettingsRepository");
const UserRepository = require("./UserRepository");
const TransactionRepository = require("./TransactionRepository");

const bookRepository = new BookRepository();
const settingsRepository = new SettingsRepository();
const userRepository = new UserRepository();
const transactionRepository = new TransactionRepository();

module.exports = {
  BookRepository,
  SettingsRepository,
  UserRepository,
  TransactionRepository,
  bookRepository,
  settingsRepository,
  userRepository,
  transactionRepository,
};
