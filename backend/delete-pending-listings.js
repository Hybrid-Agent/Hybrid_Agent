require("dotenv").config();
const db = require("./src/config/filebaseDB");

async function run() {
  const RECORDS = "db/listings/records/";
  const BY_CREATOR = "db/listings/by-creator/";
  const BY_REF = "db/listings/by-ref/";

  console.log("Fetching listings...");
  const keys = await db.listKeys(RECORDS);
  
  let deleted = 0;
  for (const key of keys) {
    const listing = await db.get(key);
    if (listing && listing.status === "pending") {
      console.log(`Deleting pending listing: ${listing.id} - ${listing.title}`);
      await db.del(key);
      if (listing.created_by) {
        await db.del(`${BY_CREATOR}${listing.created_by}/${listing.id}.json`);
      }
      if (listing.listing_ref) {
        await db.del(`${BY_REF}${encodeURIComponent(listing.listing_ref)}.json`);
      }
      deleted++;
    }
  }
  
  console.log(`Successfully deleted ${deleted} pending listings.`);
}

run().catch(console.error);
