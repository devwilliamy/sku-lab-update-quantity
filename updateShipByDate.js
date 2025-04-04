const { determineLatestShippingDate } = require("./deliveryDateUtils");
const LoggingService = require("./loggingService.js");
const SupabaseService = require("./supabaseService.js");
const { DateTime } = require("luxon");

require("dotenv").config();

const logger = new LoggingService();
const supabaseService = new SupabaseService();

const GETOption = {
  method: "GET",
  headers: {
    Authorization: `Bearer ${process.env.SKU_LAB_TOKEN}`,
  },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Process orders in batches by date ranges to handle API limits
 */
async function batchUpdateShipByDate() {
  // Define the overall date range
  const fullStartDate = "2025-01-01T08:00:00Z";
  const fullEndDate = "2025-02-22T07:59:59Z"; // Example end date

  // Convert to DateTime objects for easier manipulation
  let currentStart = DateTime.fromISO(fullStartDate);
  const finalEnd = DateTime.fromISO(fullEndDate);

  // Batch size in days (adjust based on your data volume)
  const batchSizeDays = 5; // 5-day chunks

  let totalOrdersProcessed = 0;
  let totalBatches = 0;

  console.log(
    `Starting batch processing from ${fullStartDate} to ${fullEndDate}`
  );
  logger.info(
    `Starting batch processing from ${fullStartDate} to ${fullEndDate}`
  );

  // Process batches until we reach the final end date
  while (currentStart < finalEnd) {
    // Calculate the end of this batch (either batchSizeDays later or the final end date)
    let currentEnd = currentStart.plus({ days: batchSizeDays });
    if (currentEnd > finalEnd) {
      currentEnd = finalEnd;
    }

    totalBatches++;

    // Format dates for the API call
    const startDateStr = currentStart.toISO();
    const endDateStr = currentEnd.toISO();

    console.log(
      `Processing batch ${totalBatches}: ${startDateStr} to ${endDateStr}`
    );
    logger.info(
      `Processing batch ${totalBatches}: ${startDateStr} to ${endDateStr}`
    );

    // Process this batch
    const batchCount = await updateShipByDate(startDateStr, endDateStr);
    totalOrdersProcessed += batchCount;

    // Move to the next batch
    currentStart = currentEnd;

    // Optional: Add a delay between batches to avoid API rate limits
    await delay(2000);
  }

  console.log(
    `Completed all batches. Processed ${totalOrdersProcessed} orders in ${totalBatches} batches.`
  );
  logger.info(
    `Completed all batches. Processed ${totalOrdersProcessed} orders in ${totalBatches} batches.`
  );

  return totalOrdersProcessed;
}

async function updateShipByDate(startDate, endDate) {
  let productCount = 0;
  // const startDate = "2024-12-10T08:00:00Z";
  // const endDate = "2024-12-15T07:59:59Z";
  // const endDate = "2024-12-02T11:59:59Z";
  const responseGET = await fetch(
    `https://api.skulabs.com/order/get_all?request_body={"start":"${startDate}","end":"${endDate}","tags":["6328f5c3c3ea0aede729f817"]}`,
    // `https://api.skulabs.com/order/get_all?request_body={"start":"2024-11-19T08:00:00","end":"2025-02-22T07:59:59","tags":["6328f5c3c3ea0aede729f817"]}`,
    // 'https://api.skulabs.com/order/get_single?store_id=62f0fcbffc3f4e916f865d6a&order_number=CL-TEST-PRE-250221-SE-0963',
    GETOption
  );
  const { orders } = await responseGET.json();
  console.log(
    `Updating Ship by Date. Start Date: ${startDate}. End Date: ${endDate} Order Count: ${orders.length}`
  );
  logger.info(
    `Updating Ship by Date. Start Date: ${startDate}. End Date: ${endDate} Order Count: ${orders.length}`
  );
  for (const order of orders) {
    productCount++;
    console.log(`Product count: ${productCount}`);
    logger.info(`Product count: ${productCount}`);
    if (new Date(order.date) < new Date(startDate)) {
      console.log(
        `[WARNING]: Found order date that was before start date. Date: ${order.date}, Start Date: ${startDate}`
      );
      logger.info(
        `[WARNING]: Found order date that was before start date. Date: ${order.date}, Start Date: ${startDate}`
      );
      continue;
    }
    try {
      const orderNumber = order.order_number;
      const notes = order.stash.notes || "";
      const orderDate = order.stash.date;

      const cartItems = parsePreorderInfoFromNotes(notes);

      console.log(
        `${orderNumber}: Found ${
          cartItems.length
        } items, order date: ${convertToPacificTime(
          orderDate
        )}, preorder dates:`,
        cartItems.map((item) => item.preorder_date || "null").join(", ")
      );

      logger.info(
        `${orderNumber}: Found ${
          cartItems.length
        } items, order date: ${convertToPacificTime(
          orderDate
        )}, preorder dates:`,
        cartItems.map((item) => item.preorder_date || "null").join(", ")
      );
      const newShipByDate = determineLatestShippingDate(cartItems, orderDate);
      console.log(`${orderNumber}: New Ship By Date: ${newShipByDate}`);

      logger.info(`${orderNumber}: New Ship By Date: ${newShipByDate}`);
      const updatedStash = {
        ...order.stash,
        ship_by_date: newShipByDate,
      };

      // ----- UPDATE ORDER INFO OR APPEND NEW INFO HERE -----
      // matchingOrder.stash.items[0].id = matchedID;
      // matchingOrder.stash.items[0].type = matchedType;
      // matchingOrder.stash.items[0].price = matchingOrder.stash.total; // Need to work on a stable price.

      // console.log(matchingOrder.stash);

      // Put the payload into PUTOption
      const PUTOption = {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${process.env.SKU_LAB_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          store_id: "62f0fcbffc3f4e916f865d6a",
          order_number: orderNumber,
          stash: updatedStash, // Order # stash
        }),
      };

      // API CALL
      const responsePUT = await fetch(
        "https://api.skulabs.com/order/override",
        PUTOption
      );
      const dataPut = await responsePUT.json();
      console.log(
        `${orderNumber}: Updated ship_by_date to ${newShipByDate}, Data: ${JSON.stringify(
          dataPut,
          null,
          2
        )}`
      );
      logger.info(
        `${orderNumber}: Updated ship_by_date to ${newShipByDate}, Data: ${JSON.stringify(
          dataPut,
          null,
          2
        )}`
      );
      await supabaseService.updateOrdersShipByDate(orderNumber, newShipByDate);
      console.log(`${orderNumber}: Updated supabase order to ${newShipByDate}`);
      logger.info(`${orderNumber}: Updated supabase order to ${newShipByDate}`);
      console.log("-----------------------------------------------");
      logger.info("-----------------------------------------------");
      await delay(1000);
    } catch (error) {
      const orderNumber = order?.order_number || "unknown";
      await delay(1000);
      console.log(error);
      console.log(`${orderNumber}: produced ERROR for unknown reasons.`);
      logger.error(error);
      logger.error(`${orderNumber}: produced ERROR for unknown reasons.`);
    }
  }
  return orders.length;
}

/**
 * Parse preorder information from the order notes
 * @param {string} notes - The order notes containing preorder information
 * @returns {Array} - Array of cart items with preorder information
 */
function parsePreorderInfoFromNotes(notes) {
  const cartItems = [];

  // Split notes by product
  const lines = notes.split("\n");

  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line starts with "CL-" which indicates a new product
    if (
      line.startsWith("CL-") ||
      line.startsWith("CA-") ||
      line.startsWith("SC-") ||
      line.startsWith("CN-") ||
      line.startsWith("CC-")
    ) {
      // Save previous item if exists
      if (currentItem) {
        cartItems.push(currentItem);
      }

      // Start a new item
      currentItem = {
        preorder: false,
        preorder_date: null,
      };
    }

    // Check for preorder date
    if (
      line.startsWith("Preorder / Ship Date:") ||
      line.startsWith("Preorder Date:")
    ) {
      let preorderDateStr;
      if (line.startsWith("Preorder / Ship Date:")) {
        preorderDateStr = line.substring("Preorder / Ship Date:".length).trim();
      } else {
        preorderDateStr = line.substring("Preorder Date:".length).trim();
      }

      if (preorderDateStr && preorderDateStr.toLowerCase() !== "null") {
        // Convert MM/DD/YYYY to ISO format (YYYY-MM-DD)
        currentItem.preorder = true;

        // Parse the date (handle format MM/DD/YYYY)
        const dateParts = preorderDateStr.split("/");
        if (dateParts.length === 3) {
          const month = dateParts[0].padStart(2, "0");
          const day = dateParts[1].padStart(2, "0");
          const year = dateParts[2];

          // Create ISO date string (YYYY-MM-DDT11:00:00-08:00)
          // Using 11 AM Pacific as the standard ship time
          currentItem.preorder_date = `${year}-${month}-${day}T11:00:00-08:00`;
          // currentItem.preorder_date = `null`;
        }
      }
    }
  }

  // Add the last item if exists
  if (currentItem) {
    cartItems.push(currentItem);
  }

  // If no items were found, create a default item with no preorder
  if (cartItems.length === 0) {
    cartItems.push({
      preorder: false,
      preorder_date: null,
    });
  }

  return cartItems;
}

/**
 * Convert a UTC ISO date string to Pacific Time with timezone offset
 * @param {string} utcDateString - The UTC date string (e.g. "2025-02-18T06:49:49.661Z")
 * @param {number} hour - Optional hour to set (default: 11)
 * @returns {string} - Pacific Time date string with offset (e.g. "2025-03-10T11:00:00-08:00")
 */
function convertToPacificTime(utcDateString, hour = 11) {
  // Parse the UTC date string
  const utcDate = DateTime.fromISO(utcDateString);

  // Convert to Pacific Time zone
  const pacificDate = utcDate.setZone("America/Los_Angeles");
  // Set the time to specified hour (default 11:00:00)
  // .set({ hour: hour, minute: 0, second: 0, millisecond: 0 });

  // Format as ISO with timezone offset included
  return pacificDate.toISO();
}

module.exports = {
  updateShipByDate,
  batchUpdateShipByDate,
};
