import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Toast, Frame, Modal, FormLayout, TextField, Select, Banner
} from "@shopify/polaris";
import { useState, useEffect } from "react";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  console.log("🚨 SPARK DEBUG [app.tsx loader]: Loading API Key..."); // Log server-side
  
  // Get API key, shop and host from URL for better App Bridge initialization
  const url = new URL(request.url);
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const shop = url.searchParams.get("shop") || "";
  const host = url.searchParams.get("host") || "";
  
  console.log(`🚨 SPARK DEBUG [app.tsx loader]: API Key value: "${apiKey}"`); // Log the actual value
  console.log(`🚨 SPARK DEBUG [app.tsx loader]: Shop: "${shop}", Host: "${host}"`);
  
  return json({ apiKey, shop, host });
};

export default function App() {
  const { apiKey, shop, host } = useLoaderData<typeof loader>();
  const [shopifyAppBridgeReady, setShopifyAppBridgeReady] = useState(false);
  
  console.log(`🚨 SPARK DEBUG [app.tsx component]: API Key received by component: "${apiKey}"`);
  console.log(`🚨 SPARK DEBUG [app.tsx component]: Shop: "${shop}", Host: "${host}"`);

  // Listen for Shopify App Bridge initialization
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleAppBridgeReady = () => {
        console.log("🚨 SPARK DEBUG: App Bridge is ready!");
        setShopifyAppBridgeReady(true);
      };
      
      window.addEventListener('shopify:app-bridge-ready', handleAppBridgeReady);
      
      return () => {
        window.removeEventListener('shopify:app-bridge-ready', handleAppBridgeReady);
      };
    }
  }, []);

  return (
    <AppProvider 
      isEmbeddedApp 
      apiKey={apiKey}
    >
      <Frame>
        <NavMenu>
          <Link to="/app" rel="home">
            Home
          </Link>
          <Link to="/app/warranties">
            Warranty Definitions
          </Link>
          <Link to="/app/testpicker">
            Test Product Picker
          </Link>
        </NavMenu>
        <Outlet />
        
        {/* Debug indicator - visible only in development */}
        {process.env.NODE_ENV !== 'production' && (
          <div style={{ 
            position: 'fixed', 
            bottom: '8px', 
            right: '8px', 
            background: shopifyAppBridgeReady ? 'green' : 'red',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            opacity: 0.7,
            zIndex: 9999
          }}>
            App Bridge: {shopifyAppBridgeReady ? 'Ready' : 'Not Ready'}
          </div>
        )}
      </Frame>
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
