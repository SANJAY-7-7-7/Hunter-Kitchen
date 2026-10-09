import { postgresDb } from '../src/server/db/postgres';

async function resetReviews() {
  console.log('🔄 Connecting to PostgreSQL database...');
  
  try {
    await postgresDb.initialize();
    console.log('✅ Connected and initialized PostgreSQL connection pool.');

    await postgresDb.transaction(async (client) => {
      // 1. Get initial count
      const countRes = await client.query('SELECT COUNT(*) AS count FROM reviews');
      const totalReviews = parseInt(countRes.rows[0].count, 10);
      console.log(`📊 Found ${totalReviews} review(s) in the database.`);

      // 2. Delete all reviews
      const deleteRes = await client.query('DELETE FROM reviews');
      console.log(`🗑️  Deleted ${deleteRes.rowCount} review record(s) from 'reviews' table.`);

      // 3. Reset orders has_been_reviewed flag
      const ordersRes = await client.query('UPDATE orders SET has_been_reviewed = FALSE WHERE has_been_reviewed = TRUE');
      console.log(`🔄 Reset has_been_reviewed flag on ${ordersRes.rowCount} order(s).`);

      // 4. Reset menu items rating count
      const menuRes = await client.query('UPDATE menu_items SET rating = 5.00, rating_count = 0 WHERE rating_count > 0');
      console.log(`⭐ Reset rating counts on ${menuRes.rowCount} menu item(s) to 5.00 (0 count).`);
    });

    console.log('\n✨ All feedbacks and reviews have been successfully wiped and reset to a clean state!');
  } catch (error) {
    console.error('❌ Error resetting reviews and feedbacks:', error);
    process.exit(1);
  } finally {
    await postgresDb.close();
    process.exit(0);
  }
}

resetReviews();
