// app/routes/app.warranties.tsx

import { json, LoaderFunctionArgs, ActionFunctionArgs, TypedResponse } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
  // useNavigate, // Removed useNavigate as it's unused now
} from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Frame, Modal, FormLayout, TextField, Select, Banner,
  InlineStack, ButtonGroup, EmptyState // Removed Toast as it's unused
} from "@shopify/polaris";
import prisma from "~/db.server"; // Import the Prisma client
import { WarrantyDefinition } from "@prisma/client";
// import { ResourcePicker, useAppBridge } from '@shopify/app-bridge-react'; // Re-added - Linter says ResourcePicker doesn't exist
// import { useAppBridge } from '@shopify/app-bridge-react'; // Commented out as ResourcePicker is removed again
// import { getSession, commitSession } from "../sessions.server"; // Removed session functions

// --- Local Type Definitions ---

// Define PriceType locally as it's not exported/found in @prisma/client
enum PriceType {
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  PERCENTAGE = 'PERCENTAGE',
}

// --- Type Definitions ---

// Type for data loaded by the loader, adjusted for JSON serialization (Dates become strings)
// Removed association fields again as they aren't in the schema
interface WarrantyDefinitionFromLoader extends Omit<WarrantyDefinition, 'createdAt' | 'updatedAt' | 'priceType' | 'associationType' | 'associatedProductIds' | 'associatedCollectionIds'> {
  createdAt: string;
  updatedAt: string;
  priceType: PriceType; // Use local enum
  // associationType: WarrantyAssociationType; // Removed again
  // associatedProductIds: string[]; // Removed again
  // associatedCollectionIds: string[]; // Removed again
}

interface LoaderData {
  warrantyDefinitions: WarrantyDefinitionFromLoader[];
  // No success message from loader
}

// Action function return types - All actions return JSON
interface ActionDataSuccess {
  status: 'success';
  message: string;
  definition?: WarrantyDefinitionFromLoader; // For create/update
  deletedId?: number; // For delete
}

interface ActionDataError {
  status: 'error';
  message: string;
  errors?: Record<string, string>;
  fieldValues?: Record<string, any>;
}

type ActionData = ActionDataSuccess | ActionDataError;


// Loader: Fetch warranty definitions ONLY
export const loader = async ({ request }: LoaderFunctionArgs): Promise<TypedResponse<LoaderData>> => {
  console.log("🚨 SPARK LOADER START 🚨");

  // Removed session logic

  try {
    const definitionsDb = await prisma.warrantyDefinition.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        durationMonths: true,
        priceType: true,
        priceValue: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    const definitionsFrontend: WarrantyDefinitionFromLoader[] = definitionsDb.map(def => ({
        ...def,
        priceType: def.priceType as PriceType,
        createdAt: def.createdAt.toISOString(),
        updatedAt: def.updatedAt.toISOString(),
    }));

    // Return only definitions
    return json({ warrantyDefinitions: definitionsFrontend });

  } catch (error) {
    console.error("🚨 SPARK LOADER ERROR 🚨:", error);
    throw error;
  }
};


// Action: Handle Create, Update, Delete and return JSON response
export const action = async ({ request }: ActionFunctionArgs): Promise<TypedResponse<ActionData>> => {
  console.log("🚨 SPARK ACTION START 🚨");
  // Removed session logic
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const id = formData.get("id");

  try {
    // --- Delete Action ---
    if (actionType === "delete") {
      if (!id) {
        return json({ status: 'error', message: 'Missing ID for delete' }, { status: 400 });
      }
      try {
        await prisma.warrantyDefinition.delete({ where: { id: Number(id) } });
        console.log(`Deleted definition ${id}`);
        // Return JSON success for fetcher
        return json({ status: 'success', message: 'Warranty definition deleted successfully.', deletedId: Number(id) });
      } catch (error: any) {
          if (error.code === 'P2025') {
              console.error(`Attempted to delete non-existent definition ${id}`);
              return json({ status: 'error', message: 'Warranty definition not found for deletion.' }, { status: 404 });
          }
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
    // const associationType = formData.get("associationType") as WarrantyAssociationType; // Removed again
    // const associatedProductIdsStr = formData.get("associatedProductIds") as string || '[]'; // Removed again
    // const associatedCollectionIdsStr = formData.get("associatedCollectionIds") as string || '[]'; // Removed again

    // Basic Validation
    const errors: Record<string, string> = {};
    if (!name) errors.name = "Name is required";
    if (!durationMonths || isNaN(parseInt(durationMonths, 10))) errors.durationMonths = "Duration must be a number";
    if (!priceType || !Object.values(PriceType).includes(priceType)) errors.priceType = "Price type is required";
    if (!priceValue || isNaN(parseFloat(priceValue))) errors.priceValue = "Price value must be a number";
    // No association validation needed now

    if (Object.keys(errors).length > 0) {
      const fieldValues = Object.fromEntries(formData);
      return json({ status: 'error', message: 'Validation failed', errors, fieldValues }, { status: 400 });
    }

    // Prepare data for Prisma
    const dataToSave = {
      name,
      durationMonths: parseInt(durationMonths, 10),
      priceType,
      priceValue: priceType === PriceType.FIXED_AMOUNT
                    ? Math.round(parseFloat(priceValue) * 100)
                    : parseInt(priceValue, 10),
      description: description || null,
      // associationType: associationType, // Removed again
      // associatedProductIds: associatedProductIds, // Removed again
      // associatedCollectionIds: associatedCollectionIds, // Removed again
    };

    let savedDefinitionDb;
    let successMessage: string;

    if (actionType === "update" && id) {
      // Update existing definition
      savedDefinitionDb = await prisma.warrantyDefinition.update({
        where: { id: Number(id) },
        data: dataToSave,
      });
      successMessage = "Warranty definition updated successfully";
      console.log(`Updated definition ${id}`);
    } else {
      // Create new definition
      savedDefinitionDb = await prisma.warrantyDefinition.create({
        data: dataToSave,
      });
      successMessage = "Warranty definition created successfully";
      console.log(`Created new definition ${savedDefinitionDb.id}`);
    }

    // Manually construct the serialized version for the response
    const responseDefinition: WarrantyDefinitionFromLoader = {
        ...savedDefinitionDb,
        priceType: savedDefinitionDb.priceType as PriceType,
        createdAt: savedDefinitionDb.createdAt.toISOString(),
        updatedAt: savedDefinitionDb.updatedAt.toISOString(),
    };

    // Return JSON success for fetcher
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
  // Read loader data (only definitions now)
  const { warrantyDefinitions: initialWarrantyDefinitions } = useLoaderData<LoaderData>();

  // State for definitions
  const [warrantyDefinitions, setWarrantyDefinitions] = useState<WarrantyDefinitionFromLoader[]>(initialWarrantyDefinitions);
  // Local state for success message (set by fetcher)
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Ref for auto-dismiss timeout
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetcher = useFetcher<ActionData>();
  // const appBridge = useAppBridge(); // Removed again

  // Form State (Create/Edit Modal)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    durationMonths: '',
    priceType: PriceType.FIXED_AMOUNT,
    priceValue: '',
    description: '',
    // associationType: WarrantyAssociationType.ALL_PRODUCTS, // Removed again
  });

  // State for Delete Confirmation Modal (Added)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [definitionIdToDelete, setDefinitionIdToDelete] = useState<number | null>(null);

  // State for Resource Picker (Removed again)
  // const [pickerOpen, setPickerOpen] = useState(false);
  // const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  // const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>([]);

  // --- Modal Handlers --- (Moved up)

  const handleOpenModalForCreate = useCallback(() => {
    setEditingId(null);
    setFormState({ name: '', durationMonths: '', priceType: PriceType.FIXED_AMOUNT, priceValue: '', description: '' });
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((definition: WarrantyDefinitionFromLoader) => {
    setEditingId(definition.id);
    setFormState({
        name: definition.name,
        durationMonths: definition.durationMonths.toString(),
        priceType: definition.priceType,
        priceValue: definition.priceType === PriceType.FIXED_AMOUNT
                      ? (definition.priceValue / 100).toFixed(2)
                      : definition.priceValue.toString(),
        description: definition.description || '',
    });
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
    // Optionally clear form-related errors when closing the modal
    if (fetcher.data?.status === 'error' && fetcher.data.errors) {
       // Consider clearing fetcher.data if errors should not persist
    }
  }, [fetcher.data]);

  // Handlers for Delete Confirmation Modal (Moved up)
  const handleOpenDeleteModal = useCallback((id: number) => {
    setDefinitionIdToDelete(id);
    setDeleteModalOpen(true);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setDefinitionIdToDelete(null);
    setDeleteModalOpen(false);
     if (fetcher.data?.status === 'error' && fetcher.formData?.get('actionType') === 'delete') {
       // Consider clearing fetcher.data if errors should not persist
     }
  }, [fetcher]); // Added fetcher dependency

  const handleDeleteDefinition = useCallback(() => {
    if (definitionIdToDelete !== null) {
        const formData = new FormData();
        formData.append('actionType', 'delete');
        formData.append('id', String(definitionIdToDelete));
        fetcher.submit(formData, { method: 'post' });
    }
  }, [definitionIdToDelete, fetcher]);

  // --- Input Handlers --- (Moved up)
  const handleInputChange = useCallback((value: string, field: keyof Omit<typeof formState, 'priceType'>) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSelectChange = useCallback((value: PriceType, field: 'priceType') => {
      setFormState(prev => ({ ...prev, [field]: value }));
  }, []);


  // --- Effects --- (Grouped together)

  // Effect to handle ALL fetcher results (CUD success and errors)
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      const data = fetcher.data;

      if (data.status === 'success') {
        // Always set success message on success
        setSuccessMessage(data.message!); // Assert non-null for success

        // Handle Create/Update success
        if (data.definition) {
             console.log("Create/Update successful:", data.message);
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
             handleCloseModal(); // Close create/edit modal
        }
        // Handle Delete success
        else if (data.deletedId) {
             console.log("Delete successful:", data.message);
             setWarrantyDefinitions(prevDefs =>
               prevDefs.filter(def => def.id !== data.deletedId)
             );
             handleCloseDeleteModal(); // Close delete modal
        }

      } else if (data.status === 'error') {
        console.error("Action failed:", data.message);
        // Repopulate form state if validation errors occurred during create/edit
        if (modalOpen && data.errors && data.fieldValues) {
            const values = data.fieldValues as typeof formState;
             setFormState({
                 name: values.name || '',
                 durationMonths: values.durationMonths || '',
                 priceType: (Object.values(PriceType).includes(values.priceType as PriceType) ? values.priceType : PriceType.FIXED_AMOUNT) as PriceType,
                 priceValue: values.priceValue || '',
                 description: values.description || '',
             });
        }
      }
    }
  }, [fetcher.state, fetcher.data, handleCloseModal, handleCloseDeleteModal]);

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


  // Resource Picker Logic (Removed again)
  // const handleOpenPicker = (selectsCollections: boolean) => { ... };
  // const handleResourceSelection = (selectPayload: any) => { ... };

  // --- JSX Render ---
  return (
    <Page
        title="Warranty Definitions"
        primaryAction={{ content: 'Create Definition', onAction: handleOpenModalForCreate }}
    >
      <Frame> {/* Frame is needed for Toasts and potentially Modals */}
        <BlockStack gap="500">
          {/* Display Success Banner (controlled by local state) */}
          {successMessage && (
              <Banner title="Success" tone="success" onDismiss={() => setSuccessMessage(null)}>
                  <p>{successMessage}</p>
              </Banner>
          )}
          {/* Display Fetcher Error Banner */}
          {fetcher.data?.status === 'error' && fetcher.state === 'idle' && (
              <Banner
                  title="Error"
                  tone='critical'
                  // onDismiss={() => { /* Clear fetcher error? */ }}
              >
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

          {/* Resource Picker Component (Removed again) */}
           {/* {pickerOpen && ( ... )} */}

          {/* Modal for Create/Edit */}
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
                formData.append('name', formState.name);
                formData.append('durationMonths', formState.durationMonths);
                formData.append('priceType', formState.priceType);
                formData.append('priceValue', formState.priceValue);
                formData.append('description', formState.description);
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
                  onChange={(value) => handleInputChange(value, 'name')}
                  autoComplete="off"
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen && (fetcher.formData?.get('actionType') === 'create' || fetcher.formData?.get('actionType') === 'update') ? fetcher.data.errors?.name : undefined}
                />
                 <TextField
                  label="Duration (Months)"
                  type="number"
                  value={formState.durationMonths}
                  onChange={(value) => handleInputChange(value, 'durationMonths')}
                  autoComplete="off"
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen && (fetcher.formData?.get('actionType') === 'create' || fetcher.formData?.get('actionType') === 'update') ? fetcher.data.errors?.durationMonths : undefined}
                />
                 <Select
                  label="Price Type"
                  options={[
                    { label: 'Fixed Amount ($)', value: PriceType.FIXED_AMOUNT },
                    { label: 'Percentage (%)', value: PriceType.PERCENTAGE },
                  ]}
                  value={formState.priceType}
                  onChange={(value) => handleSelectChange(value as PriceType, 'priceType')}
                  requiredIndicator
                  error={fetcher.data?.status === 'error' && modalOpen && (fetcher.formData?.get('actionType') === 'create' || fetcher.formData?.get('actionType') === 'update') ? fetcher.data.errors?.priceType : undefined}
                />
                 <TextField
                  label={formState.priceType === PriceType.FIXED_AMOUNT ? "Price ($)" : "Price (%)"}
                  type="number"
                  prefix={formState.priceType === PriceType.FIXED_AMOUNT ? '$' : undefined}
                  suffix={formState.priceType === PriceType.PERCENTAGE ? '%' : undefined}
                  value={formState.priceValue}
                  onChange={(value) => handleInputChange(value, 'priceValue')}
                  autoComplete="off"
                  requiredIndicator
                  step={formState.priceType === PriceType.FIXED_AMOUNT ? 0.01 : 1}
                  min="0"
                  error={fetcher.data?.status === 'error' && modalOpen && (fetcher.formData?.get('actionType') === 'create' || fetcher.formData?.get('actionType') === 'update') ? fetcher.data.errors?.priceValue : undefined}
                />
                <TextField
                  label="Description (Optional)"
                  value={formState.description}
                  onChange={(value) => handleInputChange(value, 'description')}
                  autoComplete="off"
                  multiline={3}
                />

                {/* Association Type Selector (Removed again) */}
                {/* <Select ... /> */}

                {/* Conditional UI for Specific Products/Collections (Removed again) */}
                 {/* {formState.associationType === ... && ( ... )} */}

              </FormLayout>
            </Modal.Section>
          </Modal>

          {/* Delete Confirmation Modal (Added) */}
          <Modal
              open={deleteModalOpen}
              onClose={handleCloseDeleteModal}
              title="Delete Warranty Definition?"
              primaryAction={{
                  content: 'Delete',
                  destructive: true,
                  onAction: handleDeleteDefinition,
                  loading: fetcher.state !== 'idle' && fetcher.formData?.get('actionType') === 'delete',
                  disabled: fetcher.state !== 'idle',
              }}
              secondaryActions={[
                  {
                      content: 'Cancel',
                      onAction: handleCloseDeleteModal,
                      disabled: fetcher.state !== 'idle',
                  },
              ]}
          >
              <Modal.Section>
                  <Text as="p">
                      Are you sure you want to delete this warranty definition? This action cannot be undone.
                  </Text>
              </Modal.Section>
          </Modal>

          {/* Warranty Definitions Table */}
          <Card padding="0">
              {warrantyDefinitions.length > 0 ? (
                  <IndexTable
                      itemCount={warrantyDefinitions.length}
                      headings={[
                          { title: 'Name' },
                          { title: 'Duration' },
                          { title: 'Price' },
                          // { title: 'Applies To' }, // Removed again
                          { title: 'Actions' },
                      ]}
                      selectable={false}
                  >
                      {warrantyDefinitions.map((definition, index) => (
                        <IndexTable.Row id={String(definition.id)} key={definition.id} position={index}>
                            <IndexTable.Cell>{definition.name}</IndexTable.Cell>
                            <IndexTable.Cell>{definition.durationMonths} months</IndexTable.Cell>
                            <IndexTable.Cell>
                                {definition.priceType === PriceType.FIXED_AMOUNT
                                    ? `$${(definition.priceValue / 100).toFixed(2)}` // Display as dollars
                                    : `${definition.priceValue}%`}
                            </IndexTable.Cell>
                             {/* <IndexTable.Cell> ... </IndexTable.Cell> */}
                            <IndexTable.Cell>
                              <ButtonGroup>
                                  <Button onClick={() => handleEdit(definition)}>Edit</Button>
                                  {/* Updated Delete Button to open confirmation modal */}
                                  <Button
                                      variant="primary"
                                      tone="critical"
                                      onClick={() => handleOpenDeleteModal(definition.id)}
                                      disabled={fetcher.state !== 'idle'}
                                  >
                                      Delete
                                  </Button>
                                  {/* Old fetcher.Form removed
                                  <fetcher.Form method="post" style={{ display: 'inline-block' }}>
                                      <input type="hidden" name="actionType" value="delete" />
                                      <input type="hidden" name="id" value={definition.id} />
                                      <Button submit variant="primary" tone="critical" disabled={fetcher.state !== 'idle'}>Delete</Button>
                                   </fetcher.Form>
                                  */}
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

// Helper function formatAssociationType removed 