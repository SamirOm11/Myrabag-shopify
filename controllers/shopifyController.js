const axios = require('axios');
const OrderStatus = require('../model/order-status');

exports.getShopifyOrders = async (req, res) => {
  let statusDoc;
  try {
    const shop = process.env.SHOPIFY_SHOP;
    console.log("🚀 ~ exports.getShopifyOrders= ~ shop:", shop)
    const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
    console.log("🚀 ~ exports.getShopifyOrders= ~ accessToken:", accessToken)
    if (!shop || !accessToken) {
      return res.status(500).json({ error: 'Shopify credentials not set in .env' });
    }

    // Create or update a single status document for this fetch job
    statusDoc = await OrderStatus.findOneAndUpdate(
      { orderId: 'shopify-fetch-all' },
      { status: 'pending', message: 'Fetching all orders from Shopify' },
      { upsert: true, new: true }
    );

    // Remove protocol and trailing slash if present
    let shopDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `https://${shopDomain}/admin/api/2023-04/graphql.json`;
    console.log("🚀 ~ exports.getShopifyOrders= ~ url:", url)

    // Fetch all orders with cursor-based pagination
    let endCursor = null;
    let allOrders = [];
    let hasNextPage = true;
    let batch = 1;
    // Robust approach: fetch until hasNextPage is false, but also break if the cursor repeats (to avoid infinite loops)
    const seenCursors = new Set();
    console.log("🚀 ~ exports.getShopifyOrders= ~ seenCursors:", seenCursors)
    console.log('Starting to fetch orders...');
    for (let i = 0; hasNextPage; i++) {
      const query = `{
        orders(first: 250${endCursor ? `, after: \"${endCursor}\"` : ''}) {
          pageInfo {
            hasNextPage
          }
          edges {
        cursor
        node {
          id
          name
          email
          createdAt
          displayFulfillmentStatus
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  title
                  sku
                  price
                }
              }
            }
          }
             fulfillments(first: 10) {
              status
            }
          shippingAddress {
            name
            address1
            city
            country
            zip
          }
          customer {
            id
            displayName
            email
          }
        }
      }
        }
      }`;
      console.log(`Fetching batch #${batch}... endCursor: ${endCursor}`);
      const response = await axios.post(
        url,
        { query },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );
      const data = response.data.data.orders;
      const batchOrders = data.edges.map(edge => edge.node);
      console.log(`Batch #${batch} fetched: ${batchOrders.length} orders`);
      if (batchOrders.length === 0) {
        console.log('No new orders fetched in this batch. Stopping to prevent infinite loop.');
        break;
      }
      allOrders.push(...batchOrders);
      hasNextPage = data.pageInfo.hasNextPage;
      const prevCursor = endCursor;
      endCursor = data.edges.length > 0 ? data.edges[data.edges.length - 1].cursor : null;
      // Detect cursor repetition
      if (endCursor && seenCursors.has(endCursor)) {
        console.log('Cursor repeated. Stopping to prevent infinite loop.');
        break;
      }
      if (endCursor) seenCursors.add(endCursor);
      batch++;
      if (!hasNextPage) break;
    }
    // After all orders fetched, set status to completed
    await OrderStatus.findOneAndUpdate(
      { orderId: 'shopify-fetch-all' },
      { status: 'completed', message: 'All orders fetched successfully' }
    );
    console.log('All orders fetched!');
    res.json({ status: 'fetched', orders: allOrders });
  } catch (error) {
    // On error, set status to failed
    await OrderStatus.findOneAndUpdate(
      { orderId: 'shopify-fetch-all' },
      { status: 'failed', message: 'Failed to fetch orders from Shopify' }
    );
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch orders from Shopify' });
  }
};
