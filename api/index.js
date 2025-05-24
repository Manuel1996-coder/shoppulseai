// Moderne Shopify App mit Template-Features - Vercel-optimiert
import { shopifyApp } from '@shopify/shopify-app-express';
import { LATEST_API_VERSION } from '@shopify/shopify-api';
import { kv } from '@vercel/kv';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Vercel KV Session Storage für robuste Session-Verwaltung
class VercelKVSessionStorage {
  async storeSession(session) {
    try {
      const key = `session:${session.id}`;
      await kv.set(key, JSON.stringify(session), { ex: 86400 }); // 24h TTL
      console.log(`✅ Session gespeichert: ${session.id}`);
      return true;
    } catch (error) {
      console.error('❌ Session speichern fehlgeschlagen:', error);
      return false;
    }
  }

  async loadSession(id) {
    try {
      const key = `session:${id}`;
      const data = await kv.get(key);
      if (data) {
        console.log(`✅ Session geladen: ${id}`);
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
      console.log(`⚠️ Session nicht gefunden: ${id}`);
      return undefined;
    } catch (error) {
      console.error('❌ Session laden fehlgeschlagen:', error);
      return undefined;
    }
  }

  async deleteSession(id) {
    try {
      const key = `session:${id}`;
      await kv.del(key);
      console.log(`✅ Session gelöscht: ${id}`);
      return true;
    } catch (error) {
      console.error('❌ Session löschen fehlgeschlagen:', error);
      return false;
    }
  }

  async deleteSessions(ids) {
    try {
      const keys = ids.map(id => `session:${id}`);
      if (keys.length > 0) {
        await kv.del(...keys);
        console.log(`✅ ${keys.length} Sessions gelöscht`);
      }
      return true;
    } catch (error) {
      console.error('❌ Sessions löschen fehlgeschlagen:', error);
      return false;
    }
  }

  async findSessionsByShop(shop) {
    try {
      // KV hat keine pattern matching, fallback zu simpler Implementierung
      return [];
    } catch (error) {
      console.error('❌ Sessions suchen fehlgeschlagen:', error);
      return [];
    }
  }
}

// Shopify App Konfiguration mit modernem SDK
const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: undefined,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new VercelKVSessionStorage(),
  useOnlineTokens: false, // Offline tokens for background operations
});

const app = express();

// Middleware Setup
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['X-CSRF-Token', 'X-Requested-With', 'Accept', 'Accept-Version', 'Content-Length', 'Content-MD5', 'Content-Type', 'Date', 'X-Api-Version', 'Authorization'],
  exposedHeaders: ['Set-Cookie']
}));

app.use(express.json());

// Statische Dateien aus public
app.use(express.static(path.join(__dirname, '../public')));

// Shopify OAuth Routes (modernisiert)
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    // Nach erfolgreicher Auth zur Dashboard weiterleiten
    const shop = res.locals.shopify.session.shop;
    const host = req.query.host;
    
    console.log(`✅ OAuth erfolgreich für Shop: ${shop}`);
    
    // App URL für Shopify Admin
    const redirectUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Redirecting...</title>
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body>
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            if (window.top === window) {
              window.location.href = '${redirectUrl}';
            } else {
              try {
                if (window.ShopifyApp && window.ShopifyApp.redirect) {
                  window.ShopifyApp.redirect.dispatch(window.ShopifyApp.redirect.Action.APP, '/');
                } else {
                  window.parent.location.href = '${redirectUrl}';
                }
              } catch (e) {
                window.top.location.href = '${redirectUrl}';
              }
            }
          });
        </script>
        <div style="text-align: center; padding: 50px; font-family: sans-serif;">
          <h2>Redirecting to your Shopify App...</h2>
          <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
        </div>
      </body>
      </html>
    `);
  }
);

// Webhook Handler (modernisiert)
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers: {
      PRODUCTS_CREATE: {
        deliveryMethod: 'http',
        callbackUrl: '/api/webhooks',
        callback: async (topic, shop, body, webhookId) => {
          console.log(`📦 Neues Produkt erstellt in ${shop}:`, JSON.parse(body).id);
        },
      },
      ORDERS_CREATE: {
        deliveryMethod: 'http',
        callbackUrl: '/api/webhooks',
        callback: async (topic, shop, body, webhookId) => {
          console.log(`🛍️ Neue Bestellung in ${shop}:`, JSON.parse(body).id);
        },
      },
      CUSTOMERS_DATA_REQUEST: {
        deliveryMethod: 'http',
        callbackUrl: '/api/webhooks',
        callback: async (topic, shop, body, webhookId) => {
          console.log(`🔒 GDPR Data Request für ${shop}`);
          // GDPR compliance handling
        },
      },
      CUSTOMERS_REDACT: {
        deliveryMethod: 'http',
        callbackUrl: '/api/webhooks',
        callback: async (topic, shop, body, webhookId) => {
          console.log(`🔒 GDPR Data Deletion für ${shop}`);
          // GDPR compliance handling
        },
      },
      SHOP_REDACT: {
        deliveryMethod: 'http',
        callbackUrl: '/api/webhooks',
        callback: async (topic, shop, body, webhookId) => {
          console.log(`🔒 Shop uninstalled: ${shop}`);
          // Cleanup app data
        },
      },
    },
  })
);

// Authentifizierung für API-Routen
app.use("/api/*", shopify.validateAuthenticatedSession());

// API: Shopify API Key abrufen
app.get('/api/shopify/api-key', (req, res) => {
  res.json({ apiKey: process.env.SHOPIFY_API_KEY });
});

// API: Shop KPIs (modernisiert mit GraphQL)
app.get('/api/shop-kpis', async (req, res) => {
  try {
    console.log('📊 KPI-Abruf gestartet - Moderne GraphQL API');
    
    const session = res.locals.shopify.session;
    if (!session) {
      return res.status(401).json({ error: 'No authenticated session found' });
    }

    const client = new shopify.api.clients.Graphql({
      session,
    });

    try {
      // GraphQL Query für Shop-Daten und KPIs
      const shopQuery = `
        query ShopKPIs {
          shop {
            id
            name
            email
            myshopifyDomain
            createdAt
            currencyCode
          }
          orders(first: 50, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                processedAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          products(first: 10) {
            edges {
              node {
                id
                title
                featuredImage {
                  url
                }
                variants(first: 1) {
                  edges {
                    node {
                      price
                      inventoryQuantity
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await client.request(shopQuery);
      const data = response.data;

      // Daten verarbeiten
      const shop = data.shop;
      const orders = data.orders.edges.map(edge => edge.node);
      const products = data.products.edges.map(edge => edge.node);

      // Datum-Filter für KPIs
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const lastWeekDate = new Date(now);
      lastWeekDate.setDate(now.getDate() - 7);

      const ordersToday = orders.filter(order => {
        const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
        return orderDate === todayStr;
      });

      const ordersThisWeek = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= lastWeekDate;
      });

      // Umsatz berechnen
      const calculateRevenue = (orderList) => {
        return orderList.reduce((sum, order) => {
          const amount = parseFloat(order.totalPriceSet.shopMoney.amount || 0);
          return sum + amount;
        }, 0);
      };

      // Top-Produkte aufbereiten
      const topProducts = products.map(product => ({
        id: product.id,
        title: product.title,
        inventory: product.variants.edges[0]?.node.inventoryQuantity || 0,
        image: product.featuredImage?.url || 'https://placehold.co/100x100',
        price: product.variants.edges[0]?.node.price || '0.00'
      }));

      // KPIs zusammenstellen
      const kpis = {
        shop: {
          name: shop.name,
          email: shop.email,
          domain: shop.myshopifyDomain,
          created_at: shop.createdAt,
          currency: shop.currencyCode
        },
        orders: {
          today: ordersToday.length,
          thisWeek: ordersThisWeek.length,
          thisMonth: orders.length,
          total: orders.length // Simplified for demo
        },
        revenue: {
          today: calculateRevenue(ordersToday).toFixed(2),
          thisWeek: calculateRevenue(ordersThisWeek).toFixed(2),
          thisMonth: calculateRevenue(orders).toFixed(2),
          total: calculateRevenue(orders).toFixed(2)
        },
        topProducts,
        debug: {
          apiVersion: LATEST_API_VERSION,
          ordersLoaded: orders.length,
          sessionId: session.id,
          shop: session.shop,
          isRealData: true,
          graphqlUsed: true
        }
      };

      console.log('✅ KPIs erfolgreich generiert (GraphQL API)');
      res.json(kpis);

    } catch (apiError) {
      console.error('❌ GraphQL API-Fehler:', apiError.message);
      res.status(500).json({ 
        error: 'Failed to fetch shop KPIs via GraphQL',
        message: apiError.message
      });
    }
  } catch (outerError) {
    console.error('❌ Unerwarteter Fehler:', outerError.message);
    res.status(500).json({
      error: 'Unexpected server error',
      message: outerError.message
    });
  }
});

// API: Shopify Test (modernisiert)
app.get('/api/test-shopify', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    if (!session) {
      return res.status(401).json({ error: 'No authenticated session found' });
    }

    const client = new shopify.api.clients.Graphql({
      session,
    });

    const testQuery = `
      query {
        shop {
          name
          email
          myshopifyDomain
        }
      }
    `;

    const response = await client.request(testQuery);
    
    res.json({
      success: true,
      shop: response.data.shop,
      apiVersion: LATEST_API_VERSION,
      sessionId: session.id,
      message: 'Moderne Shopify GraphQL API funktioniert!'
    });

  } catch (error) {
    console.error('API-Test Fehler:', error);
    res.status(500).json({
      error: 'Shopify API Test failed',
      message: error.message
    });
  }
});

// Statische Routen OHNE Shopify Middleware
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/embedded', (req, res) => {
  console.log('📱 /embedded route called with query:', req.query);
  res.sendFile(path.join(__dirname, '../public/embedded.html'));
});

// Root Route mit Shopify Entry Point (MIT Middleware nur wenn shop Parameter da ist)
app.get('/', async (req, res) => {
  const { shop, host, embedded, hmac } = req.query;
  
  console.log('🏠 Root route called with params:', { shop: !!shop, host: !!host, embedded: !!embedded, hmac: !!hmac });
  
  if (shop) {
    // Wenn shop Parameter da ist, Shopify Middleware verwenden
    return shopify.ensureInstalledOnShop()(req, res, () => {
      const params = new URLSearchParams({
        shop,
        ...(host && { host }),
        ...(embedded && { embedded }),
        ...(hmac && { hmac })
      });
      
      console.log('🔀 Redirecting to /embedded with params:', params.toString());
      res.redirect(`/embedded?${params.toString()}`);
    });
  } else {
    // Ohne shop Parameter direkt zu embedded
    console.log('🔀 No shop param, redirecting to /embedded');
    res.redirect('/embedded');
  }
});

// CSP Headers
app.use(shopify.cspHeaders());

// Nur lokal starten (nicht in Vercel)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server läuft lokal auf http://localhost:${PORT}`);
  });
}

export default app; 