require("dotenv").config();
const db = require("./src/config/filebaseDB");

async function run() {
  const records = await db.listKeys("db/listings/records/");
  for (const k of records) {
    const l = await db.get(k);
    console.log(`Listing ${l.id} - ${l.title} - ${l.status}`);
  }
}

run().catch(console.error);
