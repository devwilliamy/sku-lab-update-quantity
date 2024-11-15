const { DateTime } = require("luxon");
const axios = require("axios");

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const TABLE_NAME = process.env.TABLE_NAME;

function getTimestamp() {
  return DateTime.now().setZone("America/Los_Angeles").toISO();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function getOrdersWithoutTracking() {
  const { data, error } = await supabase
    .from("_Orders")
    .select("*")
    .or("status.eq.COMPLETE,status.eq.COMPLETED")
    .is("shipping_tracking_number", null)
    .gt("created_at_pst", "2024-07-01");

  if (error) {
    console.error("Error fetching orders:", error);
    return null;
  }

  return data;
}

function findFirstShipmentWithResponse(orderData) {
  const shipment = orderData.shipments.find((shipment) => shipment.response);

  if (shipment) {
    const { response, last_tracking_update, tracking_status } = shipment;
    return {
      response,
      lastTrackingUpdate: last_tracking_update,
      trackingStatus: tracking_status,
    };
  }

  return {
    response: null,
    lastTrackingUpdate: null,
    trackingStatus: null,
  };
}

const updateTrackingNumber = async () => {
  //   if (
  //     !webhookData.data ||
  //     !webhookData.data.store_id ||
  //     !webhookData.data.order_number
  //   ) {
  //     return res
  //       .status(500)
  //       .send(
  //         `${getTimestamp()} Webhook Data did not container store id or order number`
  //       );
  //   }

  const ordersWithoutTracking = await getOrdersWithoutTracking();

  //   const { store_id, order_number } = webhookData.data;
  //   const store_id = "6471d3977dc537d10219fad4";
  const store_id = "62f0fcbffc3f4e916f865d6a";
  //   const order_number = "CL-TEST-240607-SE-0062";
  //   const order_number = "CL-240614-CC-0132";
  for (const order of ordersWithoutTracking) {
    const { order_id: order_number } = order;
    // const order_number = 'CL-240823-SE-0022'
    const apiUrl = `https://api.skulabs.com/order/get_single?store_id=${store_id}&order_number=${order_number}`;
    const processWebhook = async () => {
      try {
        // Make the request to the SKU Labs API
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `Bearer ${process.env.SKU_LAB_TOKEN}`,
            Accept: "application/json",
          },
        });
        const orderData = response.data.order;
        console.log(
          `${getTimestamp()} OrderData Shipments:`,
          orderData?.shipments
        );

        if (
          orderData &&
          orderData.shipments &&
          orderData.shipments.length > 0 &&
          order_number.startsWith("CL")
        ) {
          const {
            response: shipment,
            lastTrackingUpdate,
            trackingStatus,
          } = findFirstShipmentWithResponse(orderData);

          const shipping_carrier = shipment?.provider || "";
          const shipping_service = shipment?.service || "";
          const shipping_tracking_number = shipment?.tracking_number || "";
          const shipping_status_last_updated_pst = formatTime(
            lastTrackingUpdate,
            "PST"
          );
          const shipping_status_last_updated = formatTime(lastTrackingUpdate);
          //   const shipping_previous_status =
          //     orderData?.shipments[0]?.tracking_status;
          const shipping_status = trackingStatus;

          const TABLE_NAME = order_number.includes("TEST")
            ? "_Orders_TEST"
            : "_Orders";
          // Update the _Orders table in Supabase
          const { data, error } = await supabase
            .from(TABLE_NAME)
            .update({
              shipping_carrier,
              shipping_service,
              shipping_tracking_number,
              shipping_status_last_updated,
              shipping_status_last_updated_pst,
              //   shipping_previous_status,
              shipping_status,
            })
            .eq("order_id", order_number)
            .select();

          if (error) {
            throw error;
          } else {
            console.log("Updated Data received: ", data);
          }

          console.log(
            `${getTimestamp()} Order updated successfully: ${order_number}`
          );

          // Have to update Stripe and Paypal Tracking Number Here too

          // Respond to the webhook
          // res.status(200).send("Webhook received and processed.");
        } else {
          return {
            message: `${getTimestamp()} No shipments found in the order data: ${order_number}`,
          };
          // throw new Error(
          //   `${getTimestamp()} No shipments found in the order data: ${order_number}`
          // );
        }
        return {
          message: `${getTimestamp()} Order updated successfully: ${order_number}`,
        };
      } catch (error) {
        console.error(
          `${getTimestamp()} Error caught: No shipments found in the order data: ${order_number}`
        );
        console.error(`${getTimestamp()}: Inside catch ${error}`);
        return {
          message: `${getTimestamp()} No shipments found in the order data or does not start with CL: ${order_number}`,
        };
      }
    };
    try {
      await delay(1000);
      await processWebhook();
    } catch (e) {
      console.error(
        `${getTimestamp()} No shipments found in the order data: ${order_number}`
      );
      console.error(`${getTimestamp()}: Outside catch: ${e}`);
      // return res.status(500).send({ message: e.message });
    }
  }
};

// updateTrackingNumber();
module.exports = {
  updateTrackingNumber,
};
