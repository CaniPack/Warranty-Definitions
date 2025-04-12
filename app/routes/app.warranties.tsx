// app/routes/app.warranties.tsx

import { json, LoaderFunctionArgs, ActionFunctionArgs, TypedResponse, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
  useNavigate,
  // Form, // Removed as fetcher.Form is used
} from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Frame, Modal, FormLayout, TextField, Select, Banner,
  Toast, InlineStack, ButtonGroup, EmptyState // Added ButtonGroup, EmptyState
} from "@shopify/polaris";
import prisma from "~/db.server"; // Import the Prisma client
// import { WarrantyDefinition, WarrantyAssociationType } from "@prisma/client"; // Re-added WarrantyAssociationType - Linter says it doesn't exist
import { WarrantyDefinition } from "@prisma/client";
// import { ResourcePicker, useAppBridge } from '@shopify/app-bridge-react'; // Re-added - Linter says ResourcePicker doesn't exist
// import { useAppBridge } from '@shopify/app-bridge-react'; // Commented out as ResourcePicker is removed again
import { getSession, commitSession } from "../sessions.server"; // Import session functions

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
  successMessage?: string | null; // Message from session flash
}

// Action function return types
interface ActionDataSuccess {
  status: 'success';
  // No longer returning definition/id directly on success, redirecting instead
  message?: string; // Can keep for consistency but won't be used if redirecting
  deletedId?: number;
}

interface ActionDataError {
  status: 'error';
  message: string;
  errors?: Record<string, string>; // Optional field-specific errors
  fieldValues?: Record<string, any>; // Added back to repopulate form on error
}

type ActionData = ActionDataSuccess | ActionDataError; // Success type is less relevant now


// Loader: Fetch warranty definitions and read flash message
export const loader = async ({ request }: LoaderFunctionArgs): Promise<TypedResponse<LoaderData>> => {
  console.log("🚨 SPARK LOADER START 🚨");

  // Get session and potential flash message
  const session = await getSession(request.headers.get("Cookie"));
  const successMessage = session.get("successMessage") as string | null || null; // Read flash message

  try {
    // Fetch definitions - removed association fields from select again
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
        // associationType: true,         // Removed again
        // associatedProductIds: true,    // Removed again
        // associatedCollectionIds: true, // Removed again
      }
    });

    // Manually map to ensure correct types for the frontend
    const definitionsFrontend: WarrantyDefinitionFromLoader[] = definitionsDb.map(def => ({
        ...def,
        priceType: def.priceType as PriceType, // Cast to local enum
        createdAt: def.createdAt.toISOString(),
        updatedAt: def.updatedAt.toISOString(),
        // No association fields to map
    }));

    // Return data and commit session (to clear flash message from cookie)
    return json(
        { warrantyDefinitions: definitionsFrontend, successMessage },
        { headers: { "Set-Cookie": await commitSession(session) } }
    );

  } catch (error) {
    console.error("🚨 SPARK LOADER ERROR 🚨:", error);
    // Commit session even on error? Might depend on desired behavior.
    // For now, just rethrow, session commit won't happen.
    throw error; // Ensure a Response or Error is thrown
  }
};


// Action: Handle Create, Update, Delete and set flash message on success
export const action = async ({ request }: ActionFunctionArgs): Promise<TypedResponse<ActionData> | Response> => {
  console.log("🚨 SPARK ACTION START 🚨");
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const id = formData.get("id"); // Used for update/delete

  try {
    // --- Delete Action ---
    if (actionType === "delete") {
      if (!id) {
        return json({ status: 'error', message: 'Missing ID for delete' }, { status: 400 });
      }
      try {
        await prisma.warrantyDefinition.delete({ where: { id: Number(id) } });
        console.log(`Deleted definition ${id}`);
        // Return JSON success for fetcher to handle UI update immediately
        return json({ status: 'success', message: 'Warranty definition deleted successfully.', deletedId: Number(id) });
        // // Set flash message and redirect (Removed - Causes delayed UI update)
        // session.flash("successMessage", "Warranty definition deleted successfully.");
        // return redirect("/app/warranties", {
        //     headers: { "Set-Cookie": await commitSession(session) }
        // });
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
    const priceType = formData.get("priceType") as PriceType; // Use local enum
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
      // Return validation errors for fetcher to handle
      return json({ status: 'error', message: 'Validation failed', errors, fieldValues }, { status: 400 });
    }

    // Prepare data for Prisma (convert types)
    const dataToSave = {
      name,
      durationMonths: parseInt(durationMonths, 10),
      priceType, // Save the string enum value
      priceValue: priceType === PriceType.FIXED_AMOUNT
                    ? Math.round(parseFloat(priceValue) * 100) // Convert dollars to cents
                    : parseInt(priceValue, 10), // Percentage stored as integer (e.g., 10 for 10%)
      description: description || null, // Handle empty description
      // associationType: associationType, // Removed again
      // associatedProductIds: associatedProductIds, // Removed again
      // associatedCollectionIds: associatedCollectionIds, // Removed again
    };

    let successMessage: string;

    if (actionType === "update" && id) {
      // Update existing definition
      await prisma.warrantyDefinition.update({
        where: { id: Number(id) },
        data: dataToSave,
      });
      successMessage = "Warranty definition updated successfully";
      console.log(`Updated definition ${id}`);
    } else {
      // Create new definition
      const newDef = await prisma.warrantyDefinition.create({
        data: dataToSave,
      });
      successMessage = "Warranty definition created successfully";
      console.log(`Created new definition ${newDef.id}`);
    }

    // Set flash message and redirect *only for create/update*
    session.flash("successMessage", successMessage);
    return redirect("/app/warranties", {
        headers: { "Set-Cookie": await commitSession(session) }
    });

  } catch (error: any) {
    console.error("🚨 SPARK ACTION ERROR 🚨:", error);
    // Handle generic errors (like unique constraints P2002)
    let errorMessage = `Failed to ${actionType || 'save'} definition: ${error.message || 'Unknown error'}`;
    let status = 500;
    if (error.code === 'P2002') {
        errorMessage = 'A definition with similar key fields might already exist.';
        status = 409; // Conflict
    }
    // Return JSON error for fetcher
    return json({ status: 'error', message: errorMessage }, { status });
  }
};


// --- Frontend Component ---
export default function WarrantyDefinitionsPage() {
  // Read loader data, including potential flash message
  const { warrantyDefinitions: initialWarrantyDefinitions, successMessage: initialSuccessMessage } = useLoaderData<LoaderData>();

  // State for the definitions (updated by page loads)
  const [warrantyDefinitions, setWarrantyDefinitions] = useState<WarrantyDefinitionFromLoader[]>(initialWarrantyDefinitions);
  // Local state for success message (initialized from loader flash message)
  const [successMessage, setSuccessMessage] = useState<string | null>(initialSuccessMessage || null);
  // Ref for the auto-dismiss timeout
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  // const appBridge = useAppBridge(); // Removed again

  // Form State (Create/Edit Modal)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    durationMonths: '',
    priceType: PriceType.FIXED_AMOUNT, // Use local enum default
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
    setFormState({ // Reset form
      name: '',
      durationMonths: '',
      priceType: PriceType.FIXED_AMOUNT, // Use local enum
      priceValue: '',
      description: '',
    });
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback((definition: WarrantyDefinitionFromLoader) => {
    setEditingId(definition.id);
    setFormState({
        name: definition.name,
        durationMonths: definition.durationMonths.toString(), // Convert number to string for input
        priceType: definition.priceType, // Use local enum
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
    if (fetcher.data?.status === 'error' && fetcher.data.errors) {
        // Maybe clear form state here too?
    }
  }, [fetcher.data]); // Added fetcher.data dependency

  // Handlers for Delete Confirmation Modal (Moved up)
  const handleOpenDeleteModal = useCallback((id: number) => {
    setDefinitionIdToDelete(id);
    setDeleteModalOpen(true);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setDefinitionIdToDelete(null);
    setDeleteModalOpen(false);
     if (fetcher.data?.status === 'error' && fetcher.formData?.get('actionType') === 'delete') {
        // Maybe clear fetcher.data?
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

  // Effect to handle fetcher results (errors OR delete success)
  useEffect(() => {
    // Ensure fetcher is idle and has data
    if (fetcher.state === 'idle' && fetcher.data) {
      const data = fetcher.data;

      if (data.status === 'success') {
        // Handle Delete success (receives JSON response)
        if (data.deletedId) {
             console.log("Delete successful (via fetcher):", data.message);
             // Set message state first
             setSuccessMessage(data.message!); // Show success message (Assert non-null)
             // Update definitions state based on previous state
             setWarrantyDefinitions(prevDefs =>
               prevDefs.filter(def => def.id !== data.deletedId)
             ); // Update state immediately
             // Close modal after state updates are queued
             handleCloseDeleteModal(); // Close delete confirmation modal
        }
        // Create/Update success is handled by page reload after redirect.

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
        // Note: Errors during delete are shown in the banner, modal might stay open or close depending on preference.
      }
    }
    // Now includes handleCloseDeleteModal which is defined above
  }, [fetcher.state, fetcher.data, modalOpen, handleCloseDeleteModal]);

  // Effect to auto-dismiss success message banner (from loader OR delete fetcher response)
  useEffect(() => {
    // Clear previous timeout if message changes or component re-renders
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }

    // If there's a success message (either from loader or fetcher response), set timeout
    if (successMessage) {
       successTimeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimeoutRef.current = null;
      }, 5000);
    }

    // Cleanup function
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
    // Now depends on the local successMessage state, not just initialSuccessMessage
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
          {/* Display Success Banner (from flash message) */}
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
                  // onDismiss={() => fetcher.data = undefined} // Avoid direct mutation
              >
                  <p>{fetcher.data.message}</p>
                  {/* Display field-specific errors if they exist (usually from create/edit) */}
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
              // Loading state applies to create/update actions
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
                  // Show error only if fetcher failed for create/update and modal is open
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