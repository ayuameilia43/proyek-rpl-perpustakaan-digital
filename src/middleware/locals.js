const { settingsRepository } = require("../repositories");

async function getSettings() {
  return settingsRepository.getSystemSettings();
}

async function loadLocals(req, res, next) {
  try {
    const user = req.session.user || null;
    res.locals.user = user;
    res.locals.currentPath = req.path;
    res.locals.isStaff = Boolean(user && (user.role === "admin" || user.role === "pustakawan"));
    res.locals.isAdmin = Boolean(user && user.role === "admin");

    res.locals.flash = req.session.flash || null;
    delete req.session.flash;

    res.locals.settings = await getSettings();
    res.locals.schoolName =
      (res.locals.settings && res.locals.settings.school_name) || "SMA NEGERI 1 MAJALENGKA";

    next();
  } catch (error) {
    next(error);
  }
}

function clearSettingsCache() {
  settingsRepository.invalidateCache();
}

module.exports = { loadLocals, getSettings, clearSettingsCache };
