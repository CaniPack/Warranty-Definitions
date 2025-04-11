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

// Action: Handles different intents, including 'create' and 'delete'
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
  }

  // Handle other intents
  console.warn(`Unhandled intent: ${intent}`);
  return json({ status: 'error', errors: { form: "Invalid operation requested." } }, { status: 400 });
};


// --- Frontend Component ---
export default function WarrantyDefinitionsPage() {
  const { warrantyDefinitions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  // Restore Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toggleToastActive = useCallback(() => setToastActive((active) => !active), []);

  // --- State ---
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const handleOpenCreateModal = useCallback(() => setCreateModalOpen(true), []);
  const handleCloseCreateModal = useCallback(() => setCreateModalOpen(false), []);

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

   useEffect(() => {
       if (createModalOpen) {
           setFormState({ name: '', durationMonths: '12', priceType: 'PERCENTAGE', priceValue: '10', description: '' });
       }
   }, [createModalOpen]);

  // Handle fetcher completion (Create and Delete)
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
        const data = fetcher.data;

        if (typeof data === 'object' && data !== null && data.status === 'success') {
          const successData = data as { message: string }; 
          // Close the correct modal based on which one was likely open
          // A more robust way might check fetcher.formData if needed
          if (createModalOpen) handleCloseCreateModal();
          if (deleteModalOpen) handleCloseDeleteModal(); // <<< CLOSE DELETE MODAL
          
          setToastMessage(successData.message);
          setToastActive(true);
        } 
        else if (typeof data === 'object' && data !== null && data.status === 'error' && 'fieldValues' in data) {
          const errorData = data as { fieldValues: any; errors?: Record<string, string> | { form: string } };
          const values = errorData.fieldValues;
          if (values) {
              setFormState({
                  name: values.name || '',
                  durationMonths: values.durationMonths || '12',
                  priceType: values.priceType || 'PERCENTAGE',
                  priceValue: values.priceValue || '10',
                  description: values.description || '',
              });
          }
          // Optional: Show error toast using state
          if (errorData.errors && 'form' in errorData.errors) {
              // You could set an error message and activate the toast here too
              // setToastMessage(errorData.errors.form);
              // setToastActive(true);
              // If showing error toasts, you'll need logic to set the tone dynamically
          }
        }
    }
    // Add handleCloseDeleteModal to dependency array
  }, [fetcher.state, fetcher.data, handleCloseCreateModal, handleCloseDeleteModal, createModalOpen, deleteModalOpen]); 

  // Extract errors safely based on status
  let errors: Record<string, string> | { form: string } | null = null;
  if (fetcher.state === 'idle' && fetcher.data && typeof fetcher.data === 'object' && fetcher.data.status === 'error' && 'errors' in fetcher.data) {
      errors = fetcher.data.errors as Record<string, string> | { form: string };
  }
                 
  const fieldErrors = (errors && !('form' in errors)) ? errors as Record<string, string> : null;
  const generalFormError = (errors && 'form' in errors) ? errors.form : null;

  const resourceName = {
    singular: 'warranty definition',
    plural: 'warranty definitions',
  };

  // Modal Markup (ensure form fields use calculated errors)
  const createModalMarkup = (
      <Modal
          open={createModalOpen}
          onClose={handleCloseCreateModal}
          title="Create New Warranty Definition"
          primaryAction={{
              content: 'Save',
              // Use fetcher.submit with the form ID when clicked
              onAction: () => {
                  const form = document.getElementById('create-warranty-form');
                  if (form instanceof HTMLFormElement) {
                      fetcher.submit(form);
                  } else {
                      console.error("Could not find form#create-warranty-form to submit");
                  }
              },
              loading: fetcher.state !== 'idle',
          }}
          secondaryActions={[
              {
                  content: 'Cancel',
                  onAction: handleCloseCreateModal,
                  disabled: fetcher.state !== 'idle',
              },
          ]}
      >
          <Modal.Section>
              <fetcher.Form method="post" id="create-warranty-form">
                  <input type="hidden" name="intent" value="create" />
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
                     {warrantyDefinitions.map((definition: any, index: number) => (
                       <IndexTable.Row
                         id={definition.id?.toString() ?? `row-${index}`}
                         key={definition.id ?? index}
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
                                <Button size="slim" disabled>Edit</Button>
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
        {createModalMarkup}
        {deleteModalMarkup}
      </Page>
    </Frame>
  );
} 