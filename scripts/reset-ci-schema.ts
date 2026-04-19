import { neon } from '@neondatabase/serverless';

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
      DROP TABLE IF EXISTS neon_auth.users_sync CASCADE;
  END $$;
  `;

  console.log('Schema reset for clean migration test');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
