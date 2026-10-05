import {readCategories} from './categories.mjs';
import {applyCategoryOrder} from '../category-order.js';

async function orderDatabase(env) {
  if (!env.STAFF_DB) throw new Error('Category order storage is unavailable.');
  // Primary reads guarantee that a refresh sees the last completed save even with D1 read replication.
  const db = env.STAFF_DB.withSession ? env.STAFF_DB.withSession('first-primary') : env.STAFF_DB;
  await db.prepare('CREATE TABLE IF NOT EXISTS category_order (id INTEGER PRIMARY KEY CHECK(id=1), order_json TEXT NOT NULL, version INTEGER NOT NULL)').run();
  return db;
}

export async function readCategoryOrder(env) {
  const db = await orderDatabase(env);
  const row = await db.prepare('SELECT order_json,version FROM category_order WHERE id=1').first();
  return {order:row ? JSON.parse(row.order_json) : [], orderVersion:row?.version ?? 0};
}

export async function readOrderedCategories(env) {
  const [registry, saved] = await Promise.all([readCategories(env), readCategoryOrder(env)]);
  return {...registry, categories:applyCategoryOrder(registry.categories, saved.order), orderVersion:saved.orderVersion};
}

export async function saveCategoryOrder(env, data) {
  const json = (value, status=200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
  if (!/^[a-f0-9]{40}$/.test(data.sha || '') || !Number.isSafeInteger(data.orderVersion) || data.orderVersion < 0) return json({error:'Reload categories before saving the order.'},400);
  const registry = await readCategories(env);
  if (registry.sha !== data.sha) return json({error:'Categories changed. Reload the list and try again.'},409);
  const {order} = data, {categories} = registry;
  if (!Array.isArray(order) || order.length !== categories.length || new Set(order).size !== categories.length || order.some(slug => typeof slug !== 'string' || !categories.some(category => category.slug === slug))) return json({error:'Include every category exactly once when changing the order.'},400);
  const db = await orderDatabase(env);
  const row = await db.prepare('INSERT INTO category_order (id,order_json,version) SELECT 1,?,1 WHERE ?=0 OR EXISTS(SELECT 1 FROM category_order WHERE id=1) ON CONFLICT(id) DO UPDATE SET order_json=excluded.order_json,version=category_order.version+1 WHERE category_order.version=? RETURNING version').bind(JSON.stringify(order),data.orderVersion,data.orderVersion).first();
  if (!row) return json({error:'Category order changed. Reload the list and try again.'},409);
  return json({...registry, categories:applyCategoryOrder(categories,order), orderVersion:row.version, message:'Refresh the homepage to see the new order immediately.'});
}

export async function publicCategoryOrder(request, env) {
  const headers = {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
  if (request.method !== 'GET') return Response.json({error:'Method not allowed.'},{status:405,headers});
  try {const {order} = await readCategoryOrder(env); return Response.json({order},{headers});}
  catch {return Response.json({error:'Category order is temporarily unavailable.'},{status:503,headers});}
}
