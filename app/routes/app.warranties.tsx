// app/routes/app.warranties.tsx

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button,
  Toast, Frame, Modal, FormLayout, TextField, Select, Banner
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

// Action: Handles different intents, including 'create'
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
         // Return fieldValues so form can re-populate
         { errors, fieldValues: Object.fromEntries(formData) },
         { status: 400 }
       );
    }

    // Create in DB if valid
    try {
      const newDefinition = await prisma.warrantyDefinition.create({
        data: { name, durationMonths, priceType, priceValue, description: description || null },
      });
      // Return success message for the fetcher to handle
      return json({ successMessage: `Warranty definition "${newDefinition.name}" created successfully!` });
    } catch (error) {
      console.error("Failed to create warranty definition:", error);
      // Handle potential unique constraint errors if name should be unique
      // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { ... }
      return json(
         { errors: { form: "Failed to save warranty definition to the database." }, fieldValues: Object.fromEntries(formData) },
         { status: 500 }
       );
    }
    // --- END CREATE LOGIC ---
  }

  // Handle other intents later (e.g., delete)
  console.warn(`Unhandled intent: ${intent}`);
  return json({ errors: { form: "Invalid operation requested." } }, { status: 400 });
};


// --- Frontend Component ---
export default function WarrantyDefinitionsPage() {
  const { warrantyDefinitions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [toastActive, setToastActive] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toggleToastActive = useCallback(() => setToastActive((active) => !active), []);

  const [modalOpen, setModalOpen] = useState(false);
  const handleOpenModal = useCallback(() => setModalOpen(true), []);
  const handleCloseModal = useCallback(() => setModalOpen(false), []);

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
       if (modalOpen) {
           setFormState({ name: '', durationMonths: '12', priceType: 'PERCENTAGE', priceValue: '10', description: '' });
           // Consider resetting fetcher state if needed, though it might reset automatically on new submission
       }
   }, [modalOpen]);

  // Handle fetcher completion with type guards
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
        const data = fetcher.data;
        // Check if successMessage exists
        if (typeof data === 'object' && data !== null && 'successMessage' in data && typeof data.successMessage === 'string') {
          handleCloseModal();
          setToastMessage(data.successMessage);
          setToastActive(true);
        } 
        // Check if fieldValues exists (implies error state for repopulation)
        else if (typeof data === 'object' && data !== null && 'fieldValues' in data && data.fieldValues) {
           const values = data.fieldValues as any; // Use type assertion carefully
           setFormState({
               name: values.name || '',
               durationMonths: values.durationMonths || '12',
               priceType: values.priceType || 'PERCENTAGE',
               priceValue: values.priceValue || '10',
               description: values.description || '',
           });
        }
    }
  }, [fetcher.state, fetcher.data, handleCloseModal]);

  // Extract errors safely from fetcher data
  const errors = (fetcher.state === 'idle' && fetcher.data && typeof fetcher.data === 'object' && 'errors' in fetcher.data) 
                 ? fetcher.data.errors as Record<string, string> | { form: string } 
                 : null;
                 
  const fieldErrors = (errors && !('form' in errors)) ? errors as Record<string, string> : null;
  const generalFormError = (errors && 'form' in errors) ? errors.form : null;

  const toastMarkup = toastActive ? (
    <Toast content={toastMessage} onDismiss={toggleToastActive} />
  ) : null;

  const resourceName = {
    singular: 'warranty definition',
    plural: 'warranty definitions',
  };

  // Modal Markup (ensure form fields use calculated errors)
  const createModalMarkup = (
      <Modal
          open={modalOpen}
          onClose={handleCloseModal}
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
                  onAction: handleCloseModal,
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
                     onClick={handleOpenModal}
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
                            <BlockStack inlineAlign="start" gap="100"> {/* Use BlockStack for button layout */}
                                <Button size="slim" disabled>Edit</Button> {/* TODO: Implement Edit */}
                                <Button size="slim" variant="tertiary" tone="critical" disabled>Delete</Button> {/* TODO: Implement Delete */}
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
      </Page>
    </Frame>
  );
} 