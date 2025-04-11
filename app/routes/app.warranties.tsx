// app/routes/app.warranties.tsx

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Frame, Modal, FormLayout, TextField, Select, Banner,
  Toast
} from "@shopify/polaris";
import prisma from "~/db.server"; // Import the Prisma client
import type { WarrantyDefinition } from "@prisma/client"; // Usaremos este directamente
import { useState, useEffect, useCallback } from "react"; // <-- Import useState, useEffect, useCallback
// Import ONLY authenticate from shopify.server for this logic
import { authenticate } from "~/shopify.server";
// We are not using the custom session server anymore
// import { getSession, commitSession } from "~/sessions.server";
// Remove AppProvider and polarisStyles imports if they were added here by mistake, they belong in app.tsx
// import { AppProvider } from "@shopify/shopify-app-remix/react";
// import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

// Loader: No changes needed, keep existing logic (without custom session)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("🚨 SPARK LOADER START 🚨");
  try {
    await authenticate.admin(request);
    console.log("🚨 SPARK LOADER: Auth successful");

    const successMessage = null; // Keep flash message logic disabled for now

    if (!prisma) {
      console.error("🚨 SPARK LOADER ERROR: Prisma client is not initialized!");
      throw new Error("Database client not available");
    }

    const warrantyDefinitions = await prisma.warrantyDefinition.findMany({ orderBy: { createdAt: "desc" } });
    console.log("🚨 SPARK LOADER: Definitions fetched:", warrantyDefinitions?.length);

    // Return data for the page (successMessage can be added later if needed via fetcher)
    return json({ warrantyDefinitions, successMessage: null });
  } catch (error) {
    console.error("🚨 SPARK LOADER ERROR 🚨:", error);
    throw error;
  }
};

// Action: Handles create, delete, and update
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    // --- CREATE LOGIC ---
    const name = formData.get("name") as string;
    const durationMonthsStr = formData.get("durationMonths") as string;
    const priceType = formData.get("priceType") as string;
    const priceValueStr = formData.get("priceValue") as string;
    const description = formData.get("description") as string | null;

    const errors: Record<string, string> = {};
    let durationMonths = NaN;
    let priceValue = NaN;

    // Validation
    if (!name) errors.name = "Name is required.";
    if (!durationMonthsStr) errors.durationMonths = "Duration is required.";
    else {
      durationMonths = parseInt(durationMonthsStr, 10);
      if (isNaN(durationMonths) || durationMonths <= 0) {
        errors.durationMonths = "Duration must be a positive number.";
      }
    }
    if (!priceType) errors.priceType = "Price type is required.";
    else if (priceType !== "PERCENTAGE" && priceType !== "FIXED") {
      errors.priceType = "Invalid price type selected.";
    }
    if (!priceValueStr) errors.priceValue = "Price value is required.";
    else {
       priceValue = parseFloat(priceValueStr);
       if (isNaN(priceValue) || priceValue < 0) {
           errors.priceValue = "Price value must be a non-negative number.";
       }
    }

    // Return errors if validation fails
    if (Object.keys(errors).length > 0) {
       return json(
         { status: 'error', errors, fieldValues: Object.fromEntries(formData) },
         { status: 400 }
       );
    }

    // Create in DB if valid
    try {
      const newDefinition = await prisma.warrantyDefinition.create({
        data: { name, durationMonths, priceType, priceValue, description: description || null },
      });
      // Return different success structure including ID
      return json({
         status: 'success',
         message: `Warranty definition "${newDefinition.name}" created successfully!`, 
         newDefinitionId: newDefinition.id
      });
    } catch (error) {
      console.error("Failed to create warranty definition:", error);
      return json(
         { status: 'error', errors: { form: "Failed to save warranty definition to the database." }, fieldValues: Object.fromEntries(formData) },
         { status: 500 }
       );
    }
    // --- END CREATE LOGIC ---
  } else if (intent === "delete") {
    // --- DELETE LOGIC ---
    const idToDeleteStr = formData.get("id") as string; 
    if (!idToDeleteStr) {
      return json({ status: 'error', errors: { form: "Missing ID for deletion." } }, { status: 400 });
    }
    const idToDelete = parseInt(idToDeleteStr, 10);
    if (isNaN(idToDelete)) {
      return json({ status: 'error', errors: { form: "Invalid ID format." } }, { status: 400 });
    }

    try {
      // Find the definition first to get its name
      const definitionToDelete = await prisma.warrantyDefinition.findUnique({
        where: { id: idToDelete },
        select: { name: true } // Only select the name
      });

      if (!definitionToDelete) {
        return json({ status: 'error', errors: { form: "Warranty definition not found." } }, { status: 404 });
      }

      // Now delete it
      await prisma.warrantyDefinition.delete({ where: { id: idToDelete } });
      
      // Return success message with the name
      return json({ 
          status: 'success', 
          message: `Warranty definition "${definitionToDelete.name}" deleted successfully.` 
      });

    } catch (error) {
      console.error("Failed to delete warranty definition:", error);
      return json(
         { status: 'error', errors: { form: "Failed to delete warranty definition." } },
         { status: 500 }
       );
    }
    // --- END DELETE LOGIC ---
  } else if (intent === "update") {
    // --- UPDATE LOGIC ---
    const idToUpdateStr = formData.get("id") as string;
    const name = formData.get("name") as string;
    const durationMonthsStr = formData.get("durationMonths") as string;
    const priceType = formData.get("priceType") as string;
    const priceValueStr = formData.get("priceValue") as string;
    const description = formData.get("description") as string | null;

    if (!idToUpdateStr) {
        return json({ status: 'error', errors: { form: "Missing ID for update." } }, { status: 400 });
    }
    const idToUpdate = parseInt(idToUpdateStr, 10);
     if (isNaN(idToUpdate)) {
       return json({ status: 'error', errors: { form: "Invalid ID format for update." } }, { status: 400 });
     }

    const errors: Record<string, string> = {};
    let durationMonths = NaN;
    let priceValue = NaN;

    // Validation (same as create)
    if (!name) errors.name = "Name is required.";
    if (!durationMonthsStr) errors.durationMonths = "Duration is required.";
    else {
      durationMonths = parseInt(durationMonthsStr, 10);
      if (isNaN(durationMonths) || durationMonths <= 0) errors.durationMonths = "Duration must be a positive number.";
    }
    if (!priceType) errors.priceType = "Price type is required.";
    else if (priceType !== "PERCENTAGE" && priceType !== "FIXED") errors.priceType = "Invalid price type selected.";
    if (!priceValueStr) errors.priceValue = "Price value is required.";
    else {
       priceValue = parseFloat(priceValueStr);
       if (isNaN(priceValue) || priceValue < 0) errors.priceValue = "Price value must be a non-negative number.";
    }

    // Return errors if validation fails
    if (Object.keys(errors).length > 0) {
       return json(
         { status: 'error', errors, fieldValues: Object.fromEntries(formData) }, 
         { status: 400 }
       );
    }

    // Update in DB if valid
    try {
      await prisma.warrantyDefinition.update({
        where: { id: idToUpdate },
        data: { name, durationMonths, priceType, priceValue, description: description || null },
      });
      // Return success message for update
      return json({ status: 'success', message: `Warranty definition "${name}" updated successfully!` });
    } catch (error) {
      console.error("Failed to update warranty definition:", error);
      // Handle potential errors like record not found
      // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') { ... }
      return json(
         { status: 'error', errors: { form: "Failed to update warranty definition." }, fieldValues: Object.fromEntries(formData) },
         { status: 500 }
       );
    }
    // --- END UPDATE LOGIC ---
  }

  // Handle other intents
  console.warn(`Unhandled intent: ${intent}`);
  return json({ status: 'error', errors: { form: "Invalid operation requested." } }, { status: 400 });
};


// --- Frontend Component ---
export default function WarrantyDefinitionsPage() {
  const { warrantyDefinitions: loaderDefinitions } = useLoaderData<typeof loader>(); // Rename loader data
  const fetcher = useFetcher<typeof action>();

  // Restore Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toggleToastActive = useCallback(() => setToastActive((active) => !active), []);

  // --- State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<WarrantyDefinition | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [definitionIdToDelete, setDefinitionIdToDelete] = useState<number | null>(null);
  // Correct handler to set the ID and open the modal
  const handleOpenDeleteModal = useCallback((id: number) => {
      setDefinitionIdToDelete(id);
      setDeleteModalOpen(true);
  }, []);
  const handleCloseDeleteModal = useCallback(() => {
      setDefinitionIdToDelete(null);
      setDeleteModalOpen(false);
  }, []);

  const [formState, setFormState] = useState({
      name: '', durationMonths: '12', priceType: 'PERCENTAGE',
      priceValue: '10', description: '',
  });

  const handleFormChange = useCallback(
       (value: string, field: keyof typeof formState) => {
           setFormState((prev) => ({ ...prev, [field]: value }));
       }, [],
   );

  // Handlers for opening/closing the modal
  const handleOpenCreateModal = useCallback(() => {
      setEditingDefinition(null); // Ensure we are in create mode
      setFormState({ name: '', durationMonths: '12', priceType: 'PERCENTAGE', priceValue: '10', description: '' }); // Reset form
      setModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((definition: WarrantyDefinition) => {
      setEditingDefinition(definition); // Set the definition to edit
      setFormState({
          name: definition.name,
          durationMonths: definition.durationMonths.toString(), 
          priceType: definition.priceType,
          priceValue: definition.priceValue.toString(), 
          description: definition.description || '',
      });
      setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
      setModalOpen(false);
      setEditingDefinition(null); // Clear editing state on close
  }, []);

  // Type warrantyDefinitions explicitly after loader using double assertion
  const warrantyDefinitions = loaderDefinitions as unknown as WarrantyDefinition[];
  
  // Handle fetcher completion
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
        const data = fetcher.data;

        if (typeof data === 'object' && data !== null && data.status === 'success') {
          const successData = data as { message: string }; 
          handleCloseModal(); 
          if (deleteModalOpen) handleCloseDeleteModal();
          setToastMessage(successData.message);
          setToastActive(true);
        } 
        else if (typeof data === 'object' && data !== null && data.status === 'error') {
          const errorData = data as { fieldValues?: any; errors?: Record<string, string> | { form: string } }; 
          // Repopulate form only if fieldValues exists (error during create/update)
          if (modalOpen && errorData.fieldValues) {
             const values = errorData.fieldValues; 
             setFormState({
                 name: values.name || '',
                 durationMonths: values.durationMonths || '12',
                 priceType: values.priceType || 'PERCENTAGE',
                 priceValue: values.priceValue || '10',
                 description: values.description || '',
             });
          }
          // Show form-level error toast 
          if (errorData.errors && 'form' in errorData.errors) { 
              setToastMessage(errorData.errors.form);
              setToastActive(true);
          }
        }
    }
  }, [fetcher.state, fetcher.data, handleCloseModal, handleCloseDeleteModal, modalOpen, deleteModalOpen]);

  // Extract errors safely based on fetcher state and data structure
  let currentErrors: Record<string, string> | { form: string } | null = null;
  if (fetcher.state === 'idle' && fetcher.data && typeof fetcher.data === 'object' && fetcher.data.status === 'error' && 'errors' in fetcher.data) {
      currentErrors = fetcher.data.errors as Record<string, string> | { form: string };
  }
                 
  const fieldErrors = (currentErrors && !('form' in currentErrors)) ? currentErrors as Record<string, string> : null;
  const generalFormError = (currentErrors && 'form' in currentErrors) ? currentErrors.form : null;

  const resourceName = {
    singular: 'warranty definition',
    plural: 'warranty definitions',
  };

  // Create/Edit Modal Markup (replaces createModalMarkup)
  const formModalMarkup = (
      <Modal
          open={modalOpen} // Use single state
          onClose={handleCloseModal} // Use single handler
          title={editingDefinition ? "Edit Warranty Definition" : "Create New Warranty Definition"} // Dynamic title
          primaryAction={{
              content: 'Save',
              onAction: () => {
                  const form = document.getElementById('warranty-form'); // Use consistent ID
                  if (form instanceof HTMLFormElement) { fetcher.submit(form); }
              },
              loading: fetcher.state !== 'idle' && (fetcher.formData?.get('intent') === 'create' || fetcher.formData?.get('intent') === 'update'),
          }}
          secondaryActions={[
              { content: 'Cancel', onAction: handleCloseModal, disabled: fetcher.state !== 'idle' },
          ]}
      >
          <Modal.Section>
              {/* Use the same form ID */}
              <fetcher.Form method="post" id="warranty-form"> 
                  {/* Dynamic intent and optional ID */}
                  <input type="hidden" name="intent" value={editingDefinition ? "update" : "create"} />
                  {editingDefinition && (
                      <input type="hidden" name="id" value={editingDefinition.id} />
                  )}
                  <FormLayout>
                      {generalFormError && (
                           <Banner title="Error saving definition" tone="critical">
                               <p>{generalFormError}</p>
                           </Banner>
                       )}
                       <TextField
                           label="Name"
                           name="name"
                           value={formState.name}
                           onChange={(value) => handleFormChange(value, 'name')}
                           autoComplete="off"
                           requiredIndicator
                           helpText="A descriptive name (e.g., '12-Month Electronics Warranty')."
                           error={fieldErrors?.name}
                       />
                       <TextField
                           label="Duration (Months)"
                           name="durationMonths"
                           type="number"
                           value={formState.durationMonths}
                           onChange={(value) => handleFormChange(value, 'durationMonths')}
                           autoComplete="off"
                           requiredIndicator
                           min={1}
                           error={fieldErrors?.durationMonths}
                       />
                      <Select
                          label="Price Type"
                          name="priceType"
                          options={[
                              { label: 'Percentage of Product Price', value: 'PERCENTAGE' },
                              { label: 'Fixed Amount', value: 'FIXED' },
                          ]}
                          value={formState.priceType}
                          onChange={(value) => handleFormChange(value, 'priceType')}
                          requiredIndicator
                          error={fieldErrors?.priceType}
                      />
                       <TextField
                           label={formState.priceType === 'PERCENTAGE' ? 'Percentage Value (%)' : 'Fixed Price ($)'}
                           name="priceValue"
                           type="number"
                           step={0.01}
                           value={formState.priceValue}
                           onChange={(value) => handleFormChange(value, 'priceValue')}
                           autoComplete="off"
                           requiredIndicator
                           min={0}
                           prefix={formState.priceType === 'FIXED' ? '$' : undefined}
                           suffix={formState.priceType === 'PERCENTAGE' ? '%' : undefined}
                           error={fieldErrors?.priceValue}
                       />
                        <TextField
                            label="Description (Optional)"
                            name="description"
                            value={formState.description}
                            onChange={(value) => handleFormChange(value, 'description')}
                            autoComplete="off"
                            multiline={3}
                        />
                   </FormLayout>
              </fetcher.Form>
          </Modal.Section>
      </Modal>
  );

  // Restore toastMarkup variable (ignoring linter error for tone)
  const toastMarkup = toastActive ? (
    <Toast 
      content={toastMessage} 
      onDismiss={toggleToastActive} 
      tone="success" 
      duration={90000}
    />
  ) : null;

  // Delete Confirmation Modal Markup
  const deleteModalMarkup = (
      <Modal
          open={deleteModalOpen}
          onClose={handleCloseDeleteModal}
          title="Delete Warranty Definition?"
          primaryAction={{
              content: 'Delete',
              destructive: true,
              onAction: () => {
                  if (definitionIdToDelete !== null) {
                     const formData = new FormData();
                     formData.append('intent', 'delete');
                     formData.append('id', definitionIdToDelete.toString());
                     fetcher.submit(formData, { method: 'post' });
                  }
              },
              loading: fetcher.state !== 'idle',
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
  );

  return (
    <Frame>
      <Page fullWidth title="Warranty Definitions">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                 <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                      Manage Warranty Templates
                  </Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                      Define the basic rules for your extended warranties (duration, price calculation). You can later assign these definitions to specific products or collections.
                  </Text>
                 </BlockStack>
                 <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                   <Button
                     variant="primary"
                     onClick={handleOpenCreateModal}
                   >
                     Create Warranty Definition
                   </Button>
                 </div>
                   <IndexTable
                     resourceName={resourceName}
                     itemCount={warrantyDefinitions.length}
                     headings={[
                       { title: 'Name' },
                       { title: 'Duration' },
                       { title: 'Price Rule' },
                       { title: 'Description' },
                       { title: 'Actions' }, // Placeholder for buttons
                     ]}
                     selectable={false}
                   >
                     {warrantyDefinitions.map((definition, index) => (
                       <IndexTable.Row
                         id={definition.id.toString()}
                         key={definition.id}
                         position={index}
                       >
                         <IndexTable.Cell>{definition.name ?? 'N/A'}</IndexTable.Cell>
                         <IndexTable.Cell>{definition.durationMonths ?? '?'} months</IndexTable.Cell>
                         <IndexTable.Cell>
                           {definition.priceType === 'PERCENTAGE'
                             ? `${parseFloat(definition.priceValue?.toString() ?? '0').toFixed(1)}% of product price`
                             : `$${parseFloat(definition.priceValue?.toString() ?? '0').toFixed(2)} fixed`}
                         </IndexTable.Cell>
                         <IndexTable.Cell>{definition.description || '—'}</IndexTable.Cell>
                          <IndexTable.Cell>
                            <BlockStack inlineAlign="start" gap="100">
                                <Button 
                                  size="slim" 
                                  onClick={() => handleOpenEditModal(definition as unknown as WarrantyDefinition)}
                                  disabled={fetcher.state !== 'idle'} 
                               >Edit</Button>
                                <Button 
                                  size="slim" 
                                  variant="tertiary" 
                                  tone="critical"
                                  onClick={() => handleOpenDeleteModal(definition.id)}
                                  disabled={fetcher.state !== 'idle'}
                                 >
                                   Delete
                                 </Button>
                            </BlockStack>
                         </IndexTable.Cell>
                       </IndexTable.Row>
                     ))}
                   </IndexTable>
                   {warrantyDefinitions.length === 0 && (
                     <div style={{ padding: 'var(--p-space-400)', textAlign: 'center' }}> {/* Use Polaris spacing token */}
                       <Text variant="bodyMd" as="p" tone="subdued">
                         No warranty definitions created yet. Click "Create Warranty Definition" to get started.
                       </Text>
                     </div>
                   )}
               </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        {toastMarkup}
        {formModalMarkup}
        {deleteModalMarkup}
      </Page>
    </Frame>
  );
} 