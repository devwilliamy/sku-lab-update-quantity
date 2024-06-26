const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");
const { DateTime } = require("luxon");
const fs = require("fs");
require("dotenv").config();

function getTimestamp() {
  return DateTime.now().setZone("America/Los_Angeles").toISO();
}

/**
 * Creates JSON report
 * @param {*} data
 */
const writeReportToFile = (data) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  const formattedDate = `${year}${month}${day}_${hours}${minutes}`;
  const filePath = `skuLabSkuUpdateReport_${formattedDate}.json`;
  const jsonContent = JSON.stringify(data, null, 2);
  fs.writeFile(filePath, jsonContent, "utf8", (err) => {
    if (err) {
      console.error(`${getTimestamp()} Error writing JSON to file:`, err);
    } else {
      console.info(`${getTimestamp()} JSON file has been saved.`);
    }
  });
};

/**
 *
 * @param {*} input - "UTC" | "PST"
 * @returns
 * Example Input:
 * '2024-06-10T19:30:23.627Z' -> 2024-06-10T12:30:23.627-07:00
 * 1718015931000 -> 2024-06-10T12:30:23.627-07:00
 */
function formatTime(input, timezone = "UTC") {
  let dateTime;

  if (typeof input === "string") {
    dateTime = DateTime.fromISO(input, { zone: "utc" });
  } else if (typeof input === "number") {
    dateTime = DateTime.fromMillis(input, { zone: "utc" });
  } else {
    throw new Error("Invalid input type. Expected a string or number.");
  }

  if (timezone === "PST") {
    dateTime = dateTime.setZone("America/Los_Angeles");
  } else if (timezone === "UTC") {
    dateTime = dateTime.setZone("utc");
  } else {
    throw new Error('Invalid timezone. Expected "UTC" or "PST".');
  }

  return dateTime.toISO();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Uses Sku Labs Item Get API to get the item.
 * We are taking Sku Lab SKU from Products table to get the item id from SKU Lab
 * so we can map it later
 * @param {string[]} skuArray
 * @returns - skuLabItem[]
 *
 * SKU Lab SKU: "CA-SC-10-F-10-BE-1TO"
 * ex: Item ID: 65ea058dc232eeedf72687ac
 */
const getSkuLabsInventory = async (skuArray) => {
  try {
    const selector = { sku: { $in: skuArray } };

    const response = await axios.get("https://api.skulabs.com/item/get", {
      params: {
        selector: JSON.stringify(selector),
      },
      headers: {
        Authorization: `Bearer ${process.env.SKU_LAB_TOKEN}`,
      },
    });
    // console.debug("response.data:", response.data);

    return response.data;
  } catch (error) {
    console.error(
      `${getTimestamp()} [getSkuLabsInventory]: Error fetching SKU Labs inventory:`,
      error
    );
    throw error;
  }
};

/**
 * Calls Sku Labs Inventory Get On Hand Location Map
 * @returns an object of location ids (this is location + 1 though idk it's weird) that have an object of item ids to on hand quantity
 *
 * The important part is the { itemId: quantity }
 *
 * Ex: "62f3f0f49a5a5410ce5ff1b3": 49,
 */
const getSkuLabsOnHandLocationMap = async () => {
  try {
    const response = await axios.post(
      "https://api.skulabs.com/inventory/get_on_hand_location_map",
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.SKU_LAB_TOKEN}`,
        },
      }
    );
    // console.debug("response.data:", response.data);

    return response.data;
  } catch (error) {
    console.error(
      `${getTimestamp()} [getSkuLabsInventory]: Error fetching SKU Labs inventory:`,
      error
    );
    throw error;
  }
};

/**
 * Takes items from getSkuLabsInventory and maps SKU to the Item ID
 * @param {*} items
 * @returns object of SKU to SKU Lab Item ID
 *
 * Ex: "CC-TT-15-Y-BKGR-STR": "64dba4d9e2fdac0ad371b465"
 */
const mapSKUToID = (items) => {
  const skuToIDMap = {};
  items.forEach((item) => {
    skuToIDMap[item.sku] = item._id;
  });
  return skuToIDMap;
};

/**
 * Takes SKU and ID from mapSKUToID and maps SKU to items on hand
 * @param {*} skuToIDMap
 * @param {*} itemsOnHand
 * @returns object of SKU : ItemsOnHand
 *
 * Ex:
 *
 * Items On Hand: "62f3f0f49a5a5410ce5ff1b3": 49,
 *
 * SKUtoIDMap: "CC-CN-15-L-BKGR-STR":"62f3f0f49a5a5410ce5ff1b3"
 *
 * Output: "CC-CN-15-L-BKGR-STR": 49
 */
const linkSKUToItemsOnHand = (skuToIDMap, itemsOnHand) => {
  const skuToItemsOnHand = {};
  for (const [sku, id] of Object.entries(skuToIDMap)) {
    if (itemsOnHand["62f0fcc0fc3f4e916f865d71"][id]) {
      skuToItemsOnHand[sku] = itemsOnHand["62f0fcc0fc3f4e916f865d71"][id];
    }
  }
  return skuToItemsOnHand;
};

/**
 * There are some SKUs that weren't able to be matched fromr Products table to SKU Labs
 * This is because they haven't been added to SKU Labs yet.
 * @param {*} skus
 * @param {*} skuToIDMap
 * @returns
 */
const findMissingSKUs = (skus, skuToIDMap) => {
  const missingSKUs = skus.filter((sku) => !skuToIDMap.hasOwnProperty(sku));
  return missingSKUs;
};

const updateQuantities = async () => {
  try {
    // 1. Get All Distinct SKU Lab SKUs from AdminPanel
    console.info(
      `${getTimestamp()} Getting distinct SKU Lab SKUs from Products table`
    );
    const { data: distinctSKULabSkus, error } = await supabase.rpc(
      "get_distinct_sku_lab_skus"
    );

    if (error) throw error;

    const skus = distinctSKULabSkus.map((item) => item["skulabs SKU"]);

    // 2. Fetch SKU details from SKU Labs
    const batchSize = 300;
    let allItems = [];
    console.info(`${getTimestamp()} Getting all items from SKU Labs...`);
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const items = await getSkuLabsInventory(batch);
      allItems = allItems.concat(items);
      // Have an await to not get dinged by SKU Labs
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.info(`${getTimestamp()} Finished getting all items from SKU Labs.`);
    // 3. Map SKUs to their corresponding _id
    console.info(
      `${getTimestamp()} Mapping Products_SKU_Lab_SKUs to SKUs from SKU Labs.`
    );
    const skuToIDMap = mapSKUToID(allItems);
    const missingSKUs = findMissingSKUs(skus, skuToIDMap);
    console.info(
      `${getTimestamp()} Getting On Hand Quantity for all items from SKU Labs.`
    );
    const itemsOnHand = await getSkuLabsOnHandLocationMap();

    // 4. Link SKU to items on hand
    console.info(
      `${getTimestamp()} Linking Products_SKU_Lab_SKUs to updated quantity of items on hand.`
    );
    const skuToItemsOnHand = linkSKUToItemsOnHand(skuToIDMap, itemsOnHand);

    console.info(
      `${getTimestamp()} Updating Products table with new quantity.`
    );
    // 5. Update the product table (adjust the logic based on your database)
    const updateResults = [];
    let totalCount = 0;
    let goodCount = 0;
    let failedCount = 0;

    for (const [sku, quantities] of Object.entries(skuToItemsOnHand)) {
      totalCount++;

      // Fetch the old quantity before updating
      const { data: currentProduct, error: fetchError } = await supabase
        .from("Products_duplicate_20240625") // Replace with your actual table name
        .select("quantity")
        .eq("skulabs SKU", sku)
        .limit(1)
        .single();
      // .single();

      if (fetchError) {
        console.error(
          `${getTimestamp()} Error fetching SKU ${sku}:`,
          fetchError
        );
        updateResults.push({
          sku,
          error: fetchError.message,
          oldQuantity: null,
          newQuantity: quantities,
        });
        failedCount++;
        continue;
      }

      const oldQuantity = currentProduct ? currentProduct.quantity : 0;

      // Update your database with the quantities for each SKU
      const { data, error } = await supabase
        .from("Products_duplicate_20240625")
        .update({ quantity: quantities })
        .eq("skulabs SKU", sku);

      if (error) {
        console.error(`${getTimestamp()} Error updating SKU ${sku}:`, error);
        updateResults.push({
          sku,
          oldQuantity,
          newQuantity: quantities,
          error: error.message,
        });
        failedCount++;
      } else {
        console.info(
          `${getTimestamp()} Updated SKU ${sku} with quantities: ${quantities} from ${oldQuantity}`
        );
        updateResults.push({
          sku,
          oldQuantity,
          newQuantity: quantities,
          data,
        });
        goodCount++;
      }
    }
    const recordCount = {
      totalCount,
      goodCount,
      failedCount,
    };
    updateResults.unshift(recordCount);
    updateResults.push({ missingSKUs });
    // console.debug("Update Results:", JSON.stringify(updateResults, null, 2));
    writeReportToFile(updateResults);

    return updateResults;
  } catch (error) {
    console.error(`${getTimestamp()} Error ${JSON.stringify(error)}`);
  }
};

updateQuantities();
