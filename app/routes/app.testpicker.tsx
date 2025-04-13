import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ResourcePicker } from "@shopify/app-bridge/actions";
import { Page, Button, Text, BlockStack } from "@shopify/polaris";

export default function TestPicker() {
  const [isClient, setIsClient] = useState(false);
  const [appInfo, setAppInfo] = useState<any>(null);
  
  // Solo usar App Bridge en el cliente
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  function handleOpenPicker() {
    if (!isClient) return;
    
    try {
      // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
      const app = useAppBridge();
      console.log("✅ App Bridge object:", app);
      // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
      console.log("✅ dispatch type:", typeof app?.dispatch);
      // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
      console.log("✅ app.constructor.name:", app?.constructor?.name);
      
      setAppInfo({
        // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
        dispatchType: typeof app?.dispatch,
        // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
        constructorName: app?.constructor?.name || "Unknown"
      });
      
      // @ts-ignore - Ignoramos los errores de tipo para diagnóstico
      if (typeof app?.dispatch !== "function") {
        console.error("❌ Error: app.dispatch is not a function!");
        return;
      }
      
      // @ts-ignore - Ignoramos errores de tipo para diagnóstico
      const picker = ResourcePicker.create(app, {
        resourceType: ResourcePicker.ResourceType.Product
      });
      
      // @ts-ignore - Ignoramos errores de tipo para diagnóstico
      picker.subscribe(ResourcePicker.Action.SELECT, (selectPayload) => {
        console.log("Selected products:", selectPayload.selection);
      });
      
      // @ts-ignore - Ignoramos errores de tipo para diagnóstico
      picker.open();
    } catch (error) {
      console.error("❌ Error opening picker:", error);
    }
  }
  
  return (
    <Page title="Test Product Picker">
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Esta página prueba si ResourcePicker funciona correctamente</Text>
        
        <Button onClick={handleOpenPicker} variant="primary">
          Abrir Selector de Productos (Test)
        </Button>
        
        {appInfo && (
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">Información de App Bridge:</Text>
            <Text as="p" variant="bodyMd">dispatch type: <strong>{appInfo.dispatchType}</strong> (debería ser 'function')</Text>
            <Text as="p" variant="bodyMd">constructor name: <strong>{appInfo.constructorName}</strong> (debería ser 'ClientApplication')</Text>
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
} 