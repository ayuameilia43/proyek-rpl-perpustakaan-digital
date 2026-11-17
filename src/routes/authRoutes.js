/**
 * Rute autentikasi: login, registrasi, logout.
 */
const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");
const { guestOnly } = require("../middleware/auth");

router.get("/login", guestOnly, auth.getLogin);
router.post("/login", guestOnly, auth.postLogin);
router.get("/register", guestOnly, auth.getRegister);
router.post("/register", guestOnly, auth.postRegister);
router.post("/logout", auth.logout);

module.exports = router;
