const express = require("express");
const router = express.Router();
const { getCompanyFull, getAllCompanies } = require("../controllers/companyController");

router.get("/", getAllCompanies);
router.get("/:companyId/full", getCompanyFull);

module.exports = router;
