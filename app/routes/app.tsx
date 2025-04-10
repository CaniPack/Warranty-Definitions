import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, useFetcher } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Toast, Frame, Modal, FormLayout, TextField, Select, Banner
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  console.log("🚨 SPARK DEBUG [app.tsx loader]: Loading API Key..."); // Log server-side
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  console.log(`🚨 SPARK DEBUG [app.tsx loader]: API Key value: "${apiKey}"`); // Log the actual value
  return { apiKey };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  console.log(`🚨 SPARK DEBUG [app.tsx component]: API Key received by component: "${apiKey}"`);

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/warranties">
          Warranty Definitions
        </Link>
      </NavMenu>
      <Outlet />
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
