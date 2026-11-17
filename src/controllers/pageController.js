/**
 * Controller halaman placeholder untuk menu yang akan dibangun pada fase berikutnya.
 * Membuat navigasi sidebar tetap berfungsi (tidak 404) selama pengembangan bertahap.
 */
function placeholder(title, description) {
  return (req, res) => {
    res.render("placeholder", {
      title,
      heading: title,
      description: description || "Fitur ini akan dibangun pada fase pengembangan berikutnya.",
    });
  };
}

module.exports = { placeholder };
