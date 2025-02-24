const { DateTime } = require("luxon");

// Define shipping zone states
const STATE_2_DAY = ["CA", "NV", "UT", "AZ"];

const STATE_3_DAY = ["OR", "WA", "ID", "MT", "WY", "CO", "NM", "TX", "OK"];

const STATE_4_DAY = [
  "ND",
  "SD",
  "NE",
  "KS",
  "MN",
  "IA",
  "MO",
  "AR",
  "LA",
  "MI",
  "WI",
  "IL",
  "MS",
  "IN",
  "OH",
  "KY",
  "TN",
  "AL",
  "FL",
  "GA",
  "SC",
  "NC",
  "VA",
  "WV",
  "PA",
  "DE",
  "MD",
  "NJ",
];

const STATE_5_DAY = ["NY", "CT", "RI", "MA", "NH", "VT", "ME", "HI"];

const STATE_7_DAY = ["AK"];

// Define shipping zones based on states and their delivery times
const SHIPPING_ZONES = [
  {
    states: STATE_2_DAY,
    daysToAdd: 2,
    timezone: "America/Los_Angeles",
  },
  {
    states: STATE_3_DAY,
    daysToAdd: 3,
    timezone: "America/Denver",
  },
  {
    states: STATE_4_DAY,
    daysToAdd: 4,
    timezone: "America/Chicago",
  },
  {
    states: STATE_5_DAY,
    daysToAdd: 5,
    timezone: "America/New_York",
  },
  {
    states: STATE_7_DAY,
    daysToAdd: 7,
    timezone: "America/Anchorage",
  },
];

const getClientTimeZone = () => {
  const timeZoneOffset = new Date().getTimezoneOffset();
  const clientTimeZone = DateTime.local().zoneName;
  // Timezone offset in minutes for PST, MST, CST, EST
  const PST = 480; // UTC -8
  const MST = 420; // UTC -7
  const CST = 360; // UTC -6
  const EST = 300; // UTC -5

  if (timeZoneOffset === PST) {
    return "America/Los_Angeles";
  } else if (timeZoneOffset === MST) {
    return "America/Denver";
  } else if (timeZoneOffset === CST) {
    return "America/Chicago";
  } else if (timeZoneOffset === EST) {
    return "America/New_York";
  } else {
    return clientTimeZone || "UTC";
  }
};

// Helper function to convert timezone to state
const getDefaultStateFromTimezone = (timezone) => {
  const timezoneStateMap = {
    "America/Los_Angeles": "CA",
    "America/Denver": "CO",
    "America/Chicago": "IL",
    "America/New_York": "NY",
    "America/Anchorage": "AK",
  };

  return timezoneStateMap[timezone] || "NY";
};

const DEFAULT_DELIVERY_DAYS = 5;
const CUTOFF_HOUR = 11; // 11 AM
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const determineDeliveryByDateByShippingState = (
  shippingState = "NY",
  format = "LLL dd",
  preorderDate,
  warehouseTimezone = DEFAULT_TIMEZONE
) => {
  const effectiveState = shippingState
    ? shippingState.toUpperCase()
    : getDefaultStateFromTimezone(getClientTimeZone());

  const shippingZone = SHIPPING_ZONES.find((zone) =>
    zone.states.includes(effectiveState)
  );

  const warehouseNow = preorderDate
    ? DateTime.fromISO(preorderDate).setZone(warehouseTimezone)
    : DateTime.now().setZone(warehouseTimezone);

  const shippingDaysToAdd = getShippingDaysToAdd(warehouseNow);

  const shippingDate = warehouseNow.plus({ days: shippingDaysToAdd });

  const totalDaysToAdd = shippingZone?.daysToAdd ?? DEFAULT_DELIVERY_DAYS;

  let deliveryDate = shippingDate;
  let remainingDays = totalDaysToAdd;

  while (remainingDays > 0) {
    deliveryDate = deliveryDate.plus({ days: 1 });
    if (isBusinessDay(deliveryDate)) {
      remainingDays--;
    }
  }

  const destinationTimezone = shippingZone?.timezone || "America/New_York";
  return deliveryDate.setZone(destinationTimezone).toFormat(format);
};

// Helper function to check if a date is a business day
const isBusinessDay = (date) => {
  return date.weekday >= 1 && date.weekday <= 5;
};

// Helper function to validate state code
const isValidStateCode = (stateCode) => {
  return SHIPPING_ZONES.some((zone) =>
    zone.states.includes(stateCode.toUpperCase())
  );
};

// Helper function to get shipping zone info for a state
const getShippingZoneInfo = (stateCode) => {
  return SHIPPING_ZONES.find((zone) =>
    zone.states.includes(stateCode.toUpperCase())
  );
};

const determineDeliveryByDate = (format = "LLL dd", preorder_date) => {
  const clientTimeZone = getClientTimeZone();
  let now = DateTime.now().setZone(clientTimeZone);
  let daysToAdd;

  if (preorder_date) {
    now = DateTime.fromISO(preorder_date).setZone(clientTimeZone);
  }

  const shippingDaysToAdd = getShippingDaysToAdd(now);

  switch (clientTimeZone) {
    case "America/Los_Angeles": // PST
      daysToAdd = 2;
      break;
    case "America/Denver": // MST
      daysToAdd = 3;
      break;
    case "America/Chicago": // CST
      daysToAdd = 4;
      break;
    case "America/New_York": // EST
      daysToAdd = 4;
      break;
    case "Unknown":
      daysToAdd = 5;
      break;
    default:
      daysToAdd = 5;
  }

  let deliveryDate = now.plus({ days: shippingDaysToAdd });
  let remainingDays = daysToAdd;

  while (remainingDays > 0) {
    deliveryDate = deliveryDate.plus({ days: 1 });
    if (isBusinessDay(deliveryDate)) {
      remainingDays--;
    }
  }

  return deliveryDate.toFormat(format);
};

const checkTimeDifference = (date) => {
  const targetDate = DateTime.fromISO(date);
  const now = DateTime.now();

  const diffInWeeks = Math.abs(now.diff(targetDate, "weeks").weeks);
  const diffInMonths = Math.abs(now.diff(targetDate, "months").months);

  if (diffInWeeks <= 1) {
    return "1 week";
  } else if (diffInWeeks > 1 && diffInWeeks <= 4) {
    return `${Math.round(diffInWeeks)} weeks`;
  } else if (diffInMonths <= 1) {
    return "1 month";
  } else {
    return `${Math.round(diffInMonths)} months`;
  }
};

const getShippingDaysToAdd = (dateTime) => {
  const dayOfWeek = dateTime.weekday;
  const hour = dateTime.hour;

  if (dayOfWeek === 1) {
    return 1;
  }

  if (dayOfWeek === 6 && hour >= CUTOFF_HOUR) {
    return 2;
  }

  if (dayOfWeek === 7) {
    return 1;
  }

  if (hour < CUTOFF_HOUR) {
    return 0;
  }

  return 1;
};

const determineShippingDate = (orderDateStr) => {
  // If orderDateStr is provided, use it as the base date, otherwise use current time
  const currentDate = orderDateStr
    ? DateTime.fromISO(orderDateStr).setZone("America/Los_Angeles")
    : DateTime.now().setZone("America/Los_Angeles");

  const daysToAdd = getShippingDaysToAdd(currentDate);
  let shippingDate = currentDate.plus({ days: daysToAdd });

  if (shippingDate.weekday === 7) {
    shippingDate = shippingDate.plus({ days: 1 });
  }

  shippingDate = shippingDate.set({ hour: 11, minute: 0, second: 0 });

  return shippingDate.toISO();
};

const determineLatestShippingDate = (cartItems, orderDate) => {
  if (cartItems.length === 0) return null;

  const shippingDates = cartItems
    .map((cartItem) => {
      if (!cartItem?.preorder) {
        return determineShippingDate(orderDate);
      } else if (cartItem?.preorder_date) {
        return DateTime.fromISO(cartItem.preorder_date)
          .setZone("America/Los_Angeles")
          .set({ hour: 11, minute: 0, second: 0 })
          .toISO();
      }
      return null;
    })
    .filter((date) => !!date);

  if (shippingDates.length === 0) return null;

  const latestDate = shippingDates
    .map((date) => DateTime.fromISO(date))
    .filter((dt) => dt.isValid)
    .reduce(
      (max, dt) => (dt > max ? dt : max),
      DateTime.fromISO(shippingDates[0])
    );

  return latestDate.toISO();
};

module.exports = {
  getClientTimeZone,
  determineDeliveryByDateByShippingState,
  isValidStateCode,
  getShippingZoneInfo,
  determineDeliveryByDate,
  checkTimeDifference,
  determineShippingDate,
  determineLatestShippingDate,
};
