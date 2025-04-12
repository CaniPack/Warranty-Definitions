// app/routes/app.warranties.tsx

import { json, LoaderFunctionArgs, ActionFunctionArgs, TypedResponse } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
} from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Frame, Modal, FormLayout, TextField, Select, Banner,
  InlineStack, ButtonGroup, EmptyState
} from "@shopify/polaris";
import prisma from "~/db.server";
// Import enums and types from Prisma
import { WarrantyDefinition, WarrantyAssociationType, PriceType } from "@prisma/client";
// Import useAppBridge and ResourcePicker actions
import { useAppBridge } from '@shopify/app-bridge-react';
import { ResourcePicker as ResourcePickerAction } from '@shopify/app-bridge/actions';

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
  // priceType is already the correct enum from Prisma
  // associationType is already the correct enum from Prisma
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
  priceType: PriceType;
  priceValue: string; // Keep as string for input
  description: string; // Use string, handle null on save
  associationType: WarrantyAssociationType;
};


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
        priceType: true,
        priceValue: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        associationType: true,
        associatedProductIds: true, // String (JSON) in DB
        associatedCollectionIds: true, // String (JSON) in DB
      }
    });

    // Map DB data to frontend type, parsing JSON ID strings
    const definitionsFrontend: WarrantyDefinitionFromLoader[] = definitionsDb.map(def => {
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
            // priceType and associationType enums are directly from Prisma select
        };
    });

    return json({ warrantyDefinitions: definitionsFrontend });

  } catch (error) {
    console.error("🚨 SPARK LOADER ERROR 🚨:", error);
    throw error;
  }
};


// Action: Handle Create, Update, Delete including association fields
export const action = async ({ request }: ActionFunctionArgs): Promise<TypedResponse<ActionData>> => {
  console.log("🚨 SPARK ACTION START (with associations) 🚨");
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const id = formData.get("id");

  try {
    // --- Delete Action ---
    if (actionType === "delete") {
      if (!id) return json({ status: 'error', message: 'Missing ID for delete' }, { status: 400 });
      try {
        await prisma.warrantyDefinition.delete({ where: { id: Number(id) } });
        return json({ status: 'success', message: 'Warranty definition deleted successfully.', deletedId: Number(id) });
      } catch (error: any) {
          if (error.code === 'P2025') return json({ status: 'error', message: 'Warranty definition not found for deletion.' }, { status: 404 });
          console.error("🚨 SPARK ACTION (Delete) ERROR 🚨:", error);
          return json({ status: 'error', message: `Failed to delete definition: ${error.message || 'Unknown error'}` }, { status: 500 });
      }
    }

    // --- Create / Update Action ---
    const name = formData.get("name") as string;
    const durationMonths = formData.get("durationMonths") as string;
    const priceType = formData.get("priceType") as PriceType;
    const priceValue = formData.get("priceValue") as string;
    const description = formData.get("description") as string;
    const associationType = formData.get("associationType") as WarrantyAssociationType;
    // Get IDs as JSON strings from the form (submitted by frontend)
    const associatedProductIdsStr = formData.get("associatedProductIds") as string || '[]';
    const associatedCollectionIdsStr = formData.get("associatedCollectionIds") as string || '[]';

    // Validation
    const errors: Record<string, string> = {};
    if (!name) errors.name = "Name is required";
    // Stricter duration validation
    if (!durationMonths || isNaN(parseInt(durationMonths, 10)) || parseInt(durationMonths, 10) <= 0) errors.durationMonths = "Duration must be a positive number";
    if (!priceType || !Object.values(PriceType).includes(priceType)) errors.priceType = "Price type is required";
    // Stricter price validation
    if (!priceValue || isNaN(parseFloat(priceValue)) || parseFloat(priceValue) < 0) errors.priceValue = "Price value must be a non-negative number";
    if (!associationType || !Object.values(WarrantyAssociationType).includes(associationType)) errors.associationType = "Association type is required";

    // Validate JSON strings and ensure they are arrays only if a specific type is selected
    let parsedProductIds: string[] = [];
    let parsedCollectionIds: string[] = [];
    if (associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS) {
        try {
             parsedProductIds = JSON.parse(associatedProductIdsStr);
             if (!Array.isArray(parsedProductIds)) throw new Error('Not an array');
             // Optional: Validate GID format if needed
        } catch (e) { errors.associatedProductIds = "Invalid product selection format."; }
    }
     if (associationType === WarrantyAssociationType.SPECIFIC_COLLECTIONS) {
        try {
            parsedCollectionIds = JSON.parse(associatedCollectionIdsStr);
            if (!Array.isArray(parsedCollectionIds)) throw new Error('Not an array');
            // Optional: Validate GID format if needed
        } catch (e) { errors.associatedCollectionIds = "Invalid collection selection format."; }
    }

    if (Object.keys(errors).length > 0) {
      const fieldValues = Object.fromEntries(formData);
      return json({ status: 'error', message: 'Validation failed', errors, fieldValues }, { status: 400 });
    }

    // Prepare data for Prisma, ensuring IDs are saved as JSON strings
    const dataToSave = {
      name,
      durationMonths: parseInt(durationMonths, 10),
      priceType, // Already correct enum
      priceValue: priceType === PriceType.FIXED_AMOUNT
                    ? Math.round(parseFloat(priceValue) * 100) // Store cents
                    : parseInt(priceValue, 10), // Store basis points or percentage value directly
      description: description || null,
      associationType,
      // Save the validated (or default empty) JSON strings
      associatedProductIds: associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS ? associatedProductIdsStr : '[]',
      associatedCollectionIds: associationType === WarrantyAssociationType.SPECIFIC_COLLECTIONS ? associatedCollectionIdsStr : '[]',
    };

    let savedDefinitionDb;
    let successMessage: string;

    if (actionType === "update" && id) {
      savedDefinitionDb = await prisma.warrantyDefinition.update({ where: { id: Number(id) }, data: dataToSave });
      successMessage = "Warranty definition updated successfully";
    } else {
      savedDefinitionDb = await prisma.warrantyDefinition.create({ data: dataToSave });
      successMessage = "Warranty definition created successfully";
    }

    // Construct response, parsing IDs again for consistency in the return type
    let responseProductIds: string[] = [];
    let responseCollectionIds: string[] = [];
    try { responseProductIds = JSON.parse(savedDefinitionDb.associatedProductIds || '[]'); if (!Array.isArray(responseProductIds)) responseProductIds = []; } catch {} ;
    try { responseCollectionIds = JSON.parse(savedDefinitionDb.associatedCollectionIds || '[]'); if (!Array.isArray(responseCollectionIds)) responseCollectionIds = []; } catch {} ;

    // Ensure the response matches WarrantyDefinitionFromLoader
    const responseDefinition: WarrantyDefinitionFromLoader = {
        id: savedDefinitionDb.id,
        name: savedDefinitionDb.name,
        durationMonths: savedDefinitionDb.durationMonths,
        priceType: savedDefinitionDb.priceType,
        priceValue: savedDefinitionDb.priceValue,
        description: savedDefinitionDb.description,
        createdAt: savedDefinitionDb.createdAt.toISOString(),
        updatedAt: savedDefinitionDb.updatedAt.toISOString(),
        associationType: savedDefinitionDb.associationType,
        associatedProductIds: responseProductIds,
        associatedCollectionIds: responseCollectionIds,
    };

    return json({ status: 'success', message: successMessage, definition: responseDefinition });

  } catch (error: any) {
    console.error("🚨 SPARK ACTION ERROR 🚨:", error);
    let errorMessage = `Failed to ${actionType || 'save'} definition: ${error.message || 'Unknown error'}`;
    let status = 500;
    if (error.code === 'P2002') {
        errorMessage = 'A definition with similar key fields might already exist.';
        status = 409;
    }
    return json({ status: 'error', message: errorMessage }, { status });
  }
};


// --- Frontend Component ---
export default function WarrantyDefinitionsPage() {
  const { warrantyDefinitions: initialWarrantyDefinitions } = useLoaderData<LoaderData>();
  const [warrantyDefinitions, setWarrantyDefinitions] = useState<WarrantyDefinitionFromLoader[]>(initialWarrantyDefinitions);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetcher = useFetcher<ActionData>();
  const appBridge = useAppBridge(); // Needed for ResourcePicker

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Use the dedicated Form State type, including associationType
  const [formState, setFormState] = useState<WarrantyFormState>({
    name: '',
    durationMonths: '',
    priceType: PriceType.FIXED_AMOUNT,
    priceValue: '',
    description: '',
    associationType: WarrantyAssociationType.ALL_PRODUCTS, // Default association
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [definitionIdToDelete, setDefinitionIdToDelete] = useState<number | null>(null);

  // State for Resource Picker selections
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  // --- Modal Handlers ---
  const handleOpenModalForCreate = useCallback(() => {
    setEditingId(null);
    // Reset form state including association type and selections
    setFormState({
        name: '', durationMonths: '', priceType: PriceType.FIXED_AMOUNT, priceValue: '', description: '',
        associationType: WarrantyAssociationType.ALL_PRODUCTS
    });
    setSelectedProductIds([]);
    setSelectedCollectionIds([]);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((definition: WarrantyDefinitionFromLoader) => {
    setEditingId(definition.id);
    // Populate form state including association type and selections
    setFormState({
        name: definition.name,
        durationMonths: definition.durationMonths.toString(),
        priceType: definition.priceType,
        priceValue: definition.priceType === PriceType.FIXED_AMOUNT
                      ? (definition.priceValue / 100).toFixed(2)
                      : definition.priceValue.toString(),
        description: definition.description ?? '',
        associationType: definition.associationType,
    });
    setSelectedProductIds(definition.associatedProductIds || []);
    setSelectedCollectionIds(definition.associatedCollectionIds || []);
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    // Clear fetcher data on close to prevent stale errors showing on reopen
    if (fetcher.data) {
       fetcher.data = undefined;
    }
  }, [fetcher]);

  const handleOpenDeleteModal = useCallback((id: number) => {
    setDefinitionIdToDelete(id);
    setDeleteModalOpen(true);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setDefinitionIdToDelete(null);
    setDeleteModalOpen(false);
     if (fetcher.data?.status === 'error' && fetcher.formData?.get('actionType') === 'delete') {
       fetcher.data = undefined;
     }
  }, [fetcher]);

  const handleDeleteDefinition = useCallback(() => {
    if (definitionIdToDelete !== null) {
        const formData = new FormData();
        formData.append('actionType', 'delete');
        formData.append('id', String(definitionIdToDelete));
        fetcher.submit(formData, { method: 'post' });
    }
  }, [definitionIdToDelete, fetcher]);

  // --- Input Handlers ---
  const handleFormValueChange = useCallback(<T extends keyof WarrantyFormState>(field: T, value: WarrantyFormState[T]) => {
     if (field === 'durationMonths') {
        const numericValue = String(value).replace(/\D/g, '');
        setFormState(prev => ({ ...prev, [field]: numericValue }));
     } else {
         setFormState(prev => ({ ...prev, [field]: value }));
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
  }, []);

  // --- Resource Picker Logic ---
  const handleOpenPicker = useCallback(async () => {
    const resourceType = formState.associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS ? 'Product' : 'Collection';
    const initialSelectionIds = formState.associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS
      ? selectedProductIds.map(id => ({ id }))
      : selectedCollectionIds.map(id => ({ id }));

    try {
      // Use appBridge.dispatch with ResourcePicker actions
      appBridge.dispatch(ResourcePickerAction.select({
        type: resourceType,
        multiple: true,
        selectionIds: initialSelectionIds,
      }));
      // Note: Selection handling is now done via event listener (added below)
      console.log(`Dispatched ${resourceType} picker action.`);
    } catch (error: any) {
      console.error('An error occurred dispatching the resource picker action:', error);
      // Optionally show error to user
    }
  }, [appBridge, formState.associationType, selectedProductIds, selectedCollectionIds]);

  // --- Effects ---

  // Effect to handle Resource Picker selection events
  useEffect(() => {
    // Don't run effect if appBridge isn't available (e.g., during SSR)
    if (typeof window === 'undefined' || !appBridge) return;

    console.log("Setting up App Bridge subscriptions...");

    // Restore appBridge.subscribe usage, add null check just in case
    // Add explicit 'any' to payload to silence linter while environment is broken
    const unsubscribe = appBridge.subscribe?.(ResourcePickerAction.Action.SELECT, (payload: any) => {
      console.log('Resource Picker SELECT event received:', payload);
      if (payload?.selection) {
          const ids = payload.selection.map((resource: { id: string }) => resource.id);
          if (formState.associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS) {
              setSelectedProductIds(ids);
          } else if (formState.associationType === WarrantyAssociationType.SPECIFIC_COLLECTIONS) {
              setSelectedCollectionIds(ids);
          }
      }
    });

    // Restore appBridge.subscribe usage for cancel event too
    const unsubscribeCancel = appBridge.subscribe?.(ResourcePickerAction.Action.CANCEL, () => {
       console.log('Resource Picker CANCEL event received');
    });

    // Cleanup subscription on component unmount
    return () => {
        // Check if unsubscribe functions exist before calling
        unsubscribe?.();
        unsubscribeCancel?.();
    };
    // Re-run if appBridge or associationType changes (to ensure correct type handling)
  }, [appBridge, formState.associationType]);

  // Effect to handle ALL fetcher results
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const data = fetcher.data;
      if (data.status === 'success') {
        setSuccessMessage(data.message!);
        if (data.definition) { // Create/Update success
             const updatedDefinition = data.definition;
             setWarrantyDefinitions(prev => {
                 const index = prev.findIndex(def => def.id === updatedDefinition.id);
                 if (index > -1) { // Update
                     const newState = [...prev];
                     newState[index] = updatedDefinition;
                     return newState;
                 } else { // Create
                     return [updatedDefinition, ...prev];
                 }
             });
             handleCloseModal();
        } else if (data.deletedId) { // Delete success
             setWarrantyDefinitions(prevDefs =>
               prevDefs.filter(def => def.id !== data.deletedId)
             );
             handleCloseDeleteModal();
        }
      } else if (data.status === 'error') {
        console.error("Action failed:", data.message);
        // Repopulate form state on validation error ONLY if modal is open
        if (modalOpen && data.errors && data.fieldValues) {
            // Safely access potentially missing fields
            const values = data.fieldValues;
             setFormState({
                 name: values.name || '',
                 durationMonths: values.durationMonths || '',
                 priceType: (Object.values(PriceType).includes(values.priceType) ? values.priceType : PriceType.FIXED_AMOUNT) as PriceType,
                 priceValue: values.priceValue || '',
                 description: values.description || '',
                 associationType: (Object.values(WarrantyAssociationType).includes(values.associationType) ? values.associationType : WarrantyAssociationType.ALL_PRODUCTS) as WarrantyAssociationType,
             });
             // Repopulate picker state from the stringified JSON sent back
             try { setSelectedProductIds(JSON.parse(values.associatedProductIds || '[]')); } catch { setSelectedProductIds([])} ;
             try { setSelectedCollectionIds(JSON.parse(values.associatedCollectionIds || '[]')); } catch { setSelectedCollectionIds([])} ;
        }
      }
      // Clear fetcher data after processing to prevent re-triggering
      // Be careful if other effects depend on fetcher.data persisting
      // fetcher.data = undefined; // Consider if needed
    }
  }, [fetcher.state, fetcher.data, modalOpen, handleCloseModal, handleCloseDeleteModal]); // Added modalOpen dependency

  // Effect to auto-dismiss success message banner
  useEffect(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    if (successMessage) {
       successTimeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimeoutRef.current = null;
      }, 5000);
    }
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, [successMessage]);

  // --- JSX Render ---
  return (
    <Page
        title="Warranty Definitions"
        primaryAction={{ content: 'Create Definition', onAction: handleOpenModalForCreate }}
    >
      <Frame>
        <BlockStack gap="500">
          {/* Banners */}
          {successMessage && (
              <Banner title="Success" tone="success" onDismiss={() => setSuccessMessage(null)}>
                  <p>{successMessage}</p>
              </Banner>
          )}
          {fetcher.data?.status === 'error' && fetcher.state === 'idle' && (
              <Banner title="Error" tone='critical' onDismiss={() => { fetcher.data = undefined; }}>
                  <p>{fetcher.data.message}</p>
                  {fetcher.data.errors && (
                    <BlockStack gap="100">
                        {Object.entries(fetcher.data.errors).map(([field, message]) => (
                            <Text key={field} as="p" tone="critical">&#8226; {message}</Text>
                        ))}
                    </BlockStack>
                  )}
              </Banner>
          )}

          {/* No Resource Picker Component Rendered Here */}

          {/* Create/Edit Modal */}
          <Modal
            open={modalOpen}
            onClose={handleCloseModal}
            title={editingId ? "Edit Warranty Definition" : "Create Warranty Definition"}
            primaryAction={{
              content: editingId ? 'Save Changes' : 'Create Definition',
              onAction: () => {
                const formData = new FormData();
                formData.append('actionType', editingId ? 'update' : 'create');
                if (editingId) {
                  formData.append('id', String(editingId));
                }
                // Append all formState fields
                Object.entries(formState).forEach(([key, value]) => {
                    const valueToSend = (key === 'description' && value === null) ? '' : value;
                    formData.append(key, valueToSend as string);
                });
                // Send IDs as JSON strings (using current state)
                formData.append('associatedProductIds', JSON.stringify(selectedProductIds));
                formData.append('associatedCollectionIds', JSON.stringify(selectedCollectionIds));
                fetcher.submit(formData, { method: 'post' });
              },
              loading: fetcher.state !== 'idle' && (fetcher.formData?.get('actionType') === 'create' || fetcher.formData?.get('actionType') === 'update'),
              disabled: fetcher.state !== 'idle',
            }}
            secondaryActions={[{ content: 'Cancel', onAction: handleCloseModal, disabled: fetcher.state !== 'idle' }]}
          >
            <Modal.Section>
              <FormLayout>
                <TextField
                  label="Warranty Name"
                  value={formState.name}
                  onChange={(value) => handleFormValueChange('name', value)}
                  autoComplete="off"
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen ? fetcher.data.errors?.name : undefined}
                />
                 <TextField
                  label="Duration (Months)"
                  type="text" inputMode="numeric"
                  value={formState.durationMonths}
                  onChange={(value) => handleFormValueChange('durationMonths', value)}
                  autoComplete="off"
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen ? fetcher.data.errors?.durationMonths : undefined}
                />
                 <Select
                  label="Price Type"
                  options={Object.values(PriceType).map(pt => ({ label: formatPriceType(pt), value: pt }))}
                  value={formState.priceType}
                  onChange={(value) => handleFormValueChange('priceType', value as PriceType)}
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen ? fetcher.data.errors?.priceType : undefined}
                />
                 <TextField
                  label={formState.priceType === PriceType.FIXED_AMOUNT ? "Price ($)" : "Price (%)"}
                  type="number"
                  prefix={formState.priceType === PriceType.FIXED_AMOUNT ? '$' : undefined}
                  suffix={formState.priceType === PriceType.PERCENTAGE ? '%' : undefined}
                  value={formState.priceValue}
                  onChange={(value) => handleFormValueChange('priceValue', value)}
                  autoComplete="off"
                  requiredIndicator
                  step={formState.priceType === PriceType.FIXED_AMOUNT ? 0.01 : 1}
                  min="0"
                  error={fetcher.data?.status === 'error' && modalOpen ? fetcher.data.errors?.priceValue : undefined}
                />
                <TextField
                  label="Description (Optional)"
                  value={formState.description}
                  onChange={(value) => handleFormValueChange('description', value)}
                  autoComplete="off"
                  multiline={3}
                />

                {/* Association Type Selector */}
                <Select
                  label="Applies To"
                  options={Object.values(WarrantyAssociationType).map(at => ({ label: formatAssociationType(at), value: at }))}
                  value={formState.associationType}
                  onChange={(value) => handleFormValueChange('associationType', value as WarrantyAssociationType)}
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen ? fetcher.data.errors?.associationType : undefined}
                />

                {/* Conditional UI for Specific Products/Collections */}
                 {formState.associationType === WarrantyAssociationType.SPECIFIC_PRODUCTS && (
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                        <Text variant="bodyMd" as="p">Selected Products: {selectedProductIds.length}</Text>
                        <Button onClick={handleOpenPicker} size="slim" disabled={fetcher.state !== 'idle'}>Select Products</Button>
                    </InlineStack>
                    {fetcher.data?.status === 'error' && modalOpen && fetcher.data.errors?.associatedProductIds && (
                         <Banner tone="critical" title="Selection Error"><p>{fetcher.data.errors.associatedProductIds}</p></Banner>
                    )}
                  </BlockStack>
                )}
                {formState.associationType === WarrantyAssociationType.SPECIFIC_COLLECTIONS && (
                   <BlockStack gap="200">
                     <InlineStack align="space-between">
                        <Text variant="bodyMd" as="p">Selected Collections: {selectedCollectionIds.length}</Text>
                        <Button onClick={handleOpenPicker} size="slim" disabled={fetcher.state !== 'idle'}>Select Collections</Button>
                    </InlineStack>
                     {fetcher.data?.status === 'error' && modalOpen && fetcher.data.errors?.associatedCollectionIds && (
                         <Banner tone="critical" title="Selection Error"><p>{fetcher.data.errors.associatedCollectionIds}</p></Banner>
                    )}
                   </BlockStack>
                )}

              </FormLayout>
            </Modal.Section>
          </Modal>

          {/* Delete Confirmation Modal */}
           <Modal
              open={deleteModalOpen}
              onClose={handleCloseDeleteModal}
              title="Delete Warranty Definition?"
              primaryAction={{
                  content: 'Delete', destructive: true, onAction: handleDeleteDefinition,
                  loading: fetcher.state !== 'idle' && fetcher.formData?.get('actionType') === 'delete',
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
                            <IndexTable.Cell>
                                {formatPriceDisplay(definition.priceType, definition.priceValue)}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {formatAssociationType(definition.associationType)}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <ButtonGroup>
                                  <Button onClick={() => handleEdit(definition)} disabled={fetcher.state !== 'idle'}>Edit</Button>
                                  <Button
                                      variant="primary" tone="critical"
                                      onClick={() => handleOpenDeleteModal(definition.id)}
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
                  action={{ content: 'Create Definition', onAction: handleOpenModalForCreate }}
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

// Helper to format price type for display in Select
function formatPriceType(type: PriceType | string): string {
    switch (type) {
        case PriceType.FIXED_AMOUNT: return 'Fixed Amount ($)';
        case PriceType.PERCENTAGE: return 'Percentage (%)';
        default: return typeof type === 'string' ? type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Unknown';
    }
}

// Helper to format price value for display in table
function formatPriceDisplay(type: PriceType, value: number): string {
    if (type === PriceType.FIXED_AMOUNT) {
        // Assuming value is stored in cents
        return `$${(value / 100).toFixed(2)}`;
    } else if (type === PriceType.PERCENTAGE) {
        // Assuming value is stored as percentage number (e.g., 10 for 10%)
        return `${value}%`;
    }
    return String(value); // Fallback
} 