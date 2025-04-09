// app/routes/app.warranties.tsx

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useActionData } from "@remix-run/react";
import {
  Page, Card, Layout, BlockStack, Text, IndexTable, Button, Modal,
  FormLayout, TextField, Select, Banner
} from "@shopify/polaris";
import prisma from "~/db.server"; // Import the Prisma client
import type { WarrantyDefinition } from "@prisma/client"; // Import the type
import { useState, useCallback, useEffect } from "react"; // <-- Import useState, useCallback, useEffect

// Loader function to fetch data before rendering
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // TODO: Add authentication check if not handled globally
  const warrantyDefinitions = await prisma.warrantyDefinition.findMany({
    orderBy: { createdAt: "desc" }, // Show newest first
  });
  return json({ warrantyDefinitions });
};

// Action function to handle form submissions (POST requests)
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const name = formData.get("name") as string;
    const durationMonthsStr = formData.get("durationMonths") as string;
    const priceType = formData.get("priceType") as string;
    const priceValueStr = formData.get("priceValue") as string;
    const description = formData.get("description") as string | null;

    const errors: Record<string, string> = {};

    if (!name) errors.name = "Name is required.";
    if (!durationMonthsStr) errors.durationMonths = "Duration is required.";
    if (!priceType) errors.priceType = "Price type is required.";
    if (!priceValueStr) errors.priceValue = "Price value is required.";

    let durationMonths = NaN;
    if (durationMonthsStr) {
       durationMonths = parseInt(durationMonthsStr, 10);
       if (isNaN(durationMonths) || durationMonths <= 0) {
           errors.durationMonths = "Duration must be a positive number.";
       }
    }

    let priceValue = NaN;
     if (priceValueStr) {
        priceValue = parseFloat(priceValueStr);
        if (isNaN(priceValue) || priceValue < 0) {
            errors.priceValue = "Price value must be a non-negative number.";
        }
     }

    if (priceType !== "PERCENTAGE" && priceType !== "FIXED") {
       errors.priceType = "Invalid price type selected.";
    }

    // If any errors, return them
    if (Object.keys(errors).length > 0) {
      // Return original form data along with errors
       return json({ errors, fieldValues: Object.fromEntries(formData) }, { status: 400 });
    }

    try {
      await prisma.warrantyDefinition.create({
        data: {
          name,
          durationMonths,
          priceType,
          priceValue,
          description: description || null, // Ensure null if empty string
        },
      });
       // Redirect on success to refresh data via loader and show the list
       // Or return json({ success: true }); if we want to handle refresh differently
       return redirect("/app/warranties");
    } catch (error) {
      console.error("Failed to create warranty definition:", error);
      // Handle potential unique constraint errors if name should be unique
      // if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      //    return json({ errors: { name: "A definition with this name already exists." }, fieldValues: Object.fromEntries(formData) }, { status: 400 });
      // }
      return json({ errors: { form: "Failed to save warranty definition to the database." }, fieldValues: Object.fromEntries(formData) }, { status: 500 });
    }
  }

  // TODO: Handle other intents (like delete) later
  return json({ errors: { form: "Invalid operation requested." } }, { status: 400 });
};

// Frontend Component
export default function WarrantyDefinitionsPage() {
  const { warrantyDefinitions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>(); // Get data returned from action (errors, etc.)
  const submit = useSubmit(); // Hook for programmatic submission

  // State for modal visibility
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const handleOpenCreateModal = useCallback(() => {
     // Reset form state when opening modal
     setFormState({
         name: '',
         durationMonths: '12',
         priceType: 'PERCENTAGE',
         priceValue: '10',
         description: '',
     });
     setFormErrors({}); // Clear previous errors
     setIsCreateModalOpen(true);
  }, []);
  const handleCloseCreateModal = useCallback(() => setIsCreateModalOpen(false), []);

  // State for form fields within the modal
   const [formState, setFormState] = useState({
       name: '',
       durationMonths: '12',
       priceType: 'PERCENTAGE',
       priceValue: '10',
       description: '',
   });

   // State for displaying validation errors
   const [formErrors, setFormErrors] = useState<Record<string, string>>({});

   // Effect to handle action data (validation errors or closing modal on success)
   useEffect(() => {
       // Check specifically if actionData has errors AND fieldValues
       if (actionData?.errors && 'fieldValues' in actionData && actionData.fieldValues) {
           setFormErrors(actionData.errors);
           // Type guard ensures fieldValues exists here
           const currentValues = actionData.fieldValues as Record<string, string>;
           setFormState({
               name: currentValues.name || '',
               durationMonths: currentValues.durationMonths || '12',
               priceType: currentValues.priceType || 'PERCENTAGE',
               priceValue: currentValues.priceValue || '10',
               description: currentValues.description || '',
           });
           setIsCreateModalOpen(true); // Ensure modal stays open on error
       } else if (actionData?.errors) {
           // Handle general form errors (no fieldValues returned)
           setFormErrors(actionData.errors);
           setIsCreateModalOpen(true);
       }
       // No explicit 'else' needed for success, as the action redirects,
       // causing the component to unmount/remount or the loader to refetch.
       // Closing the modal here might cause a flicker if redirect is slightly delayed.
   }, [actionData]); // Dependency array only needs actionData

   const handleFormChange = useCallback(
       (value: string, field: keyof typeof formState) => {
           setFormState((prev) => ({ ...prev, [field]: value }));
           // Clear error for this field when user types
            setFormErrors((prevErrors) => {
                const newErrors = { ...prevErrors };
                delete newErrors[field];
                delete newErrors.form; // Clear general form error too
                return newErrors;
            });
       },
       [],
   );

  const resourceName = {
    singular: 'warranty definition',
    plural: 'warranty definitions',
  };

  const handleCreateSubmit = useCallback(() => {
       const form = document.getElementById('create-warranty-form') as HTMLFormElement;
       if (form) {
          setFormErrors({}); // Clear previous errors before submitting
           submit(form); // Submits the form to the action function
           // Don't close modal here - let useEffect handle it based on actionData
       }
   }, [submit]);

  return (
    <Page fullWidth title="Warranty Definitions">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400"> {/* Increased gap */}
               <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                    Manage Warranty Templates
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                    Define the basic rules for your extended warranties (duration, price calculation). You can later assign these definitions to specific products or collections.
                </Text>
               </BlockStack>
               <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                 <Button variant="primary" onClick={handleOpenCreateModal}>
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
                   {warrantyDefinitions.map((definition: WarrantyDefinition, index: number) => (
                     <IndexTable.Row
                       id={definition.id.toString()}
                       key={definition.id}
                       position={index}
                     >
                       <IndexTable.Cell>{definition.name}</IndexTable.Cell>
                       <IndexTable.Cell>{definition.durationMonths} months</IndexTable.Cell>
                       <IndexTable.Cell>
                         {definition.priceType === 'PERCENTAGE'
                           ? `${parseFloat(definition.priceValue.toString()).toFixed(1)}% of product price` // Ensure consistent formatting
                           : `$${parseFloat(definition.priceValue.toString()).toFixed(2)} fixed`}
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

      {/* Create Modal */}
       <Modal
          open={isCreateModalOpen}
          onClose={handleCloseCreateModal}
          title="Create New Warranty Definition"
          primaryAction={{
              content: 'Create',
              onAction: handleCreateSubmit, // Use the submit handler
              // loading: navigation.state === 'submitting', // Optional: show loading state
          }}
          secondaryActions={[
              {
                  content: 'Cancel',
                  onAction: handleCloseCreateModal,
                  disabled: false, // Optional: disable cancel while submitting?
              },
          ]}
      >
          <Modal.Section>
             {/* Wrap fields in Remix Form */}
             <Form method="post" id="create-warranty-form">
                 {/* Hidden input to specify intent */}
                 <input type="hidden" name="intent" value="create" />
                 <FormLayout>
                    {/* Display general form errors */}
                     {formErrors.form && (
                        <Banner title="Error" tone="critical">
                            <p>{formErrors.form}</p>
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
                         error={formErrors.name} // Display specific field error
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
                         error={formErrors.durationMonths}
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
                        error={formErrors.priceType}
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
                         error={formErrors.priceValue}
                     />
                      <TextField
                          label="Description (Optional)"
                          name="description"
                          value={formState.description}
                          onChange={(value) => handleFormChange(value, 'description')}
                          autoComplete="off"
                          multiline={3}
                          helpText="Optional details about the warranty coverage."
                          error={formErrors.description} // Optional: Add validation/error for description if needed
                      />
                 </FormLayout>
             </Form>
          </Modal.Section>
      </Modal>
    </Page>
  );
} 