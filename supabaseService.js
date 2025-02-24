const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
dotenv.config();
const ORDERS_TABLE = process.env.ORDERS_TABLE;

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

class SupabaseService {
  constructor() {
    this.supabase = createClient(url, anonKey);
  }

  getBaseProductsQuery(offset = 0, limit = 16000) {
    return this.supabase
      .from(PRODUCTS_TABLE)
      .select(
        "id, sku, type, handle, preorder_true, preorder_discount, preorder_date, variant_barcode, variant_price, variant_compare_to_price, shopify_product_variant_id, shopify_product_id"
      )
      .eq("preorder_true", true)
      .not("handle", "is", null);
  }

  // Helper to execute query with pagination
  async executeQuery(query, offset, limit) {
    // NTS: Had to comment out the pagination because of the way I'm querying the data
    // I would query the data again but it would be offset so I'd be moving the window too much
    const { data, error } = await query.range(offset, offset + 500 - 1);
    // .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data;
  }

  async updateOrdersShipByDate(order_number, ship_by_date) {
    const { data, error } = await this.supabase
      .from(ORDERS_TABLE)
      .update({ ship_by_date })
      .eq("order_id", order_number)
      .select();

    if (error) {
      throw new Error(
        `Error updating product with Order Number ${order_number}, Ship Date ${ship_by_date}: ${error.message}`
      );
    }

    return data;
  }
}

module.exports = SupabaseService;
