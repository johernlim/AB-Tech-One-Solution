export const productAliasSchema = "CREATE TABLE IF NOT EXISTS product_id_aliases (category_slug TEXT NOT NULL,old_id TEXT NOT NULL,new_id TEXT NOT NULL,category_names TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','active')),PRIMARY KEY(category_slug,old_id))";
export const productAliasIndexSchema = 'CREATE INDEX IF NOT EXISTS product_id_alias_lookup ON product_id_aliases(old_id,state)';
export async function identityDatabase(env) {
  const db = env.STAFF_DB.withSession ? env.STAFF_DB.withSession('first-primary') : env.STAFF_DB;
  await db.prepare(productAliasSchema).run();
  await db.prepare(productAliasIndexSchema).run();
  return db;
}
export async function reservedProductId(env, slug, ids) {
  if (!ids.length) return null;
  const db=await identityDatabase(env);
  const row=await db.prepare("SELECT old_id FROM product_id_aliases WHERE category_slug=? AND state='active' AND old_id<>new_id AND old_id IN (SELECT value FROM json_each(?)) LIMIT 1").bind(slug,JSON.stringify(ids)).first();
  return row?.old_id || null;
}
// Run inside the same D1 batch as activation. JSON stays private and versions invalidate stale tabs.
const normalizedItemsSQL = input => `SELECT json_group_array(json_object('id',resolved_id,'category',category,'quantity',MIN(quantity,999))) FROM (
    SELECT COALESCE((SELECT a.new_id FROM product_id_aliases a WHERE a.state='active' AND a.old_id=json_extract(j.value,'$.id') AND EXISTS(SELECT 1 FROM json_each(a.category_names) n WHERE n.value=json_extract(j.value,'$.category')) LIMIT 1),json_extract(j.value,'$.id')) AS resolved_id,
      json_extract(j.value,'$.category') AS category,SUM(json_extract(j.value,'$.quantity')) AS quantity
    FROM json_each(${input}) j GROUP BY resolved_id,category
  )`;
export async function saveCartWithProductIds(db, userId, items, version) {
  return db.prepare(`UPDATE customer_users SET cart_json=(${normalizedItemsSQL('?')}),cart_version=cart_version+1 WHERE id=? AND cart_version=? RETURNING cart_json,cart_version`).bind(JSON.stringify(items),userId,version).first();
}
const migrateCartsSQL = `UPDATE customer_users SET cart_json=(${normalizedItemsSQL('customer_users.cart_json')}),cart_version=cart_version+1 WHERE EXISTS(
  SELECT 1 FROM json_each(customer_users.cart_json) j JOIN product_id_aliases a ON a.old_id=json_extract(j.value,'$.id')
  WHERE a.state='active' AND a.old_id<>a.new_id AND EXISTS(SELECT 1 FROM json_each(a.category_names) n WHERE n.value=json_extract(j.value,'$.category'))
)`;
export async function activateProductAlias(env, category, from, to) {
  const db = await identityDatabase(env);
  const names = JSON.stringify([...new Set([category.name,...(category.aliases || [])])]);
  const statements = [
    db.prepare("UPDATE product_id_aliases SET new_id=?,category_names=? WHERE category_slug=? AND new_id=? AND state='active'").bind(to,names,category.slug,from),
    db.prepare("UPDATE product_id_aliases SET state='active',category_names=? WHERE category_slug=? AND old_id=? AND new_id=?").bind(names,category.slug,from,to)
  ];
  if (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_users'").first()) statements.push(db.prepare(migrateCartsSQL));
  await db.batch(statements);
}

// A failed activation after a successful Git publish can be recovered by the next staff product load.
export async function reconcileProductAliases(env, category, products) {
  const db = await identityDatabase(env);
  await db.prepare('UPDATE product_id_aliases SET category_names=? WHERE category_slug=?').bind(JSON.stringify([category.name,...(category.aliases || [])]),category.slug).run();
  const pending = (await db.prepare("SELECT old_id,new_id FROM product_id_aliases WHERE category_slug=? AND state='pending'").bind(category.slug).all()).results;
  for (const alias of pending) {
    const current = products.find(product => product.id === alias.new_id && (product.id_aliases || []).includes(alias.old_id));
    if (current) await activateProductAlias(env,category,alias.old_id,alias.new_id);
  }
}
