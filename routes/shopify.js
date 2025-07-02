const express = require('express');
const router = express.Router();
const { getShopifyOrders } = require('../controllers/shopifyController');

router.get('/orders', getShopifyOrders);

module.exports = router;
