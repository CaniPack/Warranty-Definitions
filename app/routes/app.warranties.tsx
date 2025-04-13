// app/routes/app.warranties.tsx

import { json, LoaderFunctionArgs, ActionFunctionArgs, TypedResponse } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
  useActionData,
  useSubmit,
  useNavigate,
} from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Toast, Frame, Modal, FormLayout, TextField, Select, Banner,
  InlineStack, ButtonGroup, EmptyState, List, Spinner, Icon, Box
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
// Import enums and types from Prisma
import { WarrantyDefinition, WarrantyAssociationType } from "@prisma/client";
// Correctly import useAppBridge from the react package
import { useAppBridge } from '@shopify/app-bridge-react';
// Import ResourcePicker directly from actions
import { ResourcePicker } from '@shopify/app-bridge/actions';
import { FormProvider } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import React from "react";

// --- Helper para obtener App Bridge de manera confiable ---
function getAppBridge() {
  // Estrategia 1: Usar el hook de App Bridge React
  try {
    // @ts-ignore - Ignoramos errores de tipo para diagnóstico
    const appFromHook = useAppBridge();
    
    if (appFromHook && typeof (appFromHook as any).dispatch === 'function') {
      console.log("✅ App Bridge obtenido correctamente usando useAppBridge()", appFromHook);
      return appFromHook;
    }
    
    console.log("⚠️ useAppBridge() devolvió un objeto inválido:", appFromHook);
  } catch (error) {
    console.error("❌ Error al usar useAppBridge():", error);
  }
  
  // Estrategia 2: Intentar obtener desde el contexto global de Shopify
  if (typeof window !== 'undefined' && window.shopify) {
    try {
      // @ts-ignore - window.shopify no tiene tipado definido para app
      const shopifyGlobal = window.shopify;
      
      // Verificar si ya existe una instancia de app
      // @ts-ignore - window.shopify.app no está definido en los tipos
      if (shopifyGlobal.app && typeof shopifyGlobal.app.dispatch === 'function') {
        console.log("✅ App Bridge obtenido del objeto global window.shopify.app");
        // @ts-ignore - window.shopify.app no está definido en los tipos
        return shopifyGlobal.app;
      }
      
      console.log("⚠️ window.shopify existe pero no contiene una app válida");
    } catch (error) {
      console.error("❌ Error al acceder a window.shopify:", error);
    }
  }
  
  // Estrategia 3: Crear una nueva instancia si tenemos createApp disponible
  if (typeof window !== 'undefined' && window.shopify) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shop = urlParams.get('shop');
      const host = urlParams.get('host');
      
      if (!shop) {
        console.log("⚠️ No se encontró parámetro 'shop' en la URL");
        return null;
      }
      
      // En lugar de usar process.env, obtener apiKey de manera segura
      // 1. Intentar obtener de shopify.config si existe
      // @ts-ignore
      let apiKey: string | undefined = window.shopify.config?.apiKey;
      
      // 2. Si no existe, buscar en los datos cargados por Remix
      if (!apiKey) {
        // @ts-ignore
        const remixData = window.__remixContext?.state?.loaderData?.["routes/app"];
        apiKey = remixData?.apiKey;
      }
      
      // 3. Si no existe, usar el API key hardcodeado (último recurso)
      if (!apiKey) {
        apiKey = "34217a05a589a81a31677dc5ebe26c0b";
      }
      
      // @ts-ignore - window.shopify.createApp no está definido en los tipos
      if (apiKey && window.shopify.createApp) {
        const appConfig = {
          apiKey: apiKey,
          host: host || '',
          shopOrigin: shop,
          forceRedirect: true
        };
        
        console.log("✅ Creando nueva instancia de App Bridge con:", appConfig);
        // @ts-ignore - window.shopify.createApp no está definido en los tipos
        const newApp = window.shopify.createApp(appConfig);
        return newApp;
      }
    } catch (error) {
      console.error("❌ Error al crear nueva instancia de App Bridge:", error);
    }
  }
  
  console.error("❌ No se pudo obtener ni crear una instancia de App Bridge");
  return null;
}

// --- Local Type Definitions ---
// No longer needed as PriceType is imported from Prisma
// enum PriceType {
//   FIXED_AMOUNT = 'FIXED_AMOUNT',
//   PERCENTAGE = 'PERCENTAGE',
// }

// --- Type Definitions ---

// Type for data loaded by the loader, including association fields
interface WarrantyDefinitionFromLoader extends Omit<WarrantyDefinition, 'createdAt' | 'updatedAt' | 'associatedProductIds' | 'associatedCollectionIds'> {
  createdAt: string;
  updatedAt: string;
  // Removed priceType and priceValue, using price instead
  associatedProductIds: string[]; // Parsed from JSON string
  associatedCollectionIds: string[]; // Parsed from JSON string
}

interface LoaderData {
  warrantyDefinitions: WarrantyDefinitionFromLoader[];
}

// Action function return types
interface ActionDataSuccess {
  status: 'success';
  message: string;
  definition?: WarrantyDefinitionFromLoader; // Return the updated/created definition
  deletedId?: number;
}

interface ActionDataError {
  status: 'error';
  message: string;
  errors?: Record<string, string>;
  fieldValues?: Record<string, any>;
}

type ActionData = ActionDataSuccess | ActionDataError;

// Type for the form state, including association fields
type WarrantyFormState = {
  name: string;
  durationMonths: string; // Keep as string for input
  price: string; // Use a single price field
  description: string; // Use string, handle null on save
  associationType: WarrantyAssociationType;
};

interface DefinitionFromDb {
  id: number;
  name: string;
  durationMonths: number;
  price: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  associationType: WarrantyAssociationType;
  associatedProductIds: string;
  associatedCollectionIds: string;
};

// Agregamos un schema de validación para el formulario
const warrantySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  duration: z.number().min(1, "La duración debe ser mayor a 0").optional(),
  duration_unit: z.string().optional(),
  price: z.number().min(0, "El precio no puede ser negativo").optional(),
  description: z.string().optional(),
  associationType: z.string().optional(),
});

// Loader: Fetch warranty definitions including association fields
export const loader = async ({ request }: LoaderFunctionArgs): Promise<TypedResponse<LoaderData>> => {
  console.log("🚨 SPARK LOADER START (with associations) 🚨");
  try {
    const definitionsDb = await prisma.warrantyDefinition.findMany({
      orderBy: { createdAt: 'desc' },
      // Select all fields needed, including associations
      select: {
        id: true,
        name: true,
        durationMonths: true,
        price: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        associationType: true,
        associatedProductIds: true, // String (JSON) in DB
        associatedCollectionIds: true, // String (JSON) in DB
      }
    });

    // Map DB data to frontend type, using DefinitionFromDb for def
    const definitionsFrontend: WarrantyDefinitionFromLoader[] = definitionsDb.map((def: DefinitionFromDb) => {
        let productIds: string[] = [];
        let collectionIds: string[] = [];
        try {
            productIds = JSON.parse(def.associatedProductIds || '[]');
            if (!Array.isArray(productIds)) productIds = [];
        } catch (e) { console.warn(`Failed to parse associatedProductIds for definition ${def.id}:`, e); }
        try {
            collectionIds = JSON.parse(def.associatedCollectionIds || '[]');
            if (!Array.isArray(collectionIds)) collectionIds = [];
        } catch (e) { console.warn(`Failed to parse associatedCollectionIds for definition ${def.id}:`, e); }

        return {
            ...def, // Spread existing fields (id, name, duration, price, description, enums)
            createdAt: def.createdAt.toISOString(),
            updatedAt: def.updatedAt.toISOString(),
            associatedProductIds: productIds,
            associatedCollectionIds: collectionIds,
            // associationType enums are directly from Prisma select
        };
    });

    return json({ warrantyDefinitions: definitionsFrontend });

  } catch (error) {
    console.error("🚨 SPARK LOADER ERROR 🚨:", error);
    throw error;
  }
};


// Action: Handle Create, Update, Delete including association fields
export const action = async ({ request }: ActionFunctionArgs): Promise<TypedResponse<ActionData | any>> => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  // Obtener el tipo de acción directamente de formData
  const actionType = formData.get('_action') as string;
  
  console.log(`🚨 SPARK ACTION START (with associations) 🚨`);
  
  try {
    // --- BÚSQUEDA DE PRODUCTOS O COLECCIONES ---
    if (actionType === 'search_products') {
      const query = formData.get('query') as string || '';
      const result = await admin.graphql(
        `query searchProducts($query: String!) {
          products(first: 10, query: $query) {
            edges {
              node {
                id
                title
                featuredImage {
                  url
                }
              }
            }
          }
        }`,
        {
          variables: {
            query
          }
        }
      );
      
      const responseJson = await result.json();
      return json({ 
        status: 'success',
        searchType: 'products',
        results: responseJson.data.products.edges.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          imageUrl: edge.node.featuredImage?.url || null
        }))
      });
    }
    
    if (actionType === 'search_collections') {
      const query = formData.get('query') as string || '';
      const result = await admin.graphql(
        `query searchCollections($query: String!) {
          collections(first: 10, query: $query) {
            edges {
              node {
                id
                title
                image {
                  url
                }
              }
            }
          }
        }`,
        {
          variables: {
            query
          }
        }
      );
      
      const responseJson = await result.json();
      return json({ 
        status: 'success',
        searchType: 'collections',
        results: responseJson.data.collections.edges.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          imageUrl: edge.node.image?.url || null
        }))
      });
    }
    
    // --- ACCIONES CRUD ---
    // Eliminar definición
    if (actionType === 'delete') {
      const id = formData.get('id') as string;
      if (!id) {
        return json({ status: 'error', message: 'ID is required for delete operation' }, { status: 400 });
      }
      
      await prisma.warrantyDefinition.delete({
        where: { id: parseInt(id) }
      });
      
      return json({ 
        status: 'success', 
        message: 'Warranty definition deleted successfully',
        deletedId: parseInt(id)
      });
    }
    
    // Crear o actualizar definición
    if (actionType === 'create' || actionType === 'update') {
      // Extraer campos comunes
      const name = formData.get('name') as string;
      const durationMonthsStr = formData.get('durationMonths') as string;
      const priceStr = formData.get('price') as string;
      const description = formData.get('description') as string || null;
      
      // Validar campos requeridos
      const errors: Record<string, string> = {};
      
      if (!name) errors.name = 'Name is required';
      if (!durationMonthsStr) errors.durationMonths = 'Duration is required';
      if (!priceStr) errors.price = 'Price is required';
      
      // Convertir y validar tipos numéricos
      let durationMonths = 0;
      let price = 0;
      
      if (durationMonthsStr) {
        durationMonths = parseInt(durationMonthsStr, 10);
        if (isNaN(durationMonths) || durationMonths <= 0) {
          errors.durationMonths = 'Duration must be a positive number';
        }
      }
      
      if (priceStr) {
        price = parseFloat(priceStr);
        if (isNaN(price) || price < 0) {
          errors.price = 'Price must be a non-negative number';
        }
      }
      
      // Si hay errores, devolverlos
      if (Object.keys(errors).length > 0) {
        return json({
          status: 'error',
          message: `Failed to ${actionType === 'create' ? 'create' : 'update'} warranty definition`,
          errors,
          fieldValues: Object.fromEntries(formData)
        }, { status: 400 });
      }
      
      // Preparar datos para guardar/actualizar
      let dataToSave: any = {
        name,
        durationMonths,
        price,
        description,
      };
      
      // Agregar asociaciones
      const productId = formData.get('product_id') as string;
      const productTitle = formData.get('product_title') as string;
      const productImage = formData.get('product_image') as string;
      const collectionId = formData.get('collection_id') as string;
      const collectionTitle = formData.get('collection_title') as string;
      const collectionImage = formData.get('collection_image') as string;
      
      if (productId && productTitle) {
        dataToSave.products = {
          create: [
            {
              productId,
              title: productTitle,
              imageUrl: productImage || null
            }
          ]
        };
      }
      
      if (collectionId && collectionTitle) {
        dataToSave.collections = {
          create: [
            {
              collectionId,
              title: collectionTitle,
              imageUrl: collectionImage || null
            }
          ]
        };
      }
      
      let savedDefinitionDb;
      let successMessage: string;
    
      if (actionType === 'update') {
        const id = formData.get('id') as string;
        if (!id) {
          return json({ status: 'error', message: 'ID is required for update operation' }, { status: 400 });
        }
        savedDefinitionDb = await prisma.warrantyDefinition.update({ where: { id: parseInt(id) }, data: dataToSave });
        successMessage = "Warranty definition updated successfully";
      } else {
        savedDefinitionDb = await prisma.warrantyDefinition.create({ data: dataToSave });
        successMessage = "Warranty definition created successfully";
      }
      
      return json({
        status: 'success',
        message: successMessage,
        definition: savedDefinitionDb
      });
    }
    
    // Si no coincide con ninguna acción conocida
    return json({ 
      status: 'error', 
      message: `Unknown action type: ${actionType}` 
    }, { status: 400 });
    
  } catch (error: any) {
    console.error("🚨 SPARK ACTION ERROR 🚨:", error);
    return json({ 
      status: 'error', 
      message: `Error processing action: ${error.message || 'Unknown error'}` 
    }, { status: 500 });
  }
};


// --- Frontend Component ---
export default function WarrantiesPage() {
  const { warrantyDefinitions } = useLoaderData<LoaderData>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigate = useNavigate();
  const fetcher = useFetcher<ActionData>();

  // Conditionally call useAppBridge only on the client
  const isClient = typeof window !== 'undefined';
  const app = useAppBridge();
  
  useEffect(() => {
    // @ts-ignore - Ignoramos error de tipo, app.dispatch existe en runtime aunque TypeScript no lo reconozca
    if (app && typeof app.dispatch === 'function') {
      console.log("App Bridge disponible y funcional");
    } else {
      console.warn("App Bridge no está funcionando correctamente", app);
    }
  }, [app]);

  // Estado para el formulario usando react-hook-form
  const methods = useForm({
    resolver: zodResolver(warrantySchema),
    defaultValues: {
      name: "",
      duration: 0,
      duration_unit: "days",
      price: 0,
      description: "",
      associationType: WarrantyAssociationType.ALL_PRODUCTS,
    }
  });

  // --- Estado para manejo de UI ---
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  
  // --- Estado para selección de productos y colecciones ---
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);
  
  // --- Modal Handlers ---
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<WarrantyDefinition | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [definitionIdToDelete, setDefinitionIdToDelete] = useState<string | null>(null);
  
  const formRef = React.useRef<HTMLFormElement>(null);
  
  const handleOpenModal = useCallback(() => {
    setIsOpen(true);
    setIsEditing(false);
    setEditingWarranty(null);
    methods.reset({
      name: "",
      duration: 0,
      duration_unit: "days",
      price: 0,
      description: "",
      associationType: WarrantyAssociationType.ALL_PRODUCTS,
    });
    setSelectedProductIds([]);
    setSelectedCollectionIds([]);
  }, [methods]);
  
  const handleCloseModal = useCallback(() => {
    setIsOpen(false);
  }, []);
  
  const handleOpenEditModal = useCallback((warranty: WarrantyDefinition) => {
    setIsEditing(true);
    setEditingWarranty(warranty);
    methods.reset({
      name: warranty.name,
      duration: warranty.duration || 0,
      duration_unit: warranty.duration_unit || "days",
      price: warranty.price || 0,
      description: warranty.description || "",
      associationType: warranty.associationType || WarrantyAssociationType.ALL_PRODUCTS,
    });
    
    // Cargar los IDs de productos/colecciones asociados
    try {
      const productIds = JSON.parse(warranty.associatedProductIds || "[]");
      const collectionIds = JSON.parse(warranty.associatedCollectionIds || "[]");
      setSelectedProductIds(productIds);
      setSelectedCollectionIds(collectionIds);
    } catch (e) {
      console.error("Error al cargar productos/colecciones asociados", e);
    }
    
    setIsOpen(true);
  }, [methods]);
  
  const handleOpenDeleteModal = useCallback((id: string) => {
    setDefinitionIdToDelete(id);
    setDeleteModalOpen(true);
  }, []);
  
  const handleCloseDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setDefinitionIdToDelete(null);
  }, []);

  // Función para manejar el cambio de tipo de asociación
  const handleAssociationTypeChange = useCallback((value: string) => {
    methods.setValue("associationType", value);
    
    // Limpiar selecciones si cambiamos a un tipo que no las usa
    if (value !== WarrantyAssociationType.SPECIFIC_PRODUCTS) {
      setSelectedProductIds([]);
    }
    
    if (value !== WarrantyAssociationType.SPECIFIC_COLLECTIONS) {
      setSelectedCollectionIds([]);
    }
  }, [methods]);

  // Función para manejar la selección de productos
  const handleProductSelection = useCallback(() => {
    if (!app) {
      console.error("App Bridge no está disponible");
      return;
    }
    
    // @ts-ignore - Ignoramos error de tipo, app.dispatch existe en runtime aunque TypeScript no lo reconozca
    if (typeof app.dispatch !== 'function') {
      console.error("app.dispatch no es una función", typeof app.dispatch);
      return;
    }
    
    try {
      // Primero, asegurarnos de que estamos en el tipo correcto de asociación
      methods.setValue("associationType", WarrantyAssociationType.SPECIFIC_PRODUCTS);
      
      // @ts-ignore - Ignoramos el error de tipo ya que sabemos que app es una instancia válida en este punto
      const productPicker = ResourcePicker.create(app, {
        resourceType: ResourcePicker.ResourceType.Product,
        options: {
          selectMultiple: true,
          showVariants: false,
        },
      });
      
      productPicker.subscribe(ResourcePicker.Action.SELECT, ({ selection }) => {
        console.log("Productos seleccionados:", selection);
        // @ts-ignore - Ignoramos el error de tipo para los items
        setSelectedProductIds(selection.map(item => item.id));
        productPicker.unsubscribe();
      });
      
      productPicker.subscribe(ResourcePicker.Action.CANCEL, () => {
        console.log("Selección de productos cancelada");
        productPicker.unsubscribe();
      });
      
      productPicker.dispatch(ResourcePicker.Action.OPEN);
    } catch (error) {
      console.error("Error al crear el ResourcePicker:", error);
    }
  }, [app, methods]);
  
  // Función para manejar la selección de colecciones
  const handleCollectionSelection = useCallback(() => {
    if (!app) {
      console.error("App Bridge no está disponible");
      return;
    }
    
    // @ts-ignore - Ignoramos error de tipo, app.dispatch existe en runtime aunque TypeScript no lo reconozca
    if (typeof app.dispatch !== 'function') {
      console.error("app.dispatch no es una función", typeof app.dispatch);
      return;
    }
    
    try {
      // @ts-ignore - Ignoramos el error de tipo ya que sabemos que app es una instancia válida en este punto
      const collectionPicker = ResourcePicker.create(app, {
        resourceType: ResourcePicker.ResourceType.Collection,
        options: {
          selectMultiple: true,
        },
      });
      
      collectionPicker.subscribe(ResourcePicker.Action.SELECT, ({ selection }) => {
        console.log("Colecciones seleccionadas:", selection);
        // @ts-ignore - Ignoramos el error de tipo para los items
        setSelectedCollectionIds(selection.map(item => item.id));
        collectionPicker.unsubscribe();
      });
      
      collectionPicker.subscribe(ResourcePicker.Action.CANCEL, () => {
        console.log("Selección de colecciones cancelada");
        collectionPicker.unsubscribe();
      });
      
      collectionPicker.dispatch(ResourcePicker.Action.OPEN);
    } catch (error) {
      console.error("Error al crear el ResourcePicker:", error);
    }
  }, [app]);
  
  const modalMarkup = (
    <Modal
      open={isOpen}
      onClose={handleCloseModal}
      title={isEditing ? "Editar garantía" : "Crear nueva garantía"}
      primaryAction={{
        content: isEditing ? "Guardar cambios" : "Crear garantía",
        onAction: methods.handleSubmit(() => {
          formRef.current?.submit();
        }),
      }}
      secondaryActions={[
        {
          content: "Cancelar",
          onAction: handleCloseModal,
        },
      ]}
    >
      <Modal.Section>
        <FormProvider {...methods}>
          <form ref={formRef} method="post" encType="multipart/form-data">
            <input type="hidden" name="actionType" value={isEditing ? "update" : "create"} />
            {isEditing && <input type="hidden" name="id" value={editingWarranty?.id} />}
            
            {/* @ts-ignore - Ignoramos error de tipo para fetcher.data.errors */}
            {fetcher.data?.errors && (
              <Banner tone="critical">
                <List>
                  {/* @ts-ignore - Ignoramos error de tipo para fetcher.data.errors */}
                  {Object.entries(fetcher.data.errors).map(([field, message]) => (
                    <List.Item key={field}>{String(message)}</List.Item>
                  ))}
                </List>
              </Banner>
            )}

            <BlockStack gap="400">
              <FormLayout>
                <TextField
                  label="Nombre de la garantía"
                  type="text"
                  name="name"
                  autoComplete="off"
                  value={methods.watch("name")}
                  onChange={(value) => methods.setValue("name", value)}
                  error={methods.formState.errors.name?.message}
                />

                <FormLayout.Group>
                  <TextField
                    label="Duración"
                    type="number"
                    name="duration"
                    autoComplete="off"
                    value={String(methods.watch("duration") || "")}
                    onChange={(value) => methods.setValue("duration", value ? Number(value) : undefined)}
                    error={methods.formState.errors.duration?.message}
                  />
                  
                  <Select
                    label="Unidad"
                    name="duration_unit"
                    options={[
                      {label: "Días", value: "days"},
                      {label: "Semanas", value: "weeks"},
                      {label: "Meses", value: "months"},
                      {label: "Años", value: "years"}
                    ]}
                    value={methods.watch("duration_unit")}
                    onChange={(value) => methods.setValue("duration_unit", value)}
                  />
                </FormLayout.Group>

                <TextField
                  label="Precio"
                  type="number"
                  name="price"
                  autoComplete="off"
                  value={String(methods.watch("price") || "")}
                  onChange={(value) => methods.setValue("price", value ? Number(value) : undefined)}
                  error={methods.formState.errors.price?.message}
                />

                <TextField
                  label="Descripción"
                  type="text"
                  name="description"
                  autoComplete="off"
                  multiline={4}
                  value={methods.watch("description")}
                  onChange={(value) => methods.setValue("description", value)}
                  error={methods.formState.errors.description?.message}
                />

                {/* Selector de tipo de asociación */}
                <Select
                  label="Aplicar garantía a"
                  name="associationType"
                  options={[
                    {label: "Todos los productos", value: WarrantyAssociationType.ALL_PRODUCTS},
                    {label: "Productos no asignados", value: WarrantyAssociationType.UNASSIGNED_PRODUCTS},
                    {label: "Productos específicos", value: WarrantyAssociationType.SPECIFIC_PRODUCTS},
                    {label: "Colecciones específicas", value: WarrantyAssociationType.SPECIFIC_COLLECTIONS},
                  ]}
                  value={methods.watch("associationType")}
                  onChange={handleAssociationTypeChange}
                />
              </FormLayout>

              {/* Sección de productos seleccionados - solo visible si es SPECIFIC_PRODUCTS */}
              {methods.watch("associationType") === WarrantyAssociationType.SPECIFIC_PRODUCTS && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h2">Productos seleccionados</Text>
                      <SimplePicker 
                        resourceType="Product" 
                        onSelect={(selection) => {
                          // @ts-ignore - No nos preocupamos por el tipo exacto
                          setSelectedProductIds(selection.map(item => item.id));
                        }}
                        onCancel={() => console.log("Selección cancelada")}
                      />
                    </InlineStack>

                    {selectedProductIds.length > 0 ? (
                      <div>
                        <List type="bullet">
                          {selectedProductIds.map((id) => (
                            <List.Item key={id}>
                              {id}
                              <Button 
                                variant="plain" 
                                onClick={() => {
                                  setSelectedProductIds(prev => 
                                    prev.filter(p => p !== id)
                                  );
                                }}
                                accessibilityLabel={`Eliminar producto ${id}`}
                              />
                              <input
                                type="hidden"
                                name="products[]"
                                value={id}
                              />
                            </List.Item>
                          ))}
                        </List>
                      </div>
                    ) : (
                      <Text as="p" tone="subdued">No hay productos seleccionados</Text>
                    )}
                  </BlockStack>
                </Card>
              )}

              {/* Sección de colecciones seleccionadas - solo visible si es SPECIFIC_COLLECTIONS */}
              {methods.watch("associationType") === WarrantyAssociationType.SPECIFIC_COLLECTIONS && (
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text variant="headingMd" as="h2">Colecciones seleccionadas</Text>
                      <SimplePicker 
                        resourceType="Collection" 
                        onSelect={(selection) => {
                          // @ts-ignore - No nos preocupamos por el tipo exacto
                          setSelectedCollectionIds(selection.map(item => item.id));
                        }}
                        onCancel={() => console.log("Selección cancelada")}
                      />
                    </InlineStack>

                    {selectedCollectionIds.length > 0 ? (
                      <div>
                        <List type="bullet">
                          {selectedCollectionIds.map((id) => (
                            <List.Item key={id}>
                              {id}
                              <Button 
                                variant="plain" 
                                onClick={() => {
                                  setSelectedCollectionIds(prev => 
                                    prev.filter(c => c !== id)
                                  );
                                }}
                                accessibilityLabel={`Eliminar colección ${id}`}
                              />
                              <input
                                type="hidden"
                                name="collections[]"
                                value={id}
                              />
                            </List.Item>
                          ))}
                        </List>
                      </div>
                    ) : (
                      <Text as="p" tone="subdued">No hay colecciones seleccionadas</Text>
                    )}
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </form>
        </FormProvider>
      </Modal.Section>
    </Modal>
  );

  // --- Input Handlers ---
  const handleFormValueChange = useCallback(<T extends keyof WarrantyFormState>(field: T, value: WarrantyFormState[T]) => {
     // Usar methods de React Hook Form en lugar de setFormState
     if (field === 'durationMonths') {
        const numericValue = String(value).replace(/\D/g, '');
        methods.setValue(field as any, numericValue);
     } else {
        methods.setValue(field as any, value);
     }
     
     // Reset picker selections if association type changes away from specific
     if (field === 'associationType') {
        if (value !== WarrantyAssociationType.SPECIFIC_PRODUCTS) {
            setSelectedProductIds([]);
        }
        if (value !== WarrantyAssociationType.SPECIFIC_COLLECTIONS) {
            setSelectedCollectionIds([]);
        }
     }
  }, [methods]);

  // --- Resource Picker Logic (Updated based on new pattern) ---
  const handleOpenPicker = useCallback(() => {
    // Solo ejecutar en el cliente
    if (!isClient) return;

    try {
      // Usar nuestra función helper en lugar de useAppBridge directamente
      const app = getAppBridge();
      
      // Diagnóstico para la consola
      console.log('🚨 AppBridge instance in handleOpenPicker:', app);
      if (app) {
        console.log('🚨 typeof app.dispatch:', typeof app.dispatch);
        console.log('🚨 app.constructor.name:', app.constructor?.name);
      }
      
      if (!app || typeof app.dispatch !== 'function') {
        console.error("❌ Error: AppBridge instance is not valid or dispatch is not a function");
        // Mostrar alerta amigable para el usuario
        alert("No se pudo inicializar el selector de productos oficial de Shopify. Por favor, usa el botón 'Seleccionar (Simple)' como alternativa.");
        return;
      }

      // Usar valores predeterminados en lugar de intentar obtener el associationType
      const resourceType = ResourcePicker.ResourceType.Product;
      const initialSelection = selectedProductIds.map(id => ({ id }));
      const pickerTypeText = 'Product';
      
      console.log(`🚨 Opening ${pickerTypeText} Picker with initial selection:`, initialSelection);
      
      try {
        // Crear el picker sin necesidad de usar @ts-ignore
        const picker = ResourcePicker.create(app, {
          resourceType,
          options: {
            selectMultiple: true,
            initialSelectionIds: initialSelection,
          },
        });

        // Suscribirse a eventos
        picker.subscribe(ResourcePicker.Action.SELECT, ({ selection }) => {
          console.log(`🚨 ${pickerTypeText} Picker SELECT payload:`, selection);
          const selectedIds = selection.map((item: any) => item.id);
          setSelectedProductIds(selectedIds);
        });

        picker.subscribe(ResourcePicker.Action.CANCEL, () => {
          console.log(`🚨 ${pickerTypeText} Picker CANCELLED`);
        });

        // Abrir el picker usando dispatch directamente
        picker.dispatch(ResourcePicker.Action.OPEN);
      } catch (error: any) {
        console.error('❌ Error creating or dispatching ResourcePicker:', error);
        alert(`Error al abrir el selector: ${error?.message || 'Desconocido'}\nPor favor, usa el botón 'Seleccionar (Simple)' como alternativa.`);
      }
    } catch (error: any) {
      console.error('❌ Error in handleOpenPicker:', error);
      alert(`Error general: ${error?.message || 'Desconocido'}\nPor favor, usa el botón 'Seleccionar (Simple)' como alternativa.`);
    }
  }, [isClient, selectedProductIds]);

  // --- Effects ---
  // Effect to handle ALL fetcher results
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const data = fetcher.data;
      if (data.status === 'success') {
        setToast({ message: data.message, error: false });
        if (data.definition) { // Create/Update success
             handleCloseModal();
        } else if (data.deletedId) { // Delete success
             handleCloseDeleteModal();
        }
      } else if (data.status === 'error') {
        console.error("Action failed:", data.message);
        setToast({ message: data.message, error: true });
        // Repopulate form state on validation error ONLY if modal is open
        if (isOpen && data.errors && data.fieldValues) {
            // Safely access potentially missing fields
            const values = data.fieldValues;
            // Actualizar el formulario con React Hook Form usando los nombres correctos
            methods.reset({
                name: values.name || '',
                duration: values.duration ? Number(values.duration) : 0,
                duration_unit: values.duration_unit || 'days',
                price: values.price ? Number(values.price) : 0,
                description: values.description || '',
            });
            // Repopulate picker state from the stringified JSON sent back
            try { setSelectedProductIds(JSON.parse(values.associatedProductIds || '[]')); } catch { setSelectedProductIds([])} ;
            try { setSelectedCollectionIds(JSON.parse(values.associatedCollectionIds || '[]')); } catch { setSelectedCollectionIds([])} ;
        }
      }
    }
  }, [fetcher.state, fetcher.data, isOpen, handleCloseModal, handleCloseDeleteModal, methods]);

  // --- JSX Render ---
  return (
    <Page
        title="Warranty Definitions"
        primaryAction={{ content: 'Create Definition', onAction: handleOpenModal }}
    >
      <Frame>
        <BlockStack gap="500">
          {/* Toasts para notificaciones */}
          {toast && (
            <Toast
              content={toast.message}
              error={toast.error}
              onDismiss={() => setToast(null)}
            />
          )}

          {/* Create/Edit Modal */}
          {modalMarkup}

          {/* Delete Confirmation Modal */}
           <Modal
              open={deleteModalOpen}
              onClose={handleCloseDeleteModal}
              title="Delete Warranty Definition?"
              primaryAction={{
                  content: 'Delete', 
                  destructive: true, 
                  onAction: () => {
                    if (definitionIdToDelete) {
                      const formData = new FormData();
                      formData.append('actionType', 'delete');
                      formData.append('id', definitionIdToDelete);
                      submit(formData, { method: 'post' });
                      handleCloseDeleteModal();
                    }
                  },
                  loading: fetcher.state !== 'idle' && fetcher.formData?.get('_action') === 'delete',
                  disabled: fetcher.state !== 'idle',
              }}
              secondaryActions={[{ content: 'Cancel', onAction: handleCloseDeleteModal, disabled: fetcher.state !== 'idle' }]}
          >
              <Modal.Section>
                  <Text as="p">Are you sure you want to delete this warranty definition? This action cannot be undone.</Text>
              </Modal.Section>
          </Modal>

          {/* Warranty Definitions Table */}
           <Card padding="0">
              {warrantyDefinitions.length > 0 ? (
                  <IndexTable
                      itemCount={warrantyDefinitions.length}
                      headings={[
                          { title: 'Name' }, { title: 'Duration' }, { title: 'Price' },
                          { title: 'Applies To' }, { title: 'Actions' },
                      ]}
                      selectable={false}
                  >
                      {warrantyDefinitions.map((definition, index) => (
                        <IndexTable.Row id={String(definition.id)} key={definition.id} position={index}>
                            <IndexTable.Cell>{definition.name}</IndexTable.Cell>
                            <IndexTable.Cell>{definition.durationMonths} months</IndexTable.Cell>
                            <IndexTable.Cell>{definition.price ? `$${definition.price.toFixed(2)}` : 'N/A'}</IndexTable.Cell>
                            <IndexTable.Cell>
                              {formatAssociationType(definition.associationType)}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <ButtonGroup>
                                  <Button onClick={() => handleOpenEditModal(definition)} disabled={fetcher.state !== 'idle'}>Edit</Button>
                                  <Button
                                      variant="primary" tone="critical"
                                      onClick={() => handleOpenDeleteModal(String(definition.id))}
                                      disabled={fetcher.state !== 'idle'}
                                  >Delete</Button>
                              </ButtonGroup>
                            </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                  </IndexTable>
              ) : (
                <EmptyState
                  heading="No warranty definitions yet"
                  action={{ content: 'Create Definition', onAction: handleOpenModal }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create your first warranty definition to offer extended warranties.</p>
                </EmptyState>
              )}
          </Card>
        </BlockStack>
      </Frame>
    </Page>
  );
}

// --- Helper Functions ---

// Helper to format association type for display
function formatAssociationType(type: WarrantyAssociationType | string): string {
    switch (type) {
        case WarrantyAssociationType.ALL_PRODUCTS: return 'All Products';
        case WarrantyAssociationType.UNASSIGNED_PRODUCTS: return 'Unassigned Products';
        case WarrantyAssociationType.SPECIFIC_PRODUCTS: return 'Specific Products';
        case WarrantyAssociationType.SPECIFIC_COLLECTIONS: return 'Specific Collections';
        default: return typeof type === 'string' ? type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown'; // Format string fallback
    }
}

// --- Solución Alternativa cuando App Bridge falla ---
function SimplePicker({
  onSelect,
  onCancel,
  resourceType
}: {
  onSelect: (selection: any[]) => void,
  onCancel: () => void,
  resourceType: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  
  // Usar fetcher para comunicarse con la action
  const fetcher = useFetcher<any>();
  
  // Determinar el estado de carga
  const isSearching = fetcher.state === 'submitting' || fetcher.state === 'loading';
  
  // Buscar productos/colecciones reales usando GraphQL
  const searchItems = useCallback((query: string) => {
    setIsLoading(true);
    
    const formData = new FormData();
    formData.append("query", query);
    formData.append("_action", resourceType === 'Product' ? 'search_products' : 'search_collections');
    
    // Enviar la acción directamente a nuestra ruta
    fetcher.submit(formData, { method: "post" });
  }, [fetcher, resourceType]);
  
  // Cargar los resultados cuando el fetcher devuelve datos
  useEffect(() => {
    if (fetcher.data) {
      console.log("Datos recibidos:", fetcher.data);
      
      if (fetcher.data.status === 'success') {
        // Set items from the results array in the response
        setItems(fetcher.data.results || []);
      } else {
        console.error("Error en la búsqueda:", fetcher.data.message);
        setItems([]);
      }
      
      setIsLoading(false);
    }
  }, [fetcher.data]);
  
  // Efecto para buscar cuando cambia la consulta después de un pequeño retraso
  useEffect(() => {
    if (!isOpen) return;
    
    // Búsqueda inicial de elementos populares
    if (isOpen && !items.length && !searchQuery && !isSearching) {
      searchItems("");
      return;
    }
    
    const timer = setTimeout(() => {
      if (searchQuery && searchQuery.length >= 2) {
        searchItems(searchQuery);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, searchItems, items.length, isSearching]);
  
  const handleOpenPicker = () => {
    setIsOpen(true);
    setItems([]);
    setSearchQuery("");
    searchItems(""); // Realizar una búsqueda inicial vacía para mostrar productos populares
  };
  
  const handleSelectItem = (item: any) => {
    const isSelected = selectedItems.some(selected => selected.id === item.id);
    
    if (isSelected) {
      setSelectedItems(selectedItems.filter(selected => selected.id !== item.id));
    } else {
      setSelectedItems([...selectedItems, item]);
    }
  };
  
  const handleConfirm = () => {
    // Pasamos los items seleccionados al componente padre
    onSelect(selectedItems);
    setIsOpen(false);
    setSelectedItems([]);
  };
  
  const handleCancel = () => {
    onCancel();
    setIsOpen(false);
    setSelectedItems([]);
  };
  
  if (!isOpen) {
    return (
      <Button onClick={handleOpenPicker} variant="primary" size="slim">
        {resourceType === 'Product' ? 'Seleccionar Productos' : 'Seleccionar Colecciones'}
      </Button>
    );
  }
  
  return (
    <Modal
      open={isOpen}
      onClose={handleCancel}
      title={`Seleccionar ${resourceType === 'Product' ? 'Productos' : 'Colecciones'}`}
      primaryAction={{
        content: 'Confirmar Selección',
        onAction: handleConfirm,
        disabled: selectedItems.length === 0
      }}
      secondaryActions={[
        {
          content: 'Cancelar',
          onAction: handleCancel
        }
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label="Buscar"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Buscar ${resourceType === 'Product' ? 'productos' : 'colecciones'}...`}
            autoComplete="off"
            helpText="Escribe al menos 2 caracteres para iniciar la búsqueda"
          />
          
          {isLoading || isSearching ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <Spinner accessibilityLabel="Buscando..." size="large" />
              <div style={{ marginTop: '10px' }}>Buscando...</div>
            </div>
          ) : (
            <>
              {items.length === 0 ? (
                <Banner tone="info">
                  <p>No se encontraron resultados. Intenta con otra búsqueda.</p>
                </Banner>
              ) : (
                <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
                  <List type="bullet">
                    {items.map((item) => {
                      const isSelected = selectedItems.some(selected => selected.id === item.id);
                      
                      return (
                        <List.Item key={item.id}>
                          <Button 
                            variant={isSelected ? "primary" : "plain"}
                            onClick={() => handleSelectItem(item)}
                            fullWidth
                          >
                            <InlineStack gap="200" blockAlign="center">
                              {item.imageUrl && (
                                <img 
                                  src={item.imageUrl} 
                                  alt={item.title} 
                                  style={{ width: '40px', height: '40px', objectFit: 'cover' }} 
                                />
                              )}
                              <BlockStack gap="100">
                                <Text variant="bodyMd" as="span" fontWeight="bold">{item.title}</Text>
                                <Text variant="bodySm" as="span" tone="subdued">{`ID: ${item.id}`}</Text>
                              </BlockStack>
                            </InlineStack>
                          </Button>
                        </List.Item>
                      );
                    })}
                  </List>
                </div>
              )}
            </>
          )}
          
          {selectedItems.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Seleccionados ({selectedItems.length})</Text>
                <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                  {selectedItems.map(item => (
                    <div key={item.id} style={{ 
                      padding: '10px', 
                      marginBottom: '8px', 
                      border: '1px solid #ddd', 
                      borderRadius: '8px' 
                    }}>
                      <InlineStack gap="100" align="space-between">
                        <Text variant="bodyMd" as="span" fontWeight="bold">{item.title}</Text>
                        <Button
                          onClick={() => handleSelectItem(item)}
                          variant="plain"
                          icon={DeleteIcon}
                        />
                      </InlineStack>
                      <Text variant="bodySm" as="span">{`ID: ${item.id}`}</Text>
                    </div>
                  ))}
                </div>
              </BlockStack>
            </div>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
} 